import {DatabaseSync} from "node:sqlite";
import {createHash, randomUUID} from "node:crypto";
import {createReadStream} from "node:fs";
import {constants} from "node:fs";
import {mkdir, open, readFile, writeFile, copyFile, stat, chmod, realpath, link, unlink} from "node:fs/promises";
import {join, dirname, resolve} from "node:path";
import {check, CoreError, id, canonical, fingerprint, copy} from "./contracts.mjs";
import {privateDirectory, noSymlinks, sha256} from "./sqlite-store.mjs";

const MAX_BYTES = 256 * 1024 * 1024;
async function flush(path) { const file = await open(path, "r"); try {await file.sync();} finally {await file.close();} }
async function fileHash(path) {
  const metadata = await stat(path);
  check(metadata.isFile() && metadata.size > 0 && metadata.size <= MAX_BYTES, "BACKUP_SIZE_LIMIT");
  const hash = createHash("sha256"); let size = 0;
  for await (const part of createReadStream(path)) {size += part.length; check(size <= MAX_BYTES, "BACKUP_SIZE_LIMIT"); hash.update(part);}
  return {sha256: hash.digest("hex"), bytes: size};
}
function databaseInfo(path) {
  const db = new DatabaseSync(path, {readOnly: true});
  try {
    check(db.prepare("PRAGMA quick_check").all().every(r => r.quick_check === "ok"), "BACKUP_INTEGRITY_FAILURE");
    check(db.prepare("PRAGMA user_version").get().user_version === 3, "UNSUPPORTED_STORE_SCHEMA");
    const storeId = db.prepare("SELECT value FROM metadata WHERE key='store_id'").get()?.value;
    check(typeof storeId === "string" && /^[a-f0-9-]{36}$/.test(storeId), "INVALID_BACKUP_IDENTITY");
    for (const row of db.prepare("SELECT * FROM runs").iterate()) {
      let snapshot; try {snapshot = JSON.parse(row.body);} catch {throw new CoreError("CORRUPT_CHECKPOINT");}
      check(fingerprint(snapshot, sha256) === row.checksum && snapshot.id === row.run_id &&
        snapshot.eventId === row.event_id && snapshot.jobHash === row.job_hash &&
        snapshot.registryHash === row.registry_hash, "CORRUPT_CHECKPOINT");
    }
    for (const row of db.prepare("SELECT body,checksum FROM history").iterate()) {
      let snapshot; try {snapshot = JSON.parse(row.body);} catch {throw new CoreError("CORRUPT_CHECKPOINT_HISTORY");}
      check(fingerprint(snapshot, sha256) === row.checksum, "CORRUPT_CHECKPOINT_HISTORY");
    }
    return {storeId, runCount: db.prepare("SELECT count(*) AS n FROM runs").get().n};
  } finally {db.close();}
}
export async function createBackup({store, backupRoot, backupId, forbiddenRoots, clock = Date.now}) {
  id(backupId);
  const root = await privateDirectory(backupRoot, forbiddenRoots);
  const bundle = join(root, backupId);
  await mkdir(bundle, {mode: 0o700}); // Exclusive directory creation: never overwrite a prior backup.
  const database = join(bundle, "snapshot.sqlite");
  const reserved = await open(database, "wx", 0o600); await reserved.close();
  await store.backupTo(database); // SQLite online backup includes committed WAL state.
  await chmod(database, 0o600); await flush(database);
  const digest = await fileHash(database), info = databaseInfo(database);
  const manifest = {schemaVersion: "1", backupId, createdAt: new Date(clock()).toISOString(),
    database: "snapshot.sqlite", databaseSchema: 3, ...info, ...digest};
  await writeFile(join(bundle, "manifest.json"), canonical(manifest) + "\n", {flag: "wx", mode: 0o600});
  await flush(join(bundle, "manifest.json")); await flush(bundle); await flush(root);
  return {directory: bundle, manifest, manifestHash: fingerprint(manifest, sha256)};
}
export async function inspectBackup(directory) {
  await noSymlinks(directory);
  const location = await realpath(directory);
  const manifestPath = join(location, "manifest.json"), database = join(location, "snapshot.sqlite");
  await noSymlinks(manifestPath); await noSymlinks(database);
  check((await stat(manifestPath)).size <= 10000, "INVALID_BACKUP_MANIFEST");
  let manifest; try {manifest = JSON.parse(await readFile(manifestPath, "utf8"));}
  catch {throw new CoreError("INVALID_BACKUP_MANIFEST");}
  check(manifest.schemaVersion === "1" && manifest.database === "snapshot.sqlite" && manifest.databaseSchema === 3 &&
    Number.isFinite(Date.parse(manifest.createdAt)), "INVALID_BACKUP_MANIFEST");
  id(manifest.backupId);
  const digest = await fileHash(database);
  check(digest.sha256 === manifest.sha256 && digest.bytes === manifest.bytes, "BACKUP_HASH_MISMATCH");
  const info = databaseInfo(database);
  check(info.storeId === manifest.storeId && info.runCount === manifest.runCount, "INVALID_BACKUP_IDENTITY");
  return {directory: location, manifest, manifestHash: fingerprint(manifest, sha256)};
}
export async function restoreBackup({backupDirectory, targetDirectory, expectedManifestHash, forbiddenRoots,
  authorize = async () => null, clock = Date.now}) {
  const inspected = await inspectBackup(backupDirectory);
  check(inspected.manifestHash === expectedManifestHash, "STALE_RESTORE_APPROVAL");
  const command = {capability: "restore_quarantined_store", manifestHash: inspected.manifestHash,
    targetDirectory: resolve(targetDirectory)};
  let permission;
  try {permission = await authorize(copy(command));} catch {throw new CoreError("RESTORE_NOT_AUTHORIZED");}
  check(permission && typeof permission.actor === "string" && permission.actor.trim(), "RESTORE_NOT_AUTHORIZED");
  // Validate the parent first; the final target MUST be newly created.
  const parent = await privateDirectory(dirname(command.targetDirectory), forbiddenRoots);
  check(resolve(parent, command.targetDirectory.split(/[\\/]/).at(-1)) === command.targetDirectory, "INVALID_STORE_LOCATION");
  await mkdir(command.targetDirectory, {mode: 0o700});
  const target = join(command.targetDirectory, "restore-candidate.sqlite");
  await copyFile(join(inspected.directory, "snapshot.sqlite"), target, constants.COPYFILE_EXCL);
  await chmod(target, 0o600);
  const digest = await fileHash(target);
  check(digest.sha256 === inspected.manifest.sha256, "BACKUP_CHANGED_DURING_RESTORE");
  databaseInfo(target);
  const db = new DatabaseSync(target);
  const storeId = randomUUID();
  try {
    db.exec("PRAGMA synchronous=FULL; BEGIN IMMEDIATE;");
    db.prepare("UPDATE metadata SET value='true' WHERE key='quarantine'").run();
    db.prepare("UPDATE metadata SET value=? WHERE key='store_id'").run(storeId);
    db.prepare("INSERT OR REPLACE INTO metadata VALUES('source_store_id',?)").run(inspected.manifest.storeId);
    db.prepare("INSERT OR REPLACE INTO metadata VALUES('restore_manifest_hash',?)").run(inspected.manifestHash);
    db.prepare("INSERT OR REPLACE INTO metadata VALUES('restored_at',?)").run(new Date(clock()).toISOString());
    db.prepare("INSERT OR REPLACE INTO metadata VALUES('restored_by',?)").run(permission.actor);
    db.exec("UPDATE runs SET lease_owner=NULL,lease_until=0,lease_epoch=lease_epoch+1; COMMIT;");
  } catch(error) {try {db.exec("ROLLBACK");} catch {} throw error;}
  finally {db.close();}
  await flush(target);
  // Publish only the quarantined database, atomically and without replacing any file.
  await link(target, join(command.targetDirectory, "jobs.sqlite"));
  await unlink(target); // Remove our temporary name; the complete database remains at jobs.sqlite.
  await flush(command.targetDirectory); await flush(parent);
  return {directory: command.targetDirectory, storeId, sourceStoreId: inspected.manifest.storeId,
    manifestHash: inspected.manifestHash, quarantine: true};
}
