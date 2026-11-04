import { check, id, relativePath, textValue, copy } from "./contracts.mjs";

const HASH = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
export const REPOSITORY = Object.freeze({
  fullName: "amirzulfadhli/Astraea-III", branch: "main", vaultPrefix: "Astraea III"
});
function configValid(config) {
  check(config && config.fullName === REPOSITORY.fullName && config.branch === REPOSITORY.branch &&
    config.vaultPrefix === REPOSITORY.vaultPrefix, "REPOSITORY_MISMATCH");
}
function observationValid(config, observed) {
  configValid(config);
  check(observed && observed.fullName === config.fullName && observed.branch === config.branch &&
    observed.boundaryVerified === true, "REPOSITORY_MISMATCH");
  check(SHA.test(observed.head) && SHA.test(observed.remoteHead), "INVALID_GIT_SHA");
  check(observed.fetched === true, "REMOTE_UNKNOWN");
  check(observed.lockOwned === true, "LOCK_REQUIRED");
  check(Array.isArray(observed.conflicts) && observed.conflicts.length === 0 &&
    observed.operationInProgress === false, "GIT_CONFLICT");
}
export function preflight(config, observed) {
  observationValid(config, observed);
  check(observed.clean === true, "DIRTY_WORKING_TREE");
  check(["equal", "behind", "ahead", "diverged"].includes(observed.relation), "REMOTE_UNKNOWN");
  check(observed.relation !== "diverged", "DIVERGED_HISTORY");
  check(observed.relation !== "ahead", "UNRELATED_LOCAL_COMMITS");
  if (observed.relation === "behind") return {action: "fast_forward_pull", revalidate: true};
  check(observed.head === observed.remoteHead, "REMOTE_CHANGED");
  return {action: "execute", baseCommit: observed.head};
}
export function classifyPath(path, config = REPOSITORY) {
  configValid(config); relativePath(path);
  const segments = path.toLowerCase().split("/");
  if (segments.some(s => s.startsWith(".") || /^(credentials|secrets?|id_rsa|id_ed25519)([.\-_]|$)/.test(s)) ||
    /\.(pem|key|p12|pfx)$/i.test(path)) return "excluded";
  if (!path.startsWith(config.vaultPrefix + "/")) return "excluded";
  const local = path.slice(config.vaultPrefix.length + 1);
  if (/^AstraeaCore\/drafts\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\/(synthesis\.md|manifest\.json)$/.test(local)) return "agent_draft";
  return "review_required";
}
// Produce a plan only. This module never reads a worktree, changes a file, or invokes Git.
export function planCommit({config = REPOSITORY, observed, baseCommit, runId, jobId,
  changes, approvals = []}) {
  observationValid(config, observed); id(runId); id(jobId);
  check(observed.head === baseCommit && observed.remoteHead === baseCommit && observed.relation === "equal", "STALE_BASE");
  check(Array.isArray(changes) && changes.length > 0 && changes.length <= 100, "INVALID_CHANGESET");
  check(Array.isArray(observed.changedPaths), "MISSING_CHANGE_INVENTORY");
  check(new Set(changes.map(c => c.path)).size === changes.length, "DUPLICATE_PATH");
  check(new Set(observed.changedPaths).size === changes.length &&
    observed.changedPaths.every(p => changes.some(c => c.path === p)), "UNRELATED_CHANGES");
  const review = [];
  for (const change of changes) {
    relativePath(change.path);
    check(change.mode === "100644" && change.origin === "agent" && change.runId === runId, "UNTRUSTED_CHANGE");
    check(HASH.test(change.afterHash) && (change.beforeHash === null || HASH.test(change.beforeHash)), "INVALID_CONTENT_HASH");
    check(change.observedBeforeHash === change.beforeHash, "HUMAN_EDIT_DETECTED");
    const kind = classifyPath(change.path, config);
    check(kind !== "excluded", "EXCLUDED_PATH");
    if (kind === "agent_draft") check(change.path.startsWith(config.vaultPrefix + "/AstraeaCore/drafts/" + runId + "/"), "WRONG_RUN_PATH");
    if (kind === "review_required" || change.beforeHash !== null) {
      const approved = approvals.some(a => a.path === change.path && a.afterHash === change.afterHash &&
        a.beforeHash === change.beforeHash && a.decision === "approve" && typeof a.actor === "string" && a.actor.trim());
      if (!approved) review.push(change.path);
    }
  }
  return {action: review.length ? "await_review" : "commit", reviewPaths: review,
    paths: changes.map(c => c.path), expectedHead: baseCommit, force: false,
    message: "astraea(core): add reviewed research draft [job:" + jobId + "] [run:" + runId + "]"};
}
export function syncState() {
  return {schema_version: "0.1", vault_id: "astraea-iii", phase: "idle",
    repository: {root: null, full_name: REPOSITORY.fullName, vault_prefix: REPOSITORY.vaultPrefix,
      remote: "origin", default_branch: REPOSITORY.branch, last_fetched_at: null,
      last_pulled_commit: null, last_pushed_commit: null},
    working_tree: {status: "unknown", observed_head: null, human_change_fingerprint: null, conflict_paths: []},
    active_run: null, last_completed_run: null, pending_push_commit: null,
    last_agent_commit: {sha: null, job_id: null, run_id: null, origin_fingerprint: null, committed_at: null},
    trigger_deduplication: {seen_event_ids: [], ignored_origin_fingerprints: [], generated_commits: []},
    pending_approvals: [], last_error: null, updated_at: null};
}
// Inputs here must be authenticated adapter observations, never model output or email/author guesses.
export function triggerDecision(event, state) {
  id(event.id); check(["manual", "git", "filesystem"].includes(event.kind), "INVALID_TRIGGER");
  check(state && state.trigger_deduplication && Array.isArray(state.trigger_deduplication.seen_event_ids) && Array.isArray(state.trigger_deduplication.generated_commits), "INVALID_SYNC_STATE");
  if (state.trigger_deduplication.seen_event_ids.includes(event.id)) return {action: "ignore", reason: "duplicate"};
  if (event.kind === "manual") return {action: "enqueue", reason: "explicit_request"};
  check(event.trustedObservation === true, "UNTRUSTED_TRIGGER");
  check(Array.isArray(event.changedPaths) && event.changedPaths.length > 0, "INVALID_TRIGGER");
  event.changedPaths.forEach(relativePath);
  // Exclude known Core output before considering note changes, including the Core state file itself.
  const contentPaths = event.changedPaths.filter(p => !p.startsWith(REPOSITORY.vaultPrefix + "/AstraeaCore/") &&
    classifyPath(p) !== "excluded");
  if (contentPaths.length === 0) return {action: "ignore", reason: "operational_only"};
  if (event.kind === "git") {
    check(SHA.test(event.commit), "INVALID_GIT_SHA");
    const known = state.trigger_deduplication.generated_commits.find(c => c.sha === event.commit);
    if (known && event.originFingerprint === known.originFingerprint) return {action: "ignore", reason: "self_commit"};
  }
  return {action: "review", reason: "human_or_unknown_change"};
}
export function recordEvent(state, eventId) {
  id(eventId); check(!state.trigger_deduplication.seen_event_ids.includes(eventId), "DUPLICATE_EVENT");
  // Until archival exists, stop rather than evict IDs and permit old events to run again.
  check(state.trigger_deduplication.seen_event_ids.length < 10000, "EVENT_LEDGER_FULL");
  return {...copy(state), trigger_deduplication: {...copy(state.trigger_deduplication),
    seen_event_ids: [...state.trigger_deduplication.seen_event_ids, eventId]}};
}
export function recordPush(state, {commit, originFingerprint, at}) {
  check(SHA.test(commit) && HASH.test(originFingerprint), "INVALID_PUSH_RECORD");
  textValue(at, "INVALID_DATE"); check(Number.isFinite(Date.parse(at)), "INVALID_DATE");
  check(state.trigger_deduplication.generated_commits.length < 10000, "COMMIT_LEDGER_FULL");
  return {...copy(state), phase: "idle", pending_push_commit: null,
    repository: {...copy(state.repository), last_pushed_commit: commit},
    trigger_deduplication: {...copy(state.trigger_deduplication),
      generated_commits: [...state.trigger_deduplication.generated_commits, {sha: commit, originFingerprint}]}, updated_at: at};
}
