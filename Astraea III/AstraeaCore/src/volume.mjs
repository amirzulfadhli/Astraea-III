import {realpath, stat, readFile, writeFile, open} from "node:fs/promises";
import {join} from "node:path";
import {check, CoreError, textValue, copy, fingerprint} from "./contracts.mjs";
import {privateDirectory, noSymlinks, sha256} from "./sqlite-store.mjs";

export function volumePlan(config) {
  check(config && config.schemaVersion === "1" && config.environment === "cloud", "INVALID_VOLUME_PLAN");
  check(config.budgetMicroUsd === 0 && config.estimatedMonthlyMicroUsd === 0, "ZERO_COST_REQUIRED");
  const missing = ["provider", "accountId", "region", "volumeId", "mountPath"].filter(k =>
    typeof config[k] !== "string" || !config[k].trim());
  if (missing.length) return {ready: false, missing, monthlyBudgetMicroUsd: 0, createsCloudResources: false};
  for (const key of ["provider", "accountId", "region", "volumeId", "mountPath"]) textValue(config[key], "INVALID_VOLUME_PLAN", 500);
  check(config.mountPath.startsWith("/") && config.mountPath !== "/", "INVALID_MOUNT_PATH");
  return {ready: true, missing: [], monthlyBudgetMicroUsd: 0, createsCloudResources: false,
    planHash: fingerprint(config, sha256)};
}
export async function prepareExistingVolume({config, forbiddenRoots, verifyMount = async () => null}) {
  const approvedConfig = copy(config), plan = volumePlan(approvedConfig);
  check(plan.ready, "VOLUME_PLAN_INCOMPLETE");
  // A missing mount is an error. Never create an apparent mount on an ephemeral root disk.
  await noSymlinks(approvedConfig.mountPath);
  const mount = await realpath(approvedConfig.mountPath);
  check((await stat(mount)).isDirectory(), "INVALID_MOUNT_PATH");
  let proof;
  try {proof = await verifyMount({config: copy(approvedConfig), planHash: plan.planHash, mount});}
  catch {throw new CoreError("VOLUME_NOT_VERIFIED");}
  check(proof && proof.planHash === plan.planHash && proof.mountedPath === mount &&
    proof.free === true && proof.persistent === true && proof.sqliteLocking === true &&
    proof.ownerVerified === true, "VOLUME_NOT_VERIFIED");
  await privateDirectory(mount, forbiddenRoots);
  const markerPath = join(mount, ".astraea-volume.json");
  await noSymlinks(markerPath);
  const marker = {schemaVersion: "1", planHash: plan.planHash, provider: approvedConfig.provider,
    accountId: approvedConfig.accountId, region: approvedConfig.region, volumeId: approvedConfig.volumeId};
  try {await writeFile(markerPath, JSON.stringify(marker) + "\n", {flag: "wx", mode: 0o600});}
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    check((await stat(markerPath)).size <= 10000, "VOLUME_IDENTITY_MISMATCH");
    let prior; try {prior = JSON.parse(await readFile(markerPath, "utf8"));} catch {throw new CoreError("VOLUME_IDENTITY_MISMATCH");}
    check(fingerprint(prior, sha256) === fingerprint(marker, sha256), "VOLUME_IDENTITY_MISMATCH");
  }
  const file = await open(markerPath, "r"); try {await file.sync();} finally {await file.close();}
  const directory = await open(mount, "r"); try {await directory.sync();} finally {await directory.close();}
  return {mountPath: mount, stateDirectory: join(mount, "state"), planHash: plan.planHash,
    monthlyBudgetMicroUsd: 0, createsCloudResources: false};
}
