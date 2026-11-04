import { check, CoreError, textValue, id, integer, copy, canonical, fingerprint, digestText, sourceRecord, validateClaim } from "./contracts.mjs";

export const ROLES = Object.freeze(["Scout", "Researcher", "Analyst", "Critic", "Synthesizer"]);
const TERMINAL = ["awaiting_approval", "approved", "rejected", "failed", "needs_revision", "cancelled"];

export class AstraeaCore {
  #runs = new Map();
  #events = new Map();
  #busy = new Set();
  #providers;
  #registry;
  #hash;
  #clock;
  #checkpoint;
  constructor({registry, providers, hash, clock = Date.now, checkpoint = async () => {}}) {
    check(Array.isArray(registry) && registry.length === ROLES.length, "INVALID_REGISTRY");
    this.#registry = copy(registry);
    for (const [index, worker] of this.#registry.entries()) {
      id(worker.id); check(worker.role === ROLES[index], "INVALID_ROLE_ORDER");
      id(worker.providerId); textValue(worker.modelId, "INVALID_MODEL", 100);
      check(providers[worker.providerId] && typeof providers[worker.providerId].execute === "function", "MISSING_PROVIDER");
      check(["local", "cloud"].includes(providers[worker.providerId].locality), "INVALID_PROVIDER_LOCALITY");
      integer(worker.maxTokens, "INVALID_STEP_BUDGET", 1); integer(worker.maxMicroUsd, "INVALID_STEP_BUDGET");
    }
    check(new Set(registry.map(w => w.id)).size === registry.length, "DUPLICATE_WORKER");
    check(typeof hash === "function" && typeof clock === "function" && typeof checkpoint === "function", "INVALID_DEPENDENCY");
    this.#providers = Object.fromEntries(Object.entries(providers).map(([key, value]) =>
      [key, {execute: value.execute.bind(value), locality: value.locality}]));
    this.#hash = hash; this.#clock = clock; this.#checkpoint = checkpoint;
  }
  #event(run, type, detail = {}) {
    run.audit.push({sequence: run.audit.length + 1, type, at: new Date(this.#clock()).toISOString(), ...detail});
  }
  async #save(run) {
    try { await this.#checkpoint(copy(run)); }
    catch { run.status = "failed"; run.error = "CHECKPOINT_FAILED"; this.#event(run, "checkpoint_failed"); throw new CoreError("CHECKPOINT_FAILED"); }
  }
  createRun(job) {
    id(job.id); id(job.runId); id(job.eventId); textValue(job.question, "INVALID_QUESTION", 10000);
    check(job.budget && Array.isArray(job.sources) && job.sources.length > 0 && job.sources.length <= 100, "INVALID_JOB");
    integer(job.budget.tokens, "INVALID_BUDGET", 1);
    integer(job.budget.microUsd, "INVALID_BUDGET");
    integer(job.budget.calls, "INVALID_BUDGET", 1);
    integer(job.budget.timeoutMs, "INVALID_BUDGET", 1);
    integer(job.budget.maxContextChars, "INVALID_BUDGET", 1);
    check(job.budget.timeoutMs <= 300000 && job.budget.maxContextChars <= 2000000, "INVALID_BUDGET");
    const sources = job.sources.map(item => sourceRecord(item, this.#hash));
    check(new Set(sources.map(s => s.id)).size === sources.length, "DUPLICATE_SOURCE");
    check(sources.reduce((n, s) => n + s.content.length, 0) <= 2000000, "SOURCE_LIMIT");
    const normalized = {id: job.id, runId: job.runId, eventId: job.eventId, question: job.question,
      sources, budget: copy(job.budget), allowCloud: job.allowCloud === true};
    const jobHash = fingerprint(normalized, this.#hash);
    const prior = this.#runs.get(job.runId);
    if (prior) { check(prior.jobHash === jobHash, "RUN_ID_COLLISION"); return copy(prior); }
    check(!this.#events.has(job.eventId), "DUPLICATE_EVENT");
    const run = {schemaVersion: "0.1", id: job.runId, jobId: job.id, eventId: job.eventId,
      jobHash, job: normalized, registryHash: fingerprint(this.#registry, this.#hash),
      status: "queued", steps: [], claims: [], audit: [], approvals: [],
      usage: {tokens: 0, microUsd: 0, calls: 0}, artifact: null, error: null};
    this.#event(run, "accepted", {jobHash});
    this.#runs.set(run.id, run); this.#events.set(job.eventId, run.id);
    return copy(run);
  }
  getRun(runId) { const run = this.#runs.get(runId); check(run, "UNKNOWN_RUN"); return copy(run); }
  async cancel(runId) {
    const run = this.#runs.get(runId); check(run, "UNKNOWN_RUN");
    check(!this.#busy.has(runId), "RUN_BUSY"); // A dispatched request must settle or hit its deadline first.
    check(!TERMINAL.includes(run.status), "TERMINAL_RUN");
    run.status = "cancelled"; this.#event(run, "cancelled"); await this.#save(run); return copy(run);
  }
  async execute(runId) {
    const run = this.#runs.get(runId); check(run, "UNKNOWN_RUN");
    check(!this.#busy.has(runId), "RUN_BUSY");
    if (TERMINAL.includes(run.status)) return copy(run);
    this.#busy.add(runId); run.status = "running";
    try {
      await this.#save(run);
      for (const worker of this.#registry) {
        const provider = this.#providers[worker.providerId];
        check(provider.locality !== "cloud" || run.job.allowCloud, "CLOUD_NOT_APPROVED");
        const context = {schemaVersion: "0.1", jobId: run.jobId, runId: run.id, role: worker.role,
          question: run.job.question, instruction: worker.instruction || "", sources: run.job.sources, claims: run.claims,
          priorResults: run.steps.map(s => ({role: s.role, output: s.output})), tools: []};
        const contextText = canonical(context);
        check(contextText.length <= run.job.budget.maxContextChars, "CONTEXT_LIMIT");
        check(run.usage.calls + 1 <= run.job.budget.calls &&
          run.usage.tokens + worker.maxTokens <= run.job.budget.tokens &&
          run.usage.microUsd + worker.maxMicroUsd <= run.job.budget.microUsd, "BUDGET_EXHAUSTED");
        const step = {id: worker.role, workerId: worker.id, role: worker.role,
          providerId: worker.providerId, modelId: worker.modelId, status: "running",
          requestId: run.id + ":" + worker.role, contextHash: fingerprint(context, this.#hash),
          output: null};
        run.steps.push(step);
        // Reserve the full request cap BEFORE dispatch. Unknown outcomes never receive a refund.
        run.usage.calls++; run.usage.tokens += worker.maxTokens; run.usage.microUsd += worker.maxMicroUsd;
        this.#event(run, "dispatch", {stepId: step.id, requestId: step.requestId,
          providerId: step.providerId, modelId: step.modelId, contextHash: step.contextHash});
        await this.#save(run);
        const controller = new AbortController();
        let timer;
        let response;
        try {
          response = await Promise.race([
            Promise.resolve().then(() => provider.execute(copy({requestId: step.requestId,
              workerId: worker.id, role: worker.role, modelId: worker.modelId, context,
              limits: {tokens: worker.maxTokens, microUsd: worker.maxMicroUsd}}), {signal: controller.signal})),
            new Promise((_, reject) => { timer = setTimeout(() => {
              controller.abort(); reject(new CoreError("PROVIDER_TIMEOUT"));
            }, run.job.budget.timeoutMs); })
          ]);
        } finally { clearTimeout(timer); }
        check(response && response.usage, "INVALID_USAGE");
        integer(response.usage.tokens, "INVALID_USAGE"); integer(response.usage.microUsd, "INVALID_USAGE");
        check(response.usage.tokens <= worker.maxTokens && response.usage.microUsd <= worker.maxMicroUsd, "PROVIDER_BUDGET_VIOLATION");
        run.usage.tokens -= worker.maxTokens - response.usage.tokens;
        run.usage.microUsd -= worker.maxMicroUsd - response.usage.microUsd;
        const output = this.#validate(worker.role, response.output, run);
        step.output = output; step.outputHash = fingerprint(output, this.#hash); step.status = "completed";
        step.usage = copy(response.usage);
        this.#event(run, "validated", {stepId: step.id, outputHash: step.outputHash, usage: step.usage});
        if (worker.role === "Researcher" || worker.role === "Analyst") {
          run.claims.push(...output.claims);
          if (output.claims.some(c => c.confidence < 0.6)) {
            run.status = "needs_revision"; this.#event(run, "confidence_gate"); await this.#save(run); return copy(run);
          }
        }
        if (worker.role === "Critic" && output.findings.some(f => f.severity !== "minor")) {
          run.status = "needs_revision"; this.#event(run, "critique_gate"); await this.#save(run); return copy(run);
        }
        if (worker.role === "Synthesizer") {
          run.artifact = this.#render(output, run);
          run.status = "awaiting_approval";
          this.#event(run, "draft_ready", {artifactHash: run.artifact.hash});
        }
        await this.#save(run);
      }
      return copy(run);
    } catch (error) {
      run.status = "failed";
      // Provider messages can contain secrets or raw content. Store only an allowlisted internal error code.
      run.error = error instanceof CoreError ? error.code : "PROVIDER_FAILURE";
      const active = run.steps.find(s => s.status === "running"); if (active) active.status = "failed";
      this.#event(run, "failed", {code: run.error});
      await this.#save(run);
      return copy(run);
    } finally { this.#busy.delete(runId); }
  }
  #validate(role, output, run) {
    check(output && typeof output === "object", "INVALID_OUTPUT");
    if (role === "Scout") {
      check(Array.isArray(output.questions) && output.questions.length > 0 && output.questions.length <= 7, "INVALID_SCOUT");
      output.questions.forEach(q => textValue(q, "INVALID_SCOUT", 1000));
      return {questions: copy(output.questions)};
    }
    if (role === "Researcher" || role === "Analyst") {
      check(Array.isArray(output.claims) && output.claims.length > 0 && output.claims.length <= 100, "INVALID_CLAIMS");
      const used = run.claims.map(c => c.id);
      const claims = output.claims.map(c => { const valid = validateClaim(c, run.job.sources, used); used.push(valid.id); return valid; });
      return {claims};
    }
    if (role === "Critic") {
      check(Array.isArray(output.findings) && output.findings.length <= 100, "INVALID_CRITIQUE");
      const findings = output.findings.map(f => {
        check(["minor", "major", "blocking"].includes(f.severity), "INVALID_SEVERITY");
        textValue(f.text, "INVALID_FINDING"); return {severity: f.severity, text: f.text};
      });
      return {findings};
    }
    textValue(output.title, "INVALID_TITLE", 300);
    check(Array.isArray(output.sections) && output.sections.length > 0 && output.sections.length <= 30, "INVALID_SYNTHESIS");
    const sections = output.sections.map(section => {
      textValue(section.heading, "INVALID_HEADING", 300);
      check(Array.isArray(section.claimIds) && section.claimIds.length > 0 && section.claimIds.length <= 100, "INVALID_CITATIONS");
      for (const claimId of section.claimIds) check(run.claims.some(c => c.id === claimId), "UNKNOWN_CLAIM");
      return {heading: section.heading, claimIds: [...new Set(section.claimIds)]};
    });
    return {title: output.title, sections};
  }
  #render(output, run) {
    // Render worker text as literal text: no embeds, HTML, transclusions, or active Markdown from sources.
    const literal = s => s.replace(/[&<>]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;"}[c]))
      .replace(/([\\\\`*_{}\[\]()#+.!|~-])/g, "\\$1").replace(/[\r\n]+/g, " ");
    const lines = ["---", "type: research-draft", "title: " + JSON.stringify(output.title),
      "tags: [astraea/draft]", "origin: agent", "status: draft", "job_id: " + run.jobId,
      "run_id: " + run.id, "---", "", "# " + literal(output.title), ""];
    for (const section of output.sections) {
      lines.push("## " + literal(section.heading), "");
      for (const claimId of section.claimIds) {
        const claim = run.claims.find(c => c.id === claimId);
        lines.push("- " + literal(claim.text) + " [" + claim.kind + "; confidence " + claim.confidence + "] " +
          claim.evidence.map(e => "[source " + e.sourceId + ", chars " + e.start + "-" + e.end + "]").join(" "), "");
      }
    }
    lines.push("## Sources", "");
    for (const source of run.job.sources) lines.push("- " + source.id + ": " + literal(source.title) + " — " +
      literal(source.locator) + " (sha256 " + source.contentHash + ")", "");
    const markdown = lines.join("\n");
    const manifest = {schemaVersion: "0.1", origin: "agent", jobId: run.jobId, runId: run.id,
      sourceIds: run.job.sources.map(s => s.id), sources: run.job.sources.map(({content, ...s}) => s),
      claims: copy(run.claims), workers: run.steps.map(s => ({workerId: s.workerId, role: s.role,
        providerId: s.providerId, modelId: s.modelId, contextHash: s.contextHash, outputHash: s.outputHash})),
      registryHash: run.registryHash, approvalStatus: "pending"};
    // The approval digest covers BOTH rendered content and its evidence/provenance manifest.
    return {path: "AstraeaCore/drafts/" + run.id + "/synthesis.md", markdown, contentHash: digestText(markdown, this.#hash), manifest,
      hash: fingerprint({markdown, manifest}, this.#hash)};
  }
  async review(runId, {actor, artifactHash, decision}) {
    const run = this.#runs.get(runId); check(run, "UNKNOWN_RUN");
    check(!this.#busy.has(runId), "RUN_BUSY");
    check(run.status === "awaiting_approval", "NO_PENDING_APPROVAL");
    textValue(actor, "INVALID_ACTOR", 200);
    check(run.artifact.hash === artifactHash, "STALE_APPROVAL");
    check(["approve", "reject"].includes(decision), "INVALID_DECISION");
    run.approvals.push({actor, artifactHash, decision, at: new Date(this.#clock()).toISOString()});
    run.status = decision === "approve" ? "approved" : "rejected";
    this.#event(run, "reviewed", {actor, artifactHash, decision});
    await this.#save(run); return copy(run);
  }
}
