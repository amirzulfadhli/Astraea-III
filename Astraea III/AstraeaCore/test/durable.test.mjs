import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, rm, symlink, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve, sep} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {SqliteJobStore} from "../src/sqlite-store.mjs";
import {DurableAstraea} from "../src/durable-core.mjs";
import {testRegistry, fixtureProvider, demoJob} from "./helpers.mjs";

async function env(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "astraea-v02-"));
  const directory = join(root, "state"), stores = [];
  const open = async (overrides = {}) => {
    const store = await SqliteJobStore.open({directory, forbiddenRoots: [process.cwd()], ...options, ...overrides});
    stores.push(store); return store;
  };
  t.after(async () => {
    for (const store of stores) store.close();
    assert(root.startsWith(resolve(tmpdir()) + sep) && root.includes("astraea-v02-"));
    await rm(root, {recursive: true});
  });
  const store = await open();
  const service = (s = store, extra = {}) => new DurableAstraea({
    store: s, registry: testRegistry(), providers: {fixture: fixtureProvider()}, ...extra});
  return {root, directory, store, open, service};
}
const code = expected => error => error.code === expected;
function crash(directory, mode) {
  return spawnSync(process.execPath, [fileURLToPath(new URL("./crash-worker.mjs", import.meta.url)), directory, mode],
    {cwd: process.cwd(), encoding: "utf8", timeout: 10000});
}
test("submitted job survives a database close and reopen", async t => {
  const e = await env(t); e.service().submit(demoJob()); e.store.close();
  const next = await e.open(); assert.equal(e.service(next).get("demo-run").status, "queued");
});
test("identical durable submissions return the existing job", async t => {
  const e = await env(t); const s = e.service(); s.submit(demoJob()); s.submit(demoJob());
  assert.equal(e.store.load("demo-run").revision, 1);
});
test("event IDs remain unique across processes and run IDs", async t => {
  const e = await env(t); e.service().submit(demoJob()); const other = await e.open();
  assert.throws(() => e.service(other).submit({...demoJob(), runId: "another-run"}), code("DUPLICATE_EVENT"));
});
test("durable run ID collision cannot replace an existing request", async t => {
  const e = await env(t); e.service().submit(demoJob());
  assert.throws(() => e.service().submit({...demoJob(), question: "changed"}), code("RUN_ID_COLLISION"));
});
test("terminal replay after reopen never calls providers", async t => {
  const e = await env(t); const s = e.service(); s.submit(demoJob()); await s.execute("demo-run"); e.store.close();
  let calls = 0; const next = e.service(await e.open(), {providers: {fixture: {locality: "local", execute() {calls++;}}}});
  assert.equal((await next.execute("demo-run")).status, "awaiting_approval"); assert.equal(calls, 0);
});
test("approval and provenance survive restart", async t => {
  const e = await env(t); const s = e.service(); s.submit(demoJob()); const run = await s.execute("demo-run");
  await s.review(run.id, {actor: "human", artifactHash: run.artifact.hash, decision: "approve"}); e.store.close();
  const next = e.service(await e.open()); const saved = await next.execute(run.id);
  assert.equal(saved.status, "approved"); assert.equal(saved.artifact.hash, run.artifact.hash);
});
test("cancelled jobs remain cancelled across restart", async t => {
  const e = await env(t); const s = e.service(); s.submit(demoJob()); await s.cancel("demo-run"); e.store.close();
  assert.equal((await e.service(await e.open()).execute("demo-run")).status, "cancelled");
});
test("database stores monotonically revised checkpoint history", async t => {
  const e = await env(t); const s = e.service(); s.submit(demoJob()); await s.execute("demo-run");
  const db = new DatabaseSync(join(e.directory, "jobs.sqlite"), {readOnly: true});
  try {
    const rows = db.prepare("SELECT revision FROM history ORDER BY revision").all();
    assert(rows.length > 10); assert.deepEqual(rows.map(r => r.revision), Array.from({length: rows.length}, (_,i) => i+1));
  } finally {db.close();}
});
test("a second connection cannot acquire an active run lease", async t => {
  const e = await env(t); e.service().submit(demoJob()); e.store.acquire("demo-run", "owner-a");
  const other = await e.open(); assert.throws(() => other.acquire("demo-run", "owner-b"), code("RUN_LEASE_HELD"));
});
test("stale checkpoint revisions cannot overwrite newer data", async t => {
  const e = await env(t); e.service().submit(demoJob()); const lease = e.store.acquire("demo-run", "owner");
  const saved = e.store.load("demo-run"); e.store.save(saved.snapshot, saved.revision, lease);
  assert.throws(() => e.store.save(saved.snapshot, saved.revision, lease), code("STALE_REVISION"));
});
test("expired lease epochs fence the old writer, including owner reuse", async t => {
  let now = 1000; const e = await env(t, {clock: () => now}); e.service().submit(demoJob());
  const old = e.store.acquire("demo-run", "owner", 10); now = 1011;
  const current = e.store.acquire("demo-run", "owner", 10); const saved = e.store.load("demo-run");
  assert.throws(() => e.store.save(saved.snapshot, saved.revision, old), code("LEASE_LOST"));
  e.store.release(old); e.store.save(saved.snapshot, saved.revision, current);
});
test("checksum corruption fails closed without dispatch", async t => {
  const e = await env(t); e.service().submit(demoJob()); e.store.close();
  const db = new DatabaseSync(join(e.directory, "jobs.sqlite"));
  db.prepare("UPDATE runs SET body=? WHERE run_id=?").run("{}", "demo-run"); db.close();
  const next = await e.open(); assert.throws(() => next.load("demo-run"), code("CORRUPT_CHECKPOINT"));
});
test("crash during an uncommitted transaction preserves the prior checkpoint", async t => {
  const e = await env(t); e.service().submit(demoJob()); e.store.close();
  const child = crash(e.directory, "transaction"); assert.equal(child.status, 47, child.stderr);
  const next = await e.open(); assert.equal(next.load("demo-run").snapshot.status, "queued");
});
test("process crash after completed checkpoint resumes only remaining workers", async t => {
  const e = await env(t); e.store.close(); const child = crash(e.directory, "completed");
  assert.equal(child.status, 44, child.stderr);
  const next = await e.open({clock: () => Date.now()+2000}); const calls = [], fixture = fixtureProvider();
  const s = e.service(next, {providers: {fixture: {locality: "local", execute(request) {
    calls.push(request.role); return fixture.execute(request);
  }}}});
  const run = await s.execute("demo-run");
  assert.equal(run.status, "awaiting_approval"); assert.deepEqual(calls, ["Researcher", "Analyst", "Critic", "Synthesizer"]);
  assert.equal(run.usage.calls, 5);
});
test("process crash with in-flight request pauses without duplicate dispatch or refund", async t => {
  const e = await env(t); e.store.close(); const child = crash(e.directory, "inflight");
  assert.equal(child.status, 45, child.stderr);
  const next = await e.open({clock: () => Date.now()+2000}); let calls = 0;
  const s = e.service(next, {providers: {fixture: {locality: "local", execute() {calls++;}}}});
  const run = await s.execute("demo-run"); assert.equal(run.status, "needs_reconciliation");
  assert.equal(run.usage.tokens, 1000); assert.equal(calls, 0);
  next.close(); const reopened = await e.open();
  assert.equal(e.service(reopened).get("demo-run").status, "needs_reconciliation");
});
test("storage refuses locations inside the declared repository boundary", async t => {
  const e = await env(t); const forbidden = join(e.root, "repository"); await mkdir(forbidden);
  await assert.rejects(() => SqliteJobStore.open({directory: join(forbidden, "state"), forbiddenRoots: [forbidden]}),
    code("STORE_INSIDE_REPOSITORY"));
});
test("storage rejects symlink directories", async t => {
  const e = await env(t); const link = join(e.root, "link"); await symlink(e.directory, link);
  await assert.rejects(() => SqliteJobStore.open({directory: link, forbiddenRoots: [process.cwd()]}), code("STORE_SYMLINK"));
});
test("storage rejects symlink database files", async t => {
  const e = await env(t); const other = join(e.root, "other"); await mkdir(other);
  await symlink(join(e.directory, "jobs.sqlite"), join(other, "jobs.sqlite"));
  await assert.rejects(() => SqliteJobStore.open({directory: other, forbiddenRoots: [process.cwd()]}), code("STORE_SYMLINK"));
});
test("SQLite database file permissions are private", async t => {
  const e = await env(t); assert.equal((await stat(join(e.directory, "jobs.sqlite"))).mode & 0o777, 0o600);
});
test("failed persistence before dispatch leaves no provider side effect", async t => {
  const e = await env(t); let calls = 0, saves = 0; const save = e.store.save.bind(e.store);
  e.store.save = (...args) => {if (++saves === 2) throw new Error("disk fault"); return save(...args);};
  const s = e.service(e.store, {providers: {fixture: {locality: "local", execute() {calls++;}}}});
  s.submit(demoJob()); await assert.rejects(() => s.execute("demo-run"), code("CHECKPOINT_FAILED"));
  assert.equal(calls, 0); assert.equal(e.store.load("demo-run").snapshot.steps.length, 0);
});
test("lease loss after dispatch prevents a stale process from persisting its response", async t => {
  let now = 1000; const e = await env(t, {clock: () => now}); let release, started;
  const ready = new Promise(r => {started = r;}); const wait = new Promise(r => {release = r;});
  const fixture = fixtureProvider();
  const first = e.service(e.store, {leaseMs: 10, providers: {fixture: {locality: "local", async execute(request) {
    started(); await wait; return fixture.execute(request);
  }}}}); first.submit(demoJob()); const pending = first.execute("demo-run"); await ready;
  now = 1011; const secondStore = await e.open({clock: () => now}); const second = e.service(secondStore, {leaseMs: 10});
  assert.equal((await second.execute("demo-run")).status, "needs_reconciliation");
  release(); await assert.rejects(() => pending, code("CHECKPOINT_FAILED"));
  assert.equal(secondStore.load("demo-run").snapshot.status, "needs_reconciliation");
});

test("dot-prefixed child directory does not bypass the repository exclusion", async t => {
  const e = await env(t); const repo = join(e.root, "repo"), directory = join(repo, "..state");
  await mkdir(directory, {recursive: true});
  await assert.rejects(() => SqliteJobStore.open({directory, forbiddenRoots: [repo]}), code("STORE_INSIDE_REPOSITORY"));
});
