# Astraea Core: v0.2

Core now executes a bounded Scout → Researcher → Analyst → Critic → Synthesizer workflow using replaceable provider adapters. It returns a source-attributed Markdown draft and provenance manifest, then waits for an explicit human review.

## Run and verify

Use a cloud checkout with Node.js 22 or 24:

```sh
node "Astraea III/AstraeaCore/test/run.mjs"
node "Astraea III/AstraeaCore/examples/demo.mjs"
```

There are no third-party dependencies. Durable storage requires a Node release with built-in node:sqlite (CI covers current Node 22 and 24). See [v0.2 storage and recovery](v0.2.md) for the durable API. The example reads the registry, computes fixture results, and writes only to stdout. It does not invoke a local model or access a laptop. The fixture is a contract demonstration, not a real research result.

## Modules and trust boundary

| File | Responsibility |
| --- | --- |
| `src/contracts.mjs` | Conservative input validation, canonical fingerprints, source records, exact evidence-span validation |
| `src/core.mjs` | Registry, serial dispatch, per-request deadline, budgets, audit events, output validation, human review |
| `src/sync-policy.mjs` | Pure Git preflight/change/trigger decisions and initial sync-state shape |
| `registry.json` | Five role implementations, instructions, fixture model selection, references to existing specialists |
| `examples/fixture.mjs` | In-process deterministic adapter and input fixture |
| `test/suite.mjs` | Portable behavior suite shared by Node and cloud verification |

The computational Core owns no filesystem, Git credentials, shell, fetch client, provider SDK, or Obsidian handle. Separate v0.2 adapters provide explicitly located operational storage and read-only GitHub access. An injected adapter is trusted host code: this interface does not sandbox arbitrary JavaScript. Worker context receives copied data and an empty tool list. Source content is untrusted data; a prompt cannot change the Core's validation, approval state, permissions, or paths.

Existing specialist prompts are preserved and referenced in the registry. The inline role instructions are operative for this milestone; prompt-reference resolution is not yet implemented.

## API and contracts

Construct `new AstraeaCore({registry, providers, hash, clock?, checkpoint?})`. `registry` is the workers array from `registry.json`. `hash(text)` returns lowercase SHA-256 over exact UTF-8 bytes. The Node entry points use `node:crypto`; Core carries no cryptography implementation.

A provider map entry has `locality: "local" | "cloud"` and `async execute(request, {signal})`. Here “local” means in the same execution environment, which may itself be a cloud container. It does not select or connect to a user's laptop.

The request contains `requestId`, `workerId`, `role`, `modelId`, `context`, and `limits: {tokens, microUsd}`. The adapter must enforce its advertised combined input/output token and monetary ceiling and honor the abort signal. The response must be `{output, usage: {tokens, microUsd}}`, with finite nonnegative integers. Cost uses millionths of a US dollar. A source's privacy label is retained; **all** external cloud adapters require the job's explicit `allowCloud: true`. This milestone has no model-provider credentials, SDKs, network access or automatic provider fallback.

The job has `id`, `runId`, `eventId`, `question`, `sources`, and `budget: {tokens, microUsd, calls, timeoutMs, maxContextChars}`. See `examples/fixture.mjs` for a complete input. Per-source text is capped at one million characters, all sources at two million, and source count at 100.

Call `createRun(job)`, then `await execute(runId)`. Repeating creation with identical input is idempotent. A changed request with the same run ID or another run for the same event is rejected. Repeating execution of a terminal run returns the recorded result. Concurrent execution of the same run is rejected.

Role outputs:

- Scout: `{questions: [string]}`.
- Researcher/Analyst: `{claims: [{id, text, kind, confidence, evidence}]}`. Kind is `fact` or `inference`; evidence entries are `{sourceId, start, end, quote}`.
- Critic: `{findings: [{severity, text}]}`; severity is `minor`, `major`, or `blocking`.
- Synthesizer: `{title, sections: [{heading, claimIds}]}`.

Sources retain exact text, raw UTF-8 SHA-256, locator, title, retrieval time, privacy and extraction method. Evidence offsets are half-open **JavaScript UTF-16 code-unit** offsets into that text; every quote must equal the selected slice. Claim IDs are unique across a run. This proves traceability and quote fidelity, not that a source is true or logically supports a claim; that remains a Critic/human judgment.

Claims with confidence below 0.6 or major/blocking critique stop at `needs_revision`. Synthesis selects existing claims; Core renders their text and citations, escaping source/worker markup. The final artifact includes a byte hash, manifest, and a separate approval hash over canonical JSON containing **both** Markdown and manifest. Review with `await review(runId, {actor, artifactHash, decision: "approve" | "reject"})`. Actor identity must come from an authenticated human-facing host; Core cannot authenticate a supplied string. Review records a decision and never writes or publishes the note.

## State, cost and failure semantics

Core keeps state in memory; `getRun()` returns a defensive snapshot. Working context is reconstructed per step; persistent memory is not implemented or inferred from model output. Source snapshots, derived claims/drafts and operational state remain separate objects.

The awaited `checkpoint(runSnapshot)` hook is now implemented by the optional durable service and SQLite storage adapter. A checkpoint is acknowledged before dispatch and after validation. Failure stops execution. Snapshots include private source content and must be stored in approved cloud storage, not blindly committed.

Core reserves the full per-request token/cost cap and checkpoints it before invocation. A valid receipt refunds unused capacity. A missing/invalid receipt, exception, or timeout retains the reservation. A valid receipt is charged even if output validation fails. Audits use internal failure codes rather than provider error strings, which can contain credentials. Each step has one attempt; there is no automatic retry of a possibly charged request. Late responses after timeout cannot update the run. Adapter cancellation and provider billing behavior still require live integration tests.

Per-request deadlines and maximum calls bound the workflow. The v0.2 durable service adds shared-store event uniqueness, fenced cross-process leases and validated restart/resume. General DAG scheduling, total-job deadlines and provider outcome reconciliation remain deferred. An uncertain in-flight request recovers to needs_reconciliation without another call or a budget refund. Failed and revision-needed runs remain terminal.

## GitHub and Obsidian boundary

Repository: `amirzulfadhli/Astraea-III`, branch: `main`, vault prefix: `Astraea III/`. A future cloud Git adapter must verify the checkout root independently from the vault prefix. Neither may be inferred from a parent directory's Git metadata.

The lifecycle remains pull → validate → execute agents → validate output → update state → commit → push. `preflight()` rejects dirty trees, unknown remotes, missing locks, unresolved operations, divergence and unrelated local commits. A behind checkout receives a fast-forward-pull plan followed by mandatory fresh validation.

`planCommit()` compares the original head and current remote head, before-content hashes, and the complete changed-path inventory. It rejects secret/config paths, symlinks, traversal, deletion, changes outside the vault, another run's draft directory and unrelated modifications. Only newly created run-scoped draft Markdown/manifest files qualify for automatic planning. Existing drafts, human knowledge and policy files require exact before/after-hash approval. A commit plan is not a human approval of research or authority to publish.

This is a **decision layer only**: it performs no Git command, file write, pull, commit or push. Host observations must be freshly collected under a cross-process lock and rechecked immediately before mutation; adapters must also reject symlink ancestors and preserve concurrent human edits. End-to-end integration is still unimplemented. Core's computational demo therefore does not require a Git preflight.

`triggerDecision()` ignores recorded events, Core-only changes and known agent commits across jobs. Unknown/human note changes require review; only explicit manual triggers enqueue directly. Origin claims must come from authenticated observations and a trusted SHA/fingerprint ledger, never from a model or commit author/email alone. Event ledgers stop at capacity rather than silently evicting duplicate protection.

`syncState()` retains the architecture's snake_case fields for proposed `AstraeaCore/sync-state.json`, with repository identity/vault prefix, phase, pending-push SHA and generated-commit ledger extensions. No live state file is installed. Record a successful push receipt externally after push; a commit cannot contain its own SHA. Future sanitized shared checkpoints may lag a commit, avoiding recursive “update sync-state” commits.

Pull failure must preserve the checkout; validation failure retains drafts; commit failure prevents push; push failure retains the unpushed commit for reconciliation. Rollback uses a new revert commit. No adapter may force-push, rewrite history or reset away existing work.

## v0.2 and next milestone

See [v0.2 storage and recovery](v0.2.md), [ADR-003](decisions/ADR-003-durable-recovery-and-read-only-snapshots.md), and [development progress](development/v0.2.md). SQLite persistence and read-only GitHub snapshots are implemented; no mutation adapter is enabled. Next: authenticated reconciliation/operator tools and cloud backup/restore verification before any approved writer.
