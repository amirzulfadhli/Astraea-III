---
type: development-progress
title: Astraea III development progress
system: Astraea III
date_updated: 2026-11-04
tags: [system/development, system/architecture]
---

# Development progress

## Baseline inspection

Inspected the canonical GitHub repository at `a5bde6506da9d91d13cd8be6dfd9a583100d96ac` using cloud APIs. The complete recursive tree is not truncated: 201 files, 83 unique blobs. Only `main` exists; there are no issues or pull requests. The history contains a single architecture commit dated 2026-09-07.

Reviewed architecture v0.1, ADR-001, all six specialist specifications, field/project/workflow notes, templates, plugin manifests, skill descriptions and a representative source-fetch wrapper. Repeated skill trees share identical blobs. Compiled vendor plugin bundles, cached model catalogs, embeddings and private plugin settings were inventoried as vendor/generated configuration, not treated as Astraea Core implementation or executed. This is a repository audit, not a security review of vendor bundles.

| Area | Baseline status | This milestone |
| --- | --- | --- |
| Vault capture/refinement/index/application structure | Present, with templates and placeholder content | Preserved |
| Architecture and replaceable-worker decision | Documented | Preserved; ADR-002 narrows first implementation |
| Specialist agents | Six prompt specifications, existing Obsidian integrations | Preserved; mapped to registry references |
| Astraea Core | Proposed only | Sequential five-role computation, registry, state, audit, review |
| Evidence provenance | Proposed only | Source byte hashes, exact text spans, evidence/claim manifest |
| Provider abstraction | Proposed only | Injected per-role adapters/models, fixture implementation |
| Budgets/failure handling | Proposed only | Upfront reservations, receipts, deadlines, terminal failure behavior |
| Git/Obsidian integration | User's existing workflow; specific automation not present as repository workflow code | Pure preflight/change/trigger policies; no mutation adapter |
| Automated tests and CI | Absent | Portable behavior suite, Node entry point, cloud CI configuration |
| Memory/scheduling/general DAGs | Proposed only | Deferred |
| Durable storage and restart recovery | Proposed only | Checkpoint hook; storage/recovery deferred |

Some prior notes contain template scaffolding, duplicated frontmatter/code fences, unresolved links and double `.md` suffixes. `PRJ-03` is empty. The workflow SOP includes a broad `git add .` example. These files are preserved; future automation must use an explicit approved path list instead.

## Completed v0 foundation

Core owns five ordered roles, schema checks, copied contexts, no worker tools, per-role provider/model routing, request identity, same-instance event/run deduplication, source/claim validation, literal-text draft rendering, critique/confidence gates and human review hashes.

Git policy covers repository boundaries, clean-tree/remote/conflict checks, explicit file classes, before-content comparisons, unrelated changes, review hashes and trigger loop prevention. It produces decisions only.

No laptop filesystem or applications are accessed in this development session. No live model calls, dependency installation, autonomous loops, deployment or publication are performed. New code is dependency-free and additive; existing tracked vendor artifacts are not removed.

## Verification

The portable behavioral suite runs against the actual pure module source in the cloud JavaScript runner. That runner removes only ES-module import/export syntax and supplies timers, a minimal abort-signal test double and a SHA-256 test adapter. Known hash vectors are included. The committed Node runner uses native module loading, Node SHA-256, timers and AbortController; CI additionally runs the stdout-only demonstration.

Tests cover ordered orchestration, role/provider substitution, source hashes and Unicode spans, forged/missing evidence, duplicate claims, critique/confidence gates, budgets and invalid usage, provider timeout/failure, checkpoint ordering/failure, same-run concurrency, stale approvals, replay/cancellation, Git conflicts/remote changes/human edits, unsafe paths, secret/config exclusions and self-trigger suppression.

For reproducibility, use the commands in the Core README in a cloud checkout. Cloud Node CI status is reported with the review branch; a cloud V8 pass alone is not claimed as end-to-end Git/Obsidian verification.

## Remaining limitations and next phase

The fixture does not perform real research. There is no persistent store, restart/resume, source fetch adapter, live provider SDK, persistent memory, schedule, general DAG or mutation-capable Git/Obsidian integration. The policy functions do not collect or authenticate their own observations. Same-instance deduplication does not coordinate multiple cloud processes. Adapter budget caps and cancellation depend on trusted host enforcement.

Next: implement atomic cloud checkpoint storage and interruption reconciliation; add read-only Git observations and tests on temporary repositories, including concurrent human edits and rejected pushes. Then add an approval-bound draft writer and fast-forward-only synchronization adapter. Integrate real source capture and opt-in model adapters after the storage/sync boundary is verified.
