---
type: decision
title: Free-first storage operations and reconciliation
status: accepted
date_created: 2026-11-05
tags: [system/architecture, system/decision]
---

# ADR-004: Free-first storage operations

The pending v0.2 CI is verified: GitHub Actions run 41863601666 passed 93 portable and 36 native tests on Node 22 and 24. Both existing PRs remain draft and unmerged.

The user has not chosen a cloud provider and prefers free tools first. Keep infrastructure spend at zero and create no cloud accounts, billable volumes, deployments or publication. Provide an explicitly incomplete volume plan and bootstrap only an existing, mounted, owner-verified, free persistent cloud volume. A trusted host must attest persistence, SQLite locking and zero cost; a directory's existence is not persistence proof. No provider connector is configured by this milestone.

Use Node's online SQLite backup API to capture committed WAL state. Publish a backup manifest only after database verification and fsync. Backups have exclusive IDs, byte hashes and private permissions. Restore into a new directory only, bind authority to the manifest hash and target, preserve all snapshots/history/provenance/approvals, and quarantine the clone.

Quarantine is mandatory even for queued jobs: a backup may predate a request that subsequently executed on the source store. Exactly-once dispatch cannot be recovered from an old backup alone. There is no activation method in this milestone. Source fencing and authoritative event-ledger reconciliation are required before future activation.

Uncertain requests can be abandoned or settled with a matching, verified completion receipt by an authenticated operator. Default authorization denies. Settlement is checkpoint-bound, idempotent, transactional and recorded in a globally unique decision ledger. Preserve reservations for unknown outcomes; refund unused capacity only from a valid receipt. Settlement never calls a provider, bypasses evidence validation or grants artifact approval.

Store schema 3 adds metadata and reconciliation-decision tables. Schema-2 upgrades require explicit allowUpgrade and preserve runs/history. Run schema 0.2 remains compatible, with optional reconciliation records; old approved artifacts retain their hashes when no reconciliation occurred.

Live cloud provisioning remains pending a provider/account/region choice and a verified free persistent mount. Backup copy redundancy, cloud encryption/access control, provider receipt verification and an authentication gateway remain host responsibilities.
