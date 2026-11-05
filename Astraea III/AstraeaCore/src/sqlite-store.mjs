import {DatabaseSync, backup} from "node:sqlite";
import {mkdir, realpath, lstat, chmod} from "node:fs/promises";
import {resolve, relative, isAbsolute, parse, join, sep} from "node:path";
import {createHash, randomUUID} from "node:crypto";
import {check, CoreError, id, integer, canonical, fingerprint} from "./contracts.mjs";

export const sha256 = value => createHash("sha256").update(value, "utf8").digest("hex");
function inside(parent, child) { const p = relative(parent, child); return p === "" || (p !== ".." && !p.startsWith(".." + sep) && !isAbsolute(p)); }
export async function noSymlinks(path) {
  const absolute = resolve(path); let part = parse(absolute).root;
  for (const name of absolute.slice(part.length).split(/[\\/]/).filter(Boolean)) {
    part = join(part, name);
    try { check(!(await lstat(part)).isSymbolicLink(), "STORE_SYMLINK"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
export async function privateDirectory(directory, forbiddenRoots) {
  check(isAbsolute(directory) && Array.isArray(forbiddenRoots) && forbiddenRoots.length > 0 &&
    forbiddenRoots.every(isAbsolute), "INVALID_STORE_LOCATION");
  await noSymlinks(directory);
  const roots = await Promise.all(forbiddenRoots.map(p => realpath(p)));
  // Check the nearest existing ancestor BEFORE creating operational storage.
  let ancestor = resolve(directory);
  while (true) {
    try { ancestor = await realpath(ancestor); break; }
    catch (e) { if (e.code !== "ENOENT") throw e; const parent = resolve(ancestor, ".."); check(parent !== ancestor, "INVALID_STORE_LOCATION"); ancestor = parent; }
  }
  const target = resolve(directory);
  check(target !== parse(target).root, "INVALID_STORE_LOCATION");
  check(roots.every(root => !inside(root, target) && !inside(root, ancestor)), "STORE_INSIDE_REPOSITORY");
  await mkdir(target, {recursive: true, mode: 0o700});
  await noSymlinks(target);
  const location = await realpath(target);
  check(roots.every(root => !inside(root, location)), "STORE_INSIDE_REPOSITORY");

  return location;
}
export class SqliteJobStore {
  #db; #clock; #closed = false; #maintenance = false;
  static async open({directory, forbiddenRoots, clock = Date.now, allowUpgrade = false}) {
    const location = await privateDirectory(directory, forbiddenRoots);
    const databasePath = join(location, "jobs.sqlite");
    await noSymlinks(databasePath);
    const db = new DatabaseSync(databasePath);
    await chmod(databasePath, 0o600);
    try { return new SqliteJobStore(db, clock, allowUpgrade); } catch (error) { db.close(); throw error; }
  }
  constructor(db, clock, allowUpgrade = false) {
    this.#db = db; this.#clock = clock;
    db.exec("PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    const version = db.prepare("PRAGMA user_version").get().user_version;
    check([0, 2, 3].includes(version), "UNSUPPORTED_STORE_SCHEMA");
    check(version !== 2 || allowUpgrade, "STORE_UPGRADE_REQUIRED");
    db.exec("BEGIN IMMEDIATE");
    try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, job_hash TEXT NOT NULL,
        registry_hash TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, checksum TEXT NOT NULL,
        lease_owner TEXT, lease_epoch INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS history (
        run_id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, checksum TEXT NOT NULL,
        PRIMARY KEY (run_id, revision)
      );
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reconciliation_decisions (
        decision_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, command_hash TEXT NOT NULL
      );
      PRAGMA user_version=3;
    `);
    db.prepare("INSERT OR IGNORE INTO metadata VALUES('store_id',?)").run(randomUUID());
    db.prepare("INSERT OR IGNORE INTO metadata VALUES('quarantine','false')").run();
    db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  #transaction(fn) {
    check(!this.#maintenance, "STORE_MAINTENANCE");
    check(this.#db.prepare("SELECT value FROM metadata WHERE key='quarantine'").get()?.value === "false", "STORE_QUARANTINED");
    this.#db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.#db.exec("COMMIT"); return result; }
    catch (error) { this.#db.exec("ROLLBACK"); throw error; }
  }
  #decode(row) {
    check(row, "UNKNOWN_RUN");
    let snapshot; try { snapshot = JSON.parse(row.body); } catch { throw new CoreError("CORRUPT_CHECKPOINT"); }
    check(fingerprint(snapshot, sha256) === row.checksum && snapshot.id === row.run_id &&
      snapshot.eventId === row.event_id && snapshot.jobHash === row.job_hash &&
      snapshot.registryHash === row.registry_hash, "CORRUPT_CHECKPOINT");
    return {snapshot, revision: row.revision};
  }
  register(snapshot) {
    id(snapshot.id); id(snapshot.eventId); check(snapshot.status === "queued", "INVALID_INITIAL_SNAPSHOT");
    return this.#transaction(() => {
      const prior = this.#db.prepare("SELECT * FROM runs WHERE run_id=?").get(snapshot.id);
      if (prior) {
        check(prior.job_hash === snapshot.jobHash && prior.registry_hash === snapshot.registryHash, "RUN_ID_COLLISION");
        return this.#decode(prior);
      }
      check(!this.#db.prepare("SELECT run_id FROM runs WHERE event_id=?").get(snapshot.eventId), "DUPLICATE_EVENT");
      const body = canonical(snapshot), checksum = fingerprint(snapshot, sha256);
      this.#db.prepare("INSERT INTO runs(run_id,event_id,job_hash,registry_hash,revision,body,checksum) VALUES(?,?,?,?,1,?,?)")
        .run(snapshot.id, snapshot.eventId, snapshot.jobHash, snapshot.registryHash, body, checksum);
      this.#db.prepare("INSERT INTO history VALUES(?,1,?,?)").run(snapshot.id, body, checksum);
      return this.load(snapshot.id);
    });
  }
  load(runId) { id(runId); return this.#decode(this.#db.prepare("SELECT * FROM runs WHERE run_id=?").get(runId)); }
  acquire(runId, owner, leaseMs = 60000) {
    id(runId); id(owner); integer(leaseMs, "INVALID_LEASE", 1); check(leaseMs <= 3600000, "INVALID_LEASE");
    return this.#transaction(() => {
      const row = this.#db.prepare("SELECT * FROM runs WHERE run_id=?").get(runId); this.#decode(row);
      const now = this.#clock(); integer(now, "INVALID_CLOCK");
      check(row.lease_owner === null || row.lease_until <= now, "RUN_LEASE_HELD");
      const epoch = row.lease_epoch + 1; integer(epoch, "LEASE_EPOCH_EXHAUSTED", 1);
      this.#db.prepare("UPDATE runs SET lease_owner=?,lease_epoch=?,lease_until=? WHERE run_id=?")
        .run(owner, epoch, now + leaseMs, runId);
      return {runId, owner, epoch, leaseMs};
    });
  }
  save(snapshot, expectedRevision, lease) {
    id(snapshot.id); integer(expectedRevision, "INVALID_REVISION", 1);
    return this.#transaction(() => {
      const row = this.#db.prepare("SELECT * FROM runs WHERE run_id=?").get(snapshot.id); this.#decode(row);
      check(row.revision === expectedRevision, "STALE_REVISION");
      check(lease && lease.runId === snapshot.id && row.lease_owner === lease.owner &&
        row.lease_epoch === lease.epoch && row.lease_until > this.#clock(), "LEASE_LOST");
      check(snapshot.jobHash === row.job_hash && snapshot.registryHash === row.registry_hash &&
        snapshot.eventId === row.event_id, "CHECKPOINT_IDENTITY_MISMATCH");
      for (const decision of snapshot.reconciliations || []) {
        id(decision.decisionId);
        check(/^[a-f0-9]{64}$/.test(decision.commandHash), "INVALID_RECONCILIATION_HISTORY");
        const prior = this.#db.prepare("SELECT * FROM reconciliation_decisions WHERE decision_id=?").get(decision.decisionId);
        check(!prior || (prior.run_id === snapshot.id && prior.command_hash === decision.commandHash), "RECONCILIATION_ID_COLLISION");
        if (!prior) this.#db.prepare("INSERT INTO reconciliation_decisions VALUES(?,?,?)")
          .run(decision.decisionId, snapshot.id, decision.commandHash);
      }
      const body = canonical(snapshot), checksum = fingerprint(snapshot, sha256), revision = row.revision + 1;
      this.#db.prepare("UPDATE runs SET body=?,checksum=?,revision=?,lease_until=? WHERE run_id=?")
        .run(body, checksum, revision, this.#clock() + lease.leaseMs, snapshot.id);
      this.#db.prepare("INSERT INTO history VALUES(?,?,?,?)").run(snapshot.id, revision, body, checksum);
      return {snapshot: JSON.parse(body), revision};
    });
  }
  release(lease) {
    this.#db.prepare("UPDATE runs SET lease_owner=NULL,lease_until=0 WHERE run_id=? AND lease_owner=? AND lease_epoch=?")
      .run(lease.runId, lease.owner, lease.epoch);
  }
  inspect() {
    return {storeId: this.#db.prepare("SELECT value FROM metadata WHERE key='store_id'").get().value,
      quarantine: this.#db.prepare("SELECT value FROM metadata WHERE key='quarantine'").get().value === "true",
      schemaVersion: 3, runCount: this.#db.prepare("SELECT count(*) AS n FROM runs").get().n};
  }
  listRunIds() { return this.#db.prepare("SELECT run_id FROM runs ORDER BY run_id").all().map(row => row.run_id); }
  async backupTo(destination) {
    check(!this.#maintenance, "STORE_MAINTENANCE"); this.#maintenance = true;
    try { return await backup(this.#db, destination); } finally {this.#maintenance = false;}
  }
  close() { check(!this.#maintenance, "STORE_MAINTENANCE"); if (!this.#closed) { this.#db.close(); this.#closed = true; } }
}
