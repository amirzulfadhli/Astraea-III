// Runtime-neutral behavior suite; the Node entry point supplies Node's SHA-256 implementation.
export async function runSuite(api, hash) {
  const {AstraeaCore, fixtureProvider, demoJob, sourceRecord, validateClaim, fingerprint,
    preflight, planCommit, classifyPath, syncState, triggerDecision, recordEvent, recordPush, REPOSITORY} = api;
  const results = [];
  function assert(ok, message = "assertion failed") { if (!ok) throw new Error(message); }
  function eq(actual, expected) { assert(JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify({actual, expected})); }
  async function rejects(fn, code) {
    try { await fn(); } catch (e) { eq(e.code, code); return; }
    throw new Error("Expected " + code);
  }
  async function test(name, fn) {
    try { await fn(); results.push({name, passed: true}); }
    catch (e) { results.push({name, passed: false, error: e.message}); }
  }
  const roles = ["Scout", "Researcher", "Analyst", "Critic", "Synthesizer"];
  function setup({mutate, provider, checkpoint} = {}) {
    const registry = roles.map(role => ({id: role, role, providerId: "fixture", modelId: "fixture-v0",
      maxTokens: 1000, maxMicroUsd: 0}));
    if (mutate) mutate(registry);
    const calls = [];
    const delegate = provider || fixtureProvider();
    const adapter = {locality: delegate.locality, async execute(request, options) {
      calls.push(request); return delegate.execute(request, options);
    }};
    const core = new AstraeaCore({registry, providers: {fixture: adapter}, hash, checkpoint});
    const job = demoJob();
    return {core, job, calls};
  }
  const head = "a".repeat(40), hashA = "a".repeat(64), hashB = "b".repeat(64);
  const observed = () => ({...REPOSITORY, boundaryVerified: true, head, remoteHead: head, fetched: true,
    clean: true, lockOwned: true, conflicts: [], operationInProgress: false, relation: "equal"});
  const path = "Astraea III/AstraeaCore/drafts/demo-run/synthesis.md";
  function plan(change = {}, state = {}, approvals = []) {
    return planCommit({observed: {...observed(), changedPaths: [path], ...state},
      baseCommit: head, runId: "demo-run", jobId: "demo-job",
      changes: [{path, beforeHash: null, observedBeforeHash: null, afterHash: hashA,
        origin: "agent", runId: "demo-run", mode: "100644", ...change}], approvals});
  }
  const altered = fn => { const base = fixtureProvider(); return {locality: "local", async execute(request) {
    const response = await base.execute(request); fn(request, response); return response;
  }}; };
  await test("SHA-256 adapter known empty vector", () => eq(hash(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
  await test("SHA-256 adapter known abc vector", () => eq(hash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
  await test("canonical fingerprints ignore object key order", () => eq(fingerprint({b: 2, a: 1}, hash), fingerprint({a: 1, b: 2}, hash)));
  await test("source hash binds exact UTF-8 content", () => {
    const source = sourceRecord(demoJob().sources[0], hash); eq(source.contentHash, hash(source.content));
    assert(source.contentHash !== hash(source.content + " "));
  });
  await test("source URL rejects embedded credentials", () => rejects(() => sourceRecord({
    ...demoJob().sources[0], kind: "web", locator: "https://user:password@example.com/"}, hash), "INVALID_SOURCE_URL"));
  await test("source cannot ingest hidden plugin configuration", () => rejects(() => sourceRecord({
    ...demoJob().sources[0], locator: ".obsidian/plugins/copilot/data.json"}, hash), "PRIVATE_CONFIG_SOURCE"));
  await test("source traversal is rejected", () => rejects(() => sourceRecord({
    ...demoJob().sources[0], locator: "../secrets.txt"}, hash), "INVALID_PATH"));
  await test("five workers execute in order and return an attributed draft", async () => {
    const {core, job, calls} = setup(); core.createRun(job); const run = await core.execute(job.runId);
    eq(run.status, "awaiting_approval"); eq(calls.map(c => c.role), roles);
    eq(run.claims.length, 2); eq(run.artifact.manifest.workers.length, 5);
    assert(run.artifact.markdown.includes("[source S1, chars 0-"));
    eq(run.artifact.contentHash, hash(run.artifact.markdown)); eq(run.usage.calls, 5);
    assert(calls.every(c => c.context.tools.length === 0));
  });
  await test("identical run creation and execution never dispatch twice", async () => {
    const {core, job, calls} = setup(); core.createRun(job); core.createRun(job);
    await core.execute(job.runId); await core.execute(job.runId); eq(calls.length, 5);
  });
  await test("run ID collision is rejected", async () => {
    const {core, job} = setup(); core.createRun(job);
    await rejects(() => core.createRun({...job, question: "Changed request"}), "RUN_ID_COLLISION");
  });
  await test("event cannot create a second run", async () => {
    const {core, job} = setup(); core.createRun(job);
    await rejects(() => core.createRun({...job, runId: "second-run"}), "DUPLICATE_EVENT");
  });
  await test("duplicate sources are rejected", async () => {
    const {core, job} = setup(); job.sources.push(job.sources[0]);
    await rejects(() => core.createRun(job), "DUPLICATE_SOURCE");
  });
  await test("missing role is rejected", async () => {
    await rejects(() => setup({mutate: r => r.pop()}), "INVALID_REGISTRY");
  });
  await test("role order is validated", async () => {
    await rejects(() => setup({mutate: r => r.reverse()}), "INVALID_ROLE_ORDER");
  });
  await test("forged quote stops before analysis", async () => {
    const {core, job, calls} = setup({provider: altered((r, v) => {
      if (r.role === "Researcher") v.output.claims[0].evidence[0].quote = "invented";
    })});
    core.createRun(job); const run = await core.execute(job.runId);
    eq(run.error, "QUOTE_MISMATCH"); eq(calls.length, 2);
  });
  await test("unknown source ID stops before analysis", async () => {
    const {core, job} = setup({provider: altered((r, v) => {
      if (r.role === "Researcher") v.output.claims[0].evidence[0].sourceId = "missing";
    })}); core.createRun(job); eq((await core.execute(job.runId)).error, "UNKNOWN_SOURCE");
  });
  await test("invalid evidence span is rejected", async () => {
    const {core, job} = setup({provider: altered((r, v) => {
      if (r.role === "Researcher") v.output.claims[0].evidence[0].end = 1000000;
    })}); core.createRun(job); eq((await core.execute(job.runId)).error, "INVALID_SPAN");
  });
  await test("duplicate claim IDs across workers are rejected", async () => {
    const {core, job} = setup({provider: altered((r, v) => {
      if (r.role === "Analyst") v.output.claims[0].id = "C1";
    })}); core.createRun(job); eq((await core.execute(job.runId)).error, "DUPLICATE_CLAIM");
  });
  await test("low confidence blocks synthesis", async () => {
    const {core, job, calls} = setup({provider: altered((r, v) => {
      if (r.role === "Analyst") v.output.claims[0].confidence = 0.3;
    })}); core.createRun(job); const run = await core.execute(job.runId);
    eq(run.status, "needs_revision"); eq(calls.length, 3); eq(run.artifact, null);
  });
  await test("major critic finding blocks synthesis", async () => {
    const {core, job, calls} = setup({provider: altered((r, v) => {
      if (r.role === "Critic") v.output.findings = [{severity: "major", text: "Missing independent evidence"}];
    })}); core.createRun(job); eq((await core.execute(job.runId)).status, "needs_revision"); eq(calls.length, 4);
  });
  await test("synthesis cannot cite an invented claim", async () => {
    const {core, job} = setup({provider: altered((r, v) => {
      if (r.role === "Synthesizer") v.output.sections[0].claimIds = ["C999"];
    })}); core.createRun(job); eq((await core.execute(job.runId)).error, "UNKNOWN_CLAIM");
  });
  await test("source/worker markup is rendered as literal text", async () => {
    const {core, job} = setup(); job.sources[0].content = "![[private]] <script>alert(1)</script>";
    core.createRun(job); const run = await core.execute(job.runId);
    assert(!run.artifact.markdown.includes("<script>")); assert(!run.artifact.markdown.includes("![["));
  });
  await test("private context cannot leave process without cloud authorization", async () => {
    const adapter = fixtureProvider(); adapter.locality = "cloud";
    const {core, job, calls} = setup({provider: adapter}); core.createRun(job);
    eq((await core.execute(job.runId)).error, "CLOUD_NOT_APPROVED"); eq(calls.length, 0);
  });
  await test("explicit cloud authorization permits a replacement adapter", async () => {
    const adapter = fixtureProvider(); adapter.locality = "cloud";
    const {core, job} = setup({provider: adapter}); job.allowCloud = true; core.createRun(job);
    eq((await core.execute(job.runId)).status, "awaiting_approval");
  });
  await test("budgets reserve the next request cap before dispatch", async () => {
    const {core, job, calls} = setup(); job.budget.tokens = 999; core.createRun(job);
    eq((await core.execute(job.runId)).error, "BUDGET_EXHAUSTED"); eq(calls.length, 0);
  });
  await test("call budget stops after the allowed step", async () => {
    const {core, job, calls} = setup(); job.budget.calls = 1; core.createRun(job);
    eq((await core.execute(job.runId)).error, "BUDGET_EXHAUSTED"); eq(calls.length, 1);
  });
  await test("context budget blocks dispatch", async () => {
    const {core, job, calls} = setup(); job.budget.maxContextChars = 10; core.createRun(job);
    eq((await core.execute(job.runId)).error, "CONTEXT_LIMIT"); eq(calls.length, 0);
  });
  await test("unknown provider failure keeps reservation and redacts its error", async () => {
    const {core, job, calls} = setup({provider: {locality: "local", async execute() {throw new Error("secret-token");}}});
    core.createRun(job); const run = await core.execute(job.runId);
    eq(run.error, "PROVIDER_FAILURE"); eq(run.usage.tokens, 1000);
    assert(!JSON.stringify(run.audit).includes("secret-token")); await core.execute(job.runId); eq(calls.length, 1);
  });
  await test("negative usage never refunds budget", async () => {
    const {core, job} = setup({provider: altered((r, v) => {v.usage.tokens = -1;})});
    core.createRun(job); const run = await core.execute(job.runId); eq(run.error, "INVALID_USAGE"); eq(run.usage.tokens, 1000);
  });
  await test("provider usage cannot exceed the reserved cap", async () => {
    const {core, job} = setup({provider: altered((r, v) => {v.usage.tokens = 1001;})});
    core.createRun(job); eq((await core.execute(job.runId)).error, "PROVIDER_BUDGET_VIOLATION");
  });
  await test("checkpoint is acknowledged before any provider call", async () => {
    let saved = false;
    const {core, job} = setup({checkpoint: async run => {if (run.steps.length) saved = true;},
      provider: {locality: "local", async execute(r) {assert(saved); return fixtureProvider().execute(r);}}});
    core.createRun(job); eq((await core.execute(job.runId)).status, "awaiting_approval");
  });
  await test("checkpoint failure prevents provider dispatch", async () => {
    const {core, job, calls} = setup({checkpoint: async () => {throw new Error("disk failure");}});
    core.createRun(job); await rejects(() => core.execute(job.runId), "CHECKPOINT_FAILED"); eq(calls.length, 0);
  });
  await test("provider timeout aborts and retains uncertain usage", async () => {
    let signal;
    const {core, job} = setup({provider: {locality: "local", execute(r, options) {
      signal = options.signal; return new Promise(() => {});
    }}});
    job.budget.timeoutMs = 5; core.createRun(job); const run = await core.execute(job.runId);
    eq(run.error, "PROVIDER_TIMEOUT"); assert(signal.aborted); eq(run.usage.tokens, 1000);
  });
  await test("concurrent execution of the same run is rejected", async () => {
    let release;
    const wait = new Promise(resolve => {release = resolve;});
    const {core, job, calls} = setup({provider: {locality: "local", async execute(r) {
      await wait; return fixtureProvider().execute(r);
    }}});
    core.createRun(job); const pending = core.execute(job.runId);
    await rejects(() => core.execute(job.runId), "RUN_BUSY");
    release(); await pending; eq(calls.length, 5);
  });
  await test("stale approval cannot approve a draft", async () => {
    const {core, job} = setup(); core.createRun(job); await core.execute(job.runId);
    await rejects(() => core.review(job.runId, {actor: "human", artifactHash: hashA, decision: "approve"}), "STALE_APPROVAL");
  });
  await test("approval records actor and exact artifact identity", async () => {
    const {core, job} = setup(); core.createRun(job); const run = await core.execute(job.runId);
    const reviewed = await core.review(job.runId, {actor: "human", artifactHash: run.artifact.hash, decision: "approve"});
    eq(reviewed.status, "approved"); eq(reviewed.approvals[0].artifactHash, run.artifact.hash);
  });
  await test("returned state cannot mutate Core state", async () => {
    const {core, job} = setup(); const view = core.createRun(job); view.job.sources[0].content = "changed";
    eq(core.getRun(job.runId).job.sources[0].content, job.sources[0].content);
  });
  await test("queued cancellation prevents execution", async () => {
    const {core, job, calls} = setup(); core.createRun(job); await core.cancel(job.runId);
    eq((await core.execute(job.runId)).status, "cancelled"); eq(calls.length, 0);
  });
  await test("preflight admits a clean synchronized checkout", () => eq(preflight(REPOSITORY, observed()).action, "execute"));
  for (const [name, patch, error] of [
    ["dirty worktree", {clean: false}, "DIRTY_WORKING_TREE"],
    ["wrong repository", {fullName: "other/repo"}, "REPOSITORY_MISMATCH"],
    ["unknown remote", {fetched: false}, "REMOTE_UNKNOWN"],
    ["missing lock", {lockOwned: false}, "LOCK_REQUIRED"],
    ["merge conflict", {conflicts: ["human.md"]}, "GIT_CONFLICT"],
    ["unfinished operation", {operationInProgress: true}, "GIT_CONFLICT"],
    ["diverged history", {relation: "diverged"}, "DIVERGED_HISTORY"],
    ["unrelated local commits", {relation: "ahead"}, "UNRELATED_LOCAL_COMMITS"]
  ]) await test("preflight rejects " + name, () => rejects(() => preflight(REPOSITORY, {...observed(), ...patch}), error));
  await test("behind checkout requires pull then fresh validation", () => eq(preflight(REPOSITORY,
    {...observed(), relation: "behind", remoteHead: "b".repeat(40)}), {action: "fast_forward_pull", revalidate: true}));
  await test("new run-scoped draft receives automatic commit plan", () => {
    const p = plan(); eq(p.action, "commit"); eq(p.force, false); eq(p.paths, [path]);
  });
  await test("human edit since observation prevents commit", () => rejects(() => plan({
    beforeHash: hashA, observedBeforeHash: hashB}), "HUMAN_EDIT_DETECTED"));
  await test("existing draft needs review", () => eq(plan({beforeHash: hashA, observedBeforeHash: hashA}).action, "await_review"));
  await test("durable vault edits require review", () => {
    const p = "Astraea III/note/atomic/Concept.md"; eq(plan({path: p}, {changedPaths: [p]}).action, "await_review");
  });
  await test("exact review permits a durable vault patch", () => {
    const p = "Astraea III/note/atomic/Concept.md";
    eq(plan({path: p}, {changedPaths: [p]}, [{path: p, beforeHash: null, afterHash: hashA,
      actor: "human", decision: "approve"}]).action, "commit");
  });
  await test("secret/config paths cannot enter commit plans", () => {
    const p = "Astraea III/.obsidian/plugins/copilot/data.json";
    return rejects(() => plan({path: p}, {changedPaths: [p]}), "EXCLUDED_PATH");
  });
  await test("symlinks cannot enter commit plans", () => rejects(() => plan({mode: "120000"}), "UNTRUSTED_CHANGE"));
  await test("unrelated modified files block commit", () => rejects(() => plan({}, {changedPaths: [path, "human.md"]}), "UNRELATED_CHANGES"));
  await test("remote changes invalidate the commit base", () => rejects(() => plan({}, {remoteHead: "b".repeat(40)}), "STALE_BASE"));
  for (const p of ["../escape.md", "Astraea III/../escape.md", "C:/secret.md", "Astraea III/%2e%2e/x",
    "Astraea III/foo\\bar.md", "/absolute.md"])
    await test("reject unsafe path " + p, () => rejects(() => classifyPath(p), "INVALID_PATH"));
  await test("operational changes do not create recursive runs", () => eq(triggerDecision({
    id: "E1", kind: "filesystem", trustedObservation: true, changedPaths: [path]}, syncState()).reason, "operational_only"));
  await test("duplicate trigger is ignored", () => eq(triggerDecision({id: "E1", kind: "manual"},
    recordEvent(syncState(), "E1")).reason, "duplicate"));
  await test("manual request may explicitly reprocess a source", () => eq(triggerDecision({
    id: "E2", kind: "manual"}, syncState()).action, "enqueue"));
  await test("known agent commit is ignored across jobs", () => {
    const state = recordPush(syncState(), {commit: head, originFingerprint: hashA, at: "2026-11-04T00:00:00Z"});
    eq(triggerDecision({id: "E2", kind: "git", commit: head, originFingerprint: hashA,
      trustedObservation: true, changedPaths: ["Astraea III/note/atomic/A.md"]}, state).reason, "self_commit");
  });
  await test("unknown/human note edit requires review", () => eq(triggerDecision({id: "E3", kind: "filesystem",
    trustedObservation: true, changedPaths: ["Astraea III/note/fleet/New.md"]}, syncState()).action, "review"));
  await test("model-supplied trigger metadata is rejected", () => rejects(() => triggerDecision({id: "E3",
    kind: "git", changedPaths: ["Astraea III/note/fleet/New.md"]}, syncState()), "UNTRUSTED_TRIGGER"));
  await test("event history never silently evicts duplicate protection", () => {
    const state = syncState(); state.trigger_deduplication.seen_event_ids = Array.from({length: 10000}, (_, i) => "E" + i);
    return rejects(() => recordEvent(state, "new"), "EVENT_LEDGER_FULL");
  });

  await test("run cannot automatically write another run's draft", () => {
    const p = "Astraea III/AstraeaCore/drafts/other-run/synthesis.md";
    return rejects(() => plan({path: p}, {changedPaths: [p]}), "WRONG_RUN_PATH");
  });
  await test("runtime plan cannot write outside the vault boundary", () => {
    const p = "outside.md"; return rejects(() => plan({path: p}, {changedPaths: [p]}), "EXCLUDED_PATH");
  });
  await test("per-role providers and models are independently routed", async () => {
    const registry = roles.map((role, index) => ({id: role, role, providerId: index % 2 ? "second" : "first",
      modelId: "model-" + index, maxTokens: 1000, maxMicroUsd: 0}));
    const routed = [];
    const adapter = name => ({locality: "local", async execute(request) {
      routed.push([name, request.role, request.modelId]); return fixtureProvider().execute(request);
    }});
    const core = new AstraeaCore({registry, providers: {first: adapter("first"), second: adapter("second")}, hash});
    const job = demoJob(); core.createRun(job); eq((await core.execute(job.runId)).status, "awaiting_approval");
    eq(routed, roles.map((role, i) => [i % 2 ? "second" : "first", role, "model-" + i]));
  });
  await test("claim evidence respects UTF-16 offsets for Unicode source text", async () => {
    const {core, job} = setup(); job.sources[0].content = "Evidence 🌌 with café.";
    core.createRun(job); const run = await core.execute(job.runId); eq(run.status, "awaiting_approval");
    eq(run.claims[0].evidence[0].end, job.sources[0].content.length);
  });
  await test("missing evidence is rejected", async () => {
    const {core, job} = setup({provider: altered((r, v) => {
      if (r.role === "Researcher") v.output.claims[0].evidence = [];
    })}); core.createRun(job); eq((await core.execute(job.runId)).error, "MISSING_EVIDENCE");
  });
  await test("duplicate claim IDs within a step are rejected", async () => {
    const {core, job} = setup({provider: altered((r, v) => {
      if (r.role === "Researcher") v.output.claims.push(v.output.claims[0]);
    })}); core.createRun(job); eq((await core.execute(job.runId)).error, "DUPLICATE_CLAIM");
  });
  await test("valid receipts charge failed schema validation attempts", async () => {
    const {core, job} = setup({provider: altered((r, v) => {
      v.usage.tokens = 23; if (r.role === "Researcher") v.output.claims = [];
    })}); core.createRun(job); const run = await core.execute(job.runId);
    eq(run.error, "INVALID_CLAIMS"); eq(run.usage.tokens, 46);
  });
  await test("rejected draft never becomes approved on replay", async () => {
    const {core, job} = setup(); core.createRun(job); const run = await core.execute(job.runId);
    await core.review(job.runId, {actor: "human", artifactHash: run.artifact.hash, decision: "reject"});
    eq((await core.execute(job.runId)).status, "rejected");
  });
  await test("approval hash covers the complete provenance manifest", async () => {
    const {core, job} = setup(); core.createRun(job); const run = await core.execute(job.runId);
    eq(run.artifact.hash, fingerprint({markdown: run.artifact.markdown, manifest: run.artifact.manifest}, hash));
    const changed = JSON.parse(JSON.stringify(run.artifact.manifest)); changed.claims[0].confidence = 0.7;
    assert(fingerprint({markdown: run.artifact.markdown, manifest: changed}, hash) !== run.artifact.hash);
  });

  await test("provider cannot leak arbitrary usage metadata into audit or step state", async () => {
    const {core, job} = setup({provider: altered((r, v) => {v.usage.secret = "private-provider-data";})});
    core.createRun(job); const run = await core.execute(job.runId);
    eq(run.status, "awaiting_approval"); assert(!JSON.stringify(run).includes("private-provider-data"));
    eq(Object.keys(run.steps[0].usage).sort(), ["microUsd", "tokens"]);
  });
  await test("provider cannot impersonate an internal error code", async () => {
    const {core, job} = setup({provider: {locality: "local", execute() {
      throw new api.CoreError("private-provider-data");
    }}});
    core.createRun(job); const run = await core.execute(job.runId);
    eq(run.error, "PROVIDER_FAILURE"); assert(!JSON.stringify(run).includes("private-provider-data"));
  });

  await test("completed checkpoint resumes remaining roles without reissuing a request", async () => {
    const checkpoints = [];
    const {core, job} = setup({checkpoint: async run => {checkpoints.push(run);}});
    core.createRun(job); await core.execute(job.runId);
    const saved = checkpoints.find(r => r.status === "running" && r.steps.length === 2 && r.steps[1].status === "completed");
    const next = setup(); next.core.restoreRun(saved); const recovered = await next.core.execute(job.runId);
    eq(recovered.status, "awaiting_approval"); eq(next.calls.map(c => c.role), ["Analyst", "Critic", "Synthesizer"]);
    eq(recovered.usage.calls, 5);
  });
  await test("in-flight checkpoint recovers to reconciliation without dispatch", async () => {
    const checkpoints = [];
    const {core, job} = setup({checkpoint: async run => {checkpoints.push(run);}});
    core.createRun(job); await core.execute(job.runId);
    const saved = checkpoints.find(r => r.steps.length === 2 && r.steps[1].status === "running");
    const next = setup(); const restored = next.core.restoreRun(saved);
    eq(restored.status, "needs_reconciliation"); const result = await next.core.execute(job.runId);
    eq(result.usage, saved.usage); eq(next.calls.length, 0);
  });
  await test("completed approval checkpoint replays with no dispatch", async () => {
    const {core, job} = setup(); core.createRun(job); const run = await core.execute(job.runId);
    const approved = await core.review(job.runId, {actor: "human", artifactHash: run.artifact.hash, decision: "approve"});
    const next = setup(); next.core.restoreRun(approved); eq((await next.core.execute(job.runId)).status, "approved");
    eq(next.calls.length, 0);
  });
  await test("registry change rejects recovered checkpoint", async () => {
    const {core, job} = setup(); const saved = core.createRun(job);
    const next = setup({mutate: r => {r[0].modelId = "changed";}});
    await rejects(() => next.core.restoreRun(saved), "CHECKPOINT_IDENTITY_MISMATCH");
  });
  await test("tampered source snapshot cannot reuse prior job identity", async () => {
    const {core, job} = setup(); const saved = core.createRun(job); saved.job.sources[0].content = "tampered";
    const next = setup(); await rejects(() => next.core.restoreRun(saved), "CHECKPOINT_IDENTITY_MISMATCH");
  });
  await test("tampered usage cannot bypass recovered budget accounting", async () => {
    const {core, job} = setup(); core.createRun(job); const saved = await core.execute(job.runId);
    saved.usage.tokens = 1; const next = setup();
    await rejects(() => next.core.restoreRun(saved), "CHECKPOINT_BUDGET_MISMATCH");
  });
  await test("tampered artifact cannot retain a recovered approval", async () => {
    const {core, job} = setup(); core.createRun(job); const saved = await core.execute(job.runId);
    saved.artifact.markdown += "tampered"; const next = setup();
    await rejects(() => next.core.restoreRun(saved), "CHECKPOINT_ARTIFACT_MISMATCH");
  });
  await test("claim tampering is detected before recovery", async () => {
    const {core, job} = setup(); core.createRun(job); const saved = await core.execute(job.runId);
    saved.claims[0].text = "tampered"; const next = setup();
    await rejects(() => next.core.restoreRun(saved), "CHECKPOINT_CLAIMS_MISMATCH");
  });
  await test("unsupported run schemas fail closed", () => {
    const {core, job} = setup(); const saved = core.createRun(job); saved.schemaVersion = "0.1";
    return rejects(() => setup().core.restoreRun(saved), "UNSUPPORTED_RUN_SCHEMA");
  });
  await test("revision-needed checkpoint cannot resume past its gate", async () => {
    const {core, job} = setup({provider: altered((r,v) => {
      if (r.role === "Critic") v.output.findings = [{severity: "blocking", text: "Unresolved contradiction"}];
    })}); core.createRun(job); const saved = await core.execute(job.runId); saved.status = "running";
    await rejects(() => setup().core.restoreRun(saved), "CHECKPOINT_GATE_BYPASS");
  });
  await test("Git capture provenance survives normalization and synthesis", async () => {
    const {core, job} = setup(); job.sources[0].provenance = {
      repository: "amirzulfadhli/Astraea-III", commit: "a".repeat(40), blob: "b".repeat(40)};
    core.createRun(job); const run = await core.execute(job.runId);
    eq(run.artifact.manifest.sources[0].provenance, job.sources[0].provenance);
  });

  await test("queued source hash cannot be altered independently of its content", async () => {
    const {core, job} = setup(); const saved = core.createRun(job);
    saved.job.sources[0].contentHash = "a".repeat(64);
    await rejects(() => setup().core.restoreRun(saved), "CHECKPOINT_IDENTITY_MISMATCH");
  });

  async function uncertain(role = "Scout") {
    const base = fixtureProvider(); let failed = false;
    const s = setup({provider: {locality: "local", execute(request) {
      if (request.role === role && !failed) {failed = true; throw new Error("unknown outcome");}
      return base.execute(request);
    }}});
    s.core.createRun(s.job); const run = await s.core.execute(s.job.runId);
    const command = {decisionId: "D1", kind: "record_completed", requestId: s.job.runId + ":" + role,
      reason: "Verified receipt", evidenceRef: "provider-ledger:receipt-1",
      expectedCheckpointHash: fingerprint(run, hash),
      receipt: {requestId: s.job.runId + ":" + role, providerId: "fixture", modelId: "fixture-v0",
        receivedAt: "2026-11-05T00:00:00Z", usage: {tokens: 13, microUsd: 0}, output: {questions: ["Scope"]}}};
    return {...s, run, command};
  }
  await test("provider failure immediately pauses as an uncertain request", async () => {
    const {run} = await uncertain(); eq(run.status, "needs_reconciliation"); eq(run.usage.tokens, 1000);
  });
  await test("verified completion settles once without another provider invocation", async () => {
    const {core, job, calls, command} = await uncertain();
    const result = await core.reconcile(job.runId, command, "verified-human");
    eq(calls.length, 1); eq(result.steps[0].status, "completed"); eq(result.usage.tokens, 13);
    const final = await core.execute(job.runId);
    eq(final.status, "awaiting_approval"); eq(calls.map(c => c.role), roles); eq(final.usage.calls, 5);
    eq(final.artifact.manifest.reconciliations[0].decisionId, command.decisionId);
    setup().core.restoreRun(final);
  });
  await test("identical reconciliation is idempotent", async () => {
    const {core, job, command} = await uncertain();
    const first = await core.reconcile(job.runId, command, "human");
    const second = await core.reconcile(job.runId, command, "human");
    eq(second.usage, first.usage); eq(second.reconciliations.length, 1);
  });
  await test("reused reconciliation ID rejects changed contents", async () => {
    const {core, job, command} = await uncertain(); await core.reconcile(job.runId, command, "human");
    await rejects(() => core.reconcile(job.runId, {...command, reason: "changed"}, "human"), "RECONCILIATION_ID_COLLISION");
  });
  await test("stale reconciliation hashes preserve the original request", async () => {
    const {core, job, command, run} = await uncertain(); command.expectedCheckpointHash = "f".repeat(64);
    await rejects(() => core.reconcile(job.runId, command, "human"), "STALE_RECONCILIATION");
    eq(core.getRun(job.runId), run);
  });
  await test("receipt for another request cannot settle this request", async () => {
    const {core, job, command} = await uncertain(); command.receipt.requestId = "other:Scout";
    await rejects(() => core.reconcile(job.runId, command, "human"), "INVALID_RECONCILIATION_RECEIPT");
  });
  await test("unverified retry/not-started decisions are not supported", async () => {
    const {core, job, command} = await uncertain(); command.kind = "retry";
    await rejects(() => core.reconcile(job.runId, command, "human"), "INVALID_RECONCILIATION_KIND");
  });
  await test("abandoning an uncertain request preserves its reserved budget", async () => {
    const {core, job, calls, command} = await uncertain();
    const result = await core.reconcile(job.runId, {...command, kind: "abandon"}, "human");
    eq(result.status, "cancelled"); eq(result.usage.tokens, 1000);
    await core.execute(job.runId); eq(calls.length, 1); setup().core.restoreRun(result);
  });
  await test("receipt over the original cap cannot refund or alter the request", async () => {
    const {core, job, command, run} = await uncertain(); command.receipt.usage.tokens = 1001;
    await rejects(() => core.reconcile(job.runId, command, "human"), "PROVIDER_BUDGET_VIOLATION"); eq(core.getRun(job.runId), run);
  });
  await test("reconciled major critique still stops before synthesis", async () => {
    const {core, job, calls, command} = await uncertain("Critic"); command.receipt.output = {
      findings: [{severity: "major", text: "Contradictory evidence"}]};
    const result = await core.reconcile(job.runId, command, "human"); eq(result.status, "needs_revision");
    await core.execute(job.runId); eq(calls.length, 4); setup().core.restoreRun(result);
  });
  await test("reconciled synthesis still requires separate human approval", async () => {
    const {core, job, command} = await uncertain("Synthesizer"); command.receipt.output = {
      title: "Recovered draft", sections: [{heading: "Evidence", claimIds: ["C1", "C2"]}]};
    const result = await core.reconcile(job.runId, command, "human");
    eq(result.status, "awaiting_approval"); eq(result.approvals.length, 0); setup().core.restoreRun(result);
  });
  return {passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results};
}
