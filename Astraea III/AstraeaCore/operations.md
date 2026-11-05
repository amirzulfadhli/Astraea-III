# Cloud storage and recovery operations

## Verified baseline and free-first scope

[Core v0.2 CI run 41863601666](https://github.com/amirzulfadhli/Astraea-III/actions/runs/41863601666) passed on Node 22 and 24: 93 portable behavior tests, 36 native SQLite/crash/reader tests, syntax checks and demonstration. No baseline fixes were needed.

The user prefers free tools and has not selected a provider. The checked-in [volume plan](infra/volume-plan.example.json) deliberately contains no account, region, volume or mount. No live resource is provisioned and no infrastructure cost is authorized.

## Existing free cloud volume

Use volumePlan(config) to identify missing fields. Positive estimated costs or a nonzero spending budget are rejected. prepareExistingVolume({config, forbiddenRoots, verifyMount}) accepts only an already-mounted directory and a trusted host proof matching the plan hash, owner, persistence, local SQLite locking and zero cost. Missing mounts fail rather than being created on an ephemeral filesystem. An ownership marker is created exclusively and a changed identity cannot overwrite it.

This bootstrap configures an existing free volume; it does not create or attach a provider volume. The verifyMount callback must consult the cloud host/account, not trust model output or a form's assertion. GitHub-hosted CI temporary directories are test fixtures, not persistent production storage. The default verifier denies.

The returned stateDirectory can be passed to SqliteJobStore.open with every checkout/vault boundary in forbiddenRoots. All activity belongs in cloud environments. No laptop paths, credentials or applications are accessed.

## Consistent backups

createBackup({store, backupRoot, backupId, forbiddenRoots}) uses Node's online SQLite backup API, which captures committed WAL data. It reserves a new private bundle directory, verifies SQLite integrity and stored checksums, fsyncs the database, and writes the manifest last. It does not copy a live main database file while ignoring its WAL.

inspectBackup(directory) validates the byte count/hash, schema, SQLite quick_check, store identity, current snapshots and history checksums. Backups are limited to 256 MiB by this first implementation. There is no automatic retention, deletion, scheduler, remote upload or encryption key management. Protect backup roots using the cloud account's access/encryption controls. A backup on the same volume does not protect against volume loss.

The backing operation temporarily prevents mutations through the same store connection. Run maintenance with an idle/quiesced service. Other SQLite connections may continue writing; SQLite's backup API restarts as necessary for a consistent snapshot. Disk quotas and request/maintenance deadlines remain host responsibilities.

Duplicate backup IDs never overwrite prior bundles. Errors may leave a private partial bundle; no manifest means it is not complete. No automatic cleanup discards those files.

## Restore and quarantine

restoreBackup({backupDirectory, targetDirectory, expectedManifestHash, forbiddenRoots, authorize}) requires an authenticated host authorization for the exact manifest hash and target directory. Authorization defaults to deny. The target must not exist; no live database or human file is overwritten. The copied bytes are checked again before mutation.

Backup databases are named snapshot.sqlite and are not live-store entry points. Restore publishes jobs.sqlite atomically only after quarantine is applied; it never exposes a runnable unquarantined clone.

The restored store receives a new store ID and retains source identity, restore hash, actor and time. Snapshots, approvals, provenance, history and event/decision IDs are preserved. Leases are cleared/fenced on the clone. It opens in quarantine: inspection/backup is available, while job registration, execution, review and reconciliation are blocked. There is no activation API.

A restored queued checkpoint is not evidence that its provider request never ran after the backup. Activation needs source-store fencing plus an authoritative event/request ledger, which are outside this milestone. Do not remove quarantine using manual SQL and call that safe recovery.

Backup manifests and hashes detect accidental corruption and stale approvals; they are not signatures against a malicious storage administrator.

## Reconciling an uncertain request

Use DurableAstraea({..., authorizeReconciliation}) with a trusted host callback. It receives the capability, run ID and copied command, and must authenticate the operator and verify external provider evidence before returning an actor. It defaults to deny and has no public HTTP/UI route.

Read the paused run and compute fingerprint(run, sha256) as expectedCheckpointHash. Commands include decisionId, requestId, kind, reason, evidenceRef and expectedCheckpointHash. There are exactly two kinds:

- abandon: cancel the paused run, preserving unknown token/cost reservations and making no provider call.
- record_completed: provide a receipt with matching requestId/providerId/modelId, receivedAt, usage and structured output. Core revalidates the role output, evidence, citations, original caps and confidence/critique gates before settling the reservation.

There is no “assume not started” or automatic retry action. Settlement itself dispatches nothing. An explicit subsequent execute may run the remaining steps with the original budget and source context. A reconciled synthesis remains awaiting_approval; it never inherits the operator's reconciliation authorization as knowledge/publication approval.

An identical decision ID/command replays without another settlement. Reused IDs with different commands/runs are rejected transactionally. Decision provenance enters the artifact manifest. Caller mutations while authorization is pending cannot change the approved command.

## Schema upgrade and verification

New databases use user_version 3. A v0.2 schema-2 database fails with STORE_UPGRADE_REQUIRED unless allowUpgrade: true is explicitly supplied. Quiesce old executors and take a consistent pre-upgrade SQLite backup before opting in. The upgrade adds tables atomically and preserves existing snapshots/history. No destructive rollback or automatic downgrade is provided.

Run in a cloud checkout with a Node release supporting node:sqlite backup (Node 22.16+; CI covers current 22 and 24):

```sh
node "Astraea III/AstraeaCore/test/run.mjs"
node --test "Astraea III/AstraeaCore/test/durable.test.mjs" "Astraea III/AstraeaCore/test/github-reader.test.mjs" "Astraea III/AstraeaCore/test/operations.test.mjs"
```

The native operations tests cover WAL backup, restore quarantine, tampering, existing-file preservation, authorization, settled budgets/idempotency, schema upgrades, and zero-cost mount configuration. These do not prove that any production cloud volume exists or that a live provider's receipt can be independently verified.
