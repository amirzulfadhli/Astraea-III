import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, rm, readFile, writeFile, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve, sep} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {SqliteJobStore, sha256} from "../src/sqlite-store.mjs";
import {DurableAstraea} from "../src/durable-core.mjs";
import {AstraeaCore} from "../src/core.mjs";
import {fingerprint, canonical} from "../src/contracts.mjs";
import {createBackup, inspectBackup, restoreBackup} from "../src/backup.mjs";
import {volumePlan, prepareExistingVolume} from "../src/volume.mjs";
import {testRegistry, fixtureProvider, demoJob} from "./helpers.mjs";
const code = expected => error => error.code === expected;
const allow = async () => ({actor: "verified-operator"});
async function env(t) {
  const root = await mkdtemp(join(tmpdir(), "astraea-ops-")), stores = [];
  const open = async (directory = join(root, "state"), extra = {}) => {
    const store = await SqliteJobStore.open({directory, forbiddenRoots: [process.cwd()], ...extra});
    stores.push(store); return store;
  };
  const store = await open();
  const service = (s = store, extra = {}) => new DurableAstraea({store: s,
    registry: testRegistry(), providers: {fixture: fixtureProvider()}, ...extra});
  const backup = (backupId = "B1") => createBackup({store, backupId, backupRoot: join(root, "backups"), forbiddenRoots: [process.cwd()]});
  const restore = (bundle, extra = {}) => restoreBackup({backupDirectory: bundle.directory,
    targetDirectory: join(root, "restored"), expectedManifestHash: bundle.manifestHash,
    forbiddenRoots: [process.cwd()], authorize: allow, ...extra});
  t.after(async () => {
    for (const s of stores) s.close();
    assert(root.startsWith(resolve(tmpdir()) + sep) && root.includes("astraea-ops-"));
    await rm(root, {recursive: true});
  });
  return {root, store, open, service, backup, restore};
}
async function pending(e, job = demoJob()) {
  const service = e.service(e.store, {providers: {fixture: {locality: "local", execute() {throw new Error("uncertain");}}}});
  service.submit(job); const run = await service.execute(job.runId);
  const command = {decisionId: "D1", kind: "record_completed", requestId: job.runId + ":Scout",
    expectedCheckpointHash: fingerprint(run, sha256), reason: "Operator verified receipt",
    evidenceRef: "provider-ledger:1", receipt: {providerId: "fixture", modelId: "fixture-v0",
      requestId: job.runId + ":Scout", receivedAt: "2026-11-05T00:00:00Z",
      output: {questions: ["Scope"]}, usage: {tokens: 13, microUsd: 0}}};
  return {service, run, command};
}
test("online SQLite backup includes committed WAL jobs and revision history", async t => {
  const e = await env(t); e.service().submit(demoJob()); await e.service().execute("demo-run");
  const bundle = await e.backup(); const inspected = await inspectBackup(bundle.directory);
  assert.equal(inspected.manifestHash, bundle.manifestHash); assert.equal(inspected.manifest.runCount, 1);
  assert.equal(inspected.manifest.storeId, e.store.inspect().storeId);
});
test("restored store preserves source provenance, approvals and dedupe in quarantine", async t => {
  const e = await env(t); const s = e.service(); s.submit(demoJob()); const run = await s.execute("demo-run");
  const approved = await s.review(run.id, {actor: "human", decision: "approve", artifactHash: run.artifact.hash});
  const bundle = await e.backup(), restored = await e.restore(bundle);
  const copy = await e.open(restored.directory);
  assert.equal(copy.inspect().quarantine, true); assert.notEqual(copy.inspect().storeId, e.store.inspect().storeId);
  assert.deepEqual(copy.load(run.id).snapshot, approved);
  assert.throws(() => e.service(copy).submit(demoJob()), code("STORE_QUARANTINED"));
  await assert.rejects(() => e.service(copy).execute(run.id), code("STORE_QUARANTINED"));
});
test("even queued jobs from an old backup cannot replay after restore", async t => {
  const e = await env(t); e.service().submit(demoJob()); const bundle = await e.backup();
  await e.service().execute("demo-run");
  const restored = await e.restore(bundle), s = await e.open(restored.directory);
  assert.equal(s.load("demo-run").snapshot.status, "queued");
  await assert.rejects(() => e.service(s).execute("demo-run"), code("STORE_QUARANTINED"));
});
test("restores refuse an existing target without overwriting any file", async t => {
  const e = await env(t); const b = await e.backup(); const target = join(e.root, "restored");
  await mkdir(target); await writeFile(join(target, "human.txt"), "preserve");
  await assert.rejects(() => e.restore(b), error => error.code === "EEXIST");
  assert.equal(await readFile(join(target, "human.txt"), "utf8"), "preserve");
});
test("restore authority defaults to deny before target creation", async t => {
  const e = await env(t); const b = await e.backup();
  await assert.rejects(() => e.restore(b, {authorize: async () => null}), code("RESTORE_NOT_AUTHORIZED"));
  await assert.rejects(() => stat(join(e.root, "restored")), error => error.code === "ENOENT");
});
test("restore approval binds the exact manifest hash", async t => {
  const e = await env(t); const b = await e.backup();
  await assert.rejects(() => e.restore(b, {expectedManifestHash: "f".repeat(64)}), code("STALE_RESTORE_APPROVAL"));
});
test("backup bytes changed after creation fail verification", async t => {
  const e = await env(t); const b = await e.backup();
  await writeFile(join(b.directory, "snapshot.sqlite"), "tampered", {flag: "a"});
  await assert.rejects(() => inspectBackup(b.directory), code("BACKUP_HASH_MISMATCH"));
});
test("duplicate backup IDs preserve the prior backup", async t => {
  const e = await env(t); const b = await e.backup();
  await assert.rejects(() => e.backup(), error => error.code === "EEXIST");
  assert.equal((await inspectBackup(b.directory)).manifestHash, b.manifestHash);
});
test("partial backup directories are not restorable", async t => {
  const e = await env(t); const partial = join(e.root, "partial"); await mkdir(partial);
  await assert.rejects(() => inspectBackup(partial));
});
test("backup files and manifests use private permissions", async t => {
  const e = await env(t); const b = await e.backup();
  for (const file of ["snapshot.sqlite", "manifest.json"])
    assert.equal((await stat(join(b.directory, file))).mode & 0o777, 0o600);
});
test("backup/restore preserves global reconciliation IDs", async t => {
  const e = await env(t); const {command} = await pending(e);
  const s = e.service(e.store, {authorizeReconciliation: allow});
  await s.reconcile("demo-run", {...command, kind: "abandon"});
  const b = await e.backup(), restored = await e.restore(b);
  const db = new DatabaseSync(join(restored.directory, "jobs.sqlite"), {readOnly: true});
  try {assert.equal(db.prepare("SELECT count(*) AS n FROM reconciliation_decisions").get().n, 1);}
  finally {db.close();}
});
test("reconciliation defaults to deny without an authenticated host", async t => {
  const e = await env(t); const {service, command, run} = await pending(e);
  await assert.rejects(() => service.reconcile(run.id, {...command, actor: "pretend-human"}), code("RECONCILIATION_NOT_AUTHORIZED"));
  assert.deepEqual(service.get(run.id), run);
});
test("authenticated completion persists once and resumes remaining steps", async t => {
  const e = await env(t); const {command, run} = await pending(e);
  const s = e.service(e.store, {authorizeReconciliation: allow});
  const settled = await s.reconcile(run.id, command);
  assert.equal(settled.usage.tokens, 13); assert.equal(settled.reconciliations[0].actor, "verified-operator");
  assert.deepEqual(await s.reconcile(run.id, command), settled);
  const final = await s.execute(run.id); assert.equal(final.status, "awaiting_approval");
  assert.equal(final.approvals.length, 0); assert.equal(final.artifact.manifest.reconciliations.length, 1);
});
test("reconciliation survives a store reopen without a duplicate settlement", async t => {
  const e = await env(t); const {command, run} = await pending(e);
  const s = e.service(e.store, {authorizeReconciliation: allow}); const settled = await s.reconcile(run.id, command);
  e.store.close(); const reopened = await e.open();
  const next = e.service(reopened, {authorizeReconciliation: allow});
  assert.deepEqual(await next.reconcile(run.id, command), settled);
});
test("abandonment preserves unknown costs and never dispatches again", async t => {
  const e = await env(t); const {command, run} = await pending(e);
  const s = e.service(e.store, {authorizeReconciliation: allow});
  const cancelled = await s.reconcile(run.id, {...command, kind: "abandon"});
  assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.usage.tokens, 1000);
  assert.equal((await s.execute(run.id)).status, "cancelled");
});
test("global reconciliation ID collisions roll back the second settlement", async t => {
  const e = await env(t); const first = await pending(e);
  const s = e.service(e.store, {authorizeReconciliation: allow});
  await s.reconcile(first.run.id, {...first.command, kind: "abandon"});
  const job = {...demoJob(), id: "J2", runId: "R2", eventId: "E2"}; const second = await pending(e, job);
  await assert.rejects(() => s.reconcile(second.run.id, second.command), code("CHECKPOINT_FAILED"));
  assert.equal(s.get(second.run.id).status, "needs_reconciliation"); assert.equal(s.get(second.run.id).usage.tokens, 1000);
});
test("caller command mutation during authorization cannot change the approved payload", async t => {
  const e = await env(t); const {command, run} = await pending(e); let release, ready;
  const gate = new Promise(r => {release = r;}); const entered = new Promise(r => {ready = r;});
  const s = e.service(e.store, {authorizeReconciliation: async () => {ready(); await gate; return {actor: "human"};}});
  const operation = s.reconcile(run.id, command); await entered; command.receipt.usage.tokens = 999; release();
  assert.equal((await operation).usage.tokens, 13);
});
async function legacy(t) {
  const e = await env(t); const directory = join(e.root, "legacy"); await mkdir(directory);
  const db = new DatabaseSync(join(directory, "jobs.sqlite"));
  db.exec(`CREATE TABLE runs(run_id TEXT PRIMARY KEY,event_id TEXT UNIQUE NOT NULL,job_hash TEXT NOT NULL,
    registry_hash TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,checksum TEXT NOT NULL,
    lease_owner TEXT,lease_epoch INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE history(run_id TEXT,revision INTEGER,body TEXT,checksum TEXT,PRIMARY KEY(run_id,revision));
    PRAGMA user_version=2;`);
  const core = new AstraeaCore({registry: testRegistry(), providers: {fixture: fixtureProvider()}, hash: sha256});
  const run = core.createRun(demoJob()), body = canonical(run), digest = fingerprint(run, sha256);
  db.prepare("INSERT INTO runs(run_id,event_id,job_hash,registry_hash,revision,body,checksum) VALUES(?,?,?,?,1,?,?)")
    .run(run.id,run.eventId,run.jobHash,run.registryHash,body,digest);
  db.prepare("INSERT INTO history VALUES(?,1,?,?)").run(run.id,body,digest); db.close();
  return {...e, directory, run};
}
test("legacy schema requires an explicit additive upgrade", async t => {
  const e = await legacy(t);
  await assert.rejects(() => e.open(e.directory), code("STORE_UPGRADE_REQUIRED"));
});
test("explicit schema upgrade preserves jobs and history", async t => {
  const e = await legacy(t); const s = await e.open(e.directory, {allowUpgrade: true});
  assert.deepEqual(s.load("demo-run").snapshot, e.run); assert.equal(s.inspect().schemaVersion, 3);
  const db = new DatabaseSync(join(e.directory, "jobs.sqlite"), {readOnly: true});
  try {assert.equal(db.prepare("SELECT count(*) AS n FROM history").get().n, 1);} finally {db.close();}
});
const config = mountPath => ({schemaVersion: "1", environment: "cloud", provider: "test-cloud",
  accountId: "test-account", region: "test-region", volumeId: "test-volume", mountPath,
  budgetMicroUsd: 0, estimatedMonthlyMicroUsd: 0});
const verified = async ({mount, planHash}) => ({planHash, mountedPath: mount, free: true,
  persistent: true, sqliteLocking: true, ownerVerified: true});
test("undecided provider yields a blocked zero-cost plan", () => {
  const result = volumePlan({...config(null), provider: null});
  assert.equal(result.ready, false); assert.equal(result.createsCloudResources, false);
});
test("positive infrastructure spend is rejected", () => {
  assert.throws(() => volumePlan({...config("/mounted"), estimatedMonthlyMicroUsd: 1}), code("ZERO_COST_REQUIRED"));
});
test("missing cloud mounts are never silently created", async t => {
  const e = await env(t), missing = join(e.root, "missing");
  await assert.rejects(() => prepareExistingVolume({config: config(missing),
    forbiddenRoots: [process.cwd()], verifyMount: verified}), error => error.code === "ENOENT");
  await assert.rejects(() => stat(missing), error => error.code === "ENOENT");
});
test("existing free mounts require trusted persistence and ownership proof", async t => {
  const e = await env(t);
  await assert.rejects(() => prepareExistingVolume({config: config(e.root), forbiddenRoots: [process.cwd()]}),
    code("VOLUME_NOT_VERIFIED"));
});
test("verified free mount setup is repeatable and never purchases resources", async t => {
  const e = await env(t), input = {config: config(e.root), forbiddenRoots: [process.cwd()], verifyMount: verified};
  const first = await prepareExistingVolume(input), second = await prepareExistingVolume(input);
  assert.deepEqual(first, second); assert.equal(first.createsCloudResources, false);
  assert.equal(first.monthlyBudgetMicroUsd, 0);
});
test("changed volume identity preserves its existing ownership marker", async t => {
  const e = await env(t), input = {config: config(e.root), forbiddenRoots: [process.cwd()], verifyMount: verified};
  await prepareExistingVolume(input);
  const marker = await readFile(join(e.root, ".astraea-volume.json"), "utf8");
  await assert.rejects(() => prepareExistingVolume({...input, config: {...input.config, volumeId: "changed"}}),
    code("VOLUME_IDENTITY_MISMATCH"));
  assert.equal(await readFile(join(e.root, ".astraea-volume.json"), "utf8"), marker);
});
test("cloud volume setup rejects repository directories", async t => {
  const e = await env(t), repo = join(e.root, "repo"); await mkdir(repo);
  await assert.rejects(() => prepareExistingVolume({config: config(repo),
    forbiddenRoots: [repo], verifyMount: verified}), code("STORE_INSIDE_REPOSITORY"));
});
