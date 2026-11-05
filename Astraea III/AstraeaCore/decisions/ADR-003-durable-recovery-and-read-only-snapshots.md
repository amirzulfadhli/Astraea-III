---
type: decision
title: Durable execution and read-only vault snapshots
status: accepted
date_created: 2026-11-04
tags: [system/decision, system/architecture]
---

# ADR-003: Durable execution and read-only snapshots

Extend the reviewed Core v0 foundation with Node's built-in SQLite store and a read-only GitHub vault reader. Keep Core's five replaceable workers, human gates, evidence validation and provider-neutral boundary.

SQLite supplies atomic transactions, WAL recovery and full synchronous durability without a package dependency. Runs and history are versioned; event IDs are globally unique within one store. Compare-and-swap revisions and renewable lease epochs fence stale writers. All cooperating executors must use the same database on an approved persistent cloud filesystem; this is not a distributed database and must not be placed on an unsupported network filesystem.

Run/store schemas are now 0.2 / SQLite user_version 2. v0 had no durable store. Unknown schemas and altered registry/job/content identities fail closed; there is no silent migration or destructive reset.

Reserve and acknowledge request budgets before dispatch. On restart, validate completed outputs, contexts, claims, budgets, artifacts and approvals before skipping those steps. A checkpoint with an in-flight request becomes needs_reconciliation. Preserve its reservation and never infer “not called” or automatically retry it. Cross-provider exactly-once execution is not promised.

Use immutable commit/tree/blob snapshots of the existing GitHub repository to read the vault. Record the commit and verified Git blob identity alongside source SHA-256 and exact text spans. Reader access is limited to approved Markdown knowledge folders, fixed GET endpoints and bounded responses. A remote snapshot does not assert a clean local worktree or permission to write. GitHub remains canonical shared state and Obsidian remains the interface to the synchronized vault; no existing sync mechanism is replaced.

Operational databases, raw checkpoints and history live outside the checkout/vault and are excluded from commits. The storage adapter rejects declared repository roots and symlink paths. Cloud filesystem permissions and access control remain host responsibilities; database checksums detect corruption, not malicious operators able to rewrite the whole database.

This milestone introduces no write-capable Git/Obsidian adapter, model SDK, source-fetch loop, scheduler, deployment or publication. Persistent storage must be provisioned by an approved cloud host before production use.
