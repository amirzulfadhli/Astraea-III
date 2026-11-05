import {createHash} from "node:crypto";
import {check, CoreError, relativePath, sourceRecord} from "./contracts.mjs";
import {REPOSITORY} from "./sync-policy.mjs";
const sha256 = value => createHash("sha256").update(value, "utf8").digest("hex");

const SHA = /^[a-f0-9]{40}$/;
function sourcePath(path) {
  relativePath(path);
  check(path.startsWith(REPOSITORY.vaultPrefix + "/") && !path.split("/").some(p => p.startsWith(".")), "EXCLUDED_SOURCE_PATH");
  const local = path.slice(REPOSITORY.vaultPrefix.length + 1);
  check(/^(note\/(fleet|lit|atomic)|field|project)\/.+\.md$/i.test(local), "EXCLUDED_SOURCE_PATH");
  return local;
}
export class GitHubVaultReader {
  #get; #snapshots = new Map(); #clock;
  constructor({getJson, clock = Date.now}) { check(typeof getJson === "function", "INVALID_READER"); this.#get = getJson; this.#clock = clock; }
  async openSnapshot() {
    const base = "/repos/" + REPOSITORY.fullName;
    const branch = await this.#get(base + "/branches/" + REPOSITORY.branch);
    const commit = branch.commit?.sha, treeSha = branch.commit?.commit?.tree?.sha;
    check(SHA.test(commit) && SHA.test(treeSha), "INVALID_REMOTE_SNAPSHOT");
    const tree = await this.#get(base + "/git/trees/" + treeSha + "?recursive=1");
    check(tree.truncated === false && tree.sha === treeSha && Array.isArray(tree.tree) && tree.tree.length <= 100000, "INCOMPLETE_REMOTE_TREE");
    const entries = new Map();
    for (const item of tree.tree) {
      if (item.type !== "blob" || item.mode !== "100644") continue;
      try { sourcePath(item.path); } catch { continue; }
      check(SHA.test(item.sha) && !entries.has(item.path), "INVALID_REMOTE_TREE");
      entries.set(item.path, {sha: item.sha, size: item.size});
    }
    this.#snapshots.set(commit, {entries, treeSha});
    return {repository: REPOSITORY.fullName, branch: REPOSITORY.branch, commit, treeSha,
      paths: [...entries.keys()].sort(), readOnly: true, localWorktree: "not_observed"};
  }
  async readSource(commit, path, {id, privacy = "private"} = {}) {
    sourcePath(path);
    const snapshot = this.#snapshots.get(commit); check(snapshot, "UNKNOWN_REMOTE_SNAPSHOT");
    const entry = snapshot.entries.get(path); check(entry, "SOURCE_NOT_IN_SNAPSHOT");
    check(Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= 1000000, "SOURCE_SIZE_LIMIT");
    const blob = await this.#get("/repos/" + REPOSITORY.fullName + "/git/blobs/" + entry.sha);
    check(blob.encoding === "base64" && typeof blob.content === "string" &&
      blob.content.length <= 1400000 && blob.sha === entry.sha, "INVALID_REMOTE_BLOB");
    check(/^[A-Za-z0-9+/=\r\n]*$/.test(blob.content), "INVALID_REMOTE_BLOB");
    const bytes = Buffer.from(blob.content, "base64");
    check(bytes.length === entry.size && blob.size === entry.size, "INVALID_REMOTE_BLOB");
    const gitHash = createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
    check(gitHash === entry.sha, "GIT_BLOB_MISMATCH");
    let content; try { content = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes); }
    catch { throw new CoreError("INVALID_SOURCE_ENCODING"); }
    check(!content.includes("\0"), "INVALID_SOURCE_ENCODING");
    return sourceRecord({id, kind: "vault", locator: sourcePath(path), title: path.split("/").at(-1),
      privacy, content, retrievedAt: new Date(this.#clock()).toISOString(), extractionMethod: "github-git-blob",
      provenance: {repository: REPOSITORY.fullName, commit, blob: entry.sha}}, sha256);
  }
}
export function githubGetJson({token, fetchImpl = fetch} = {}) {
  return async path => {
    // Fixed repository + fixed GET endpoint families. No caller-controlled host or HTTP method.
    check(new RegExp("^/repos/" + REPOSITORY.fullName +
      "/(?:branches/main|git/trees/[a-f0-9]{40}\\?recursive=1|git/blobs/[a-f0-9]{40})$").test(path), "READ_ENDPOINT_NOT_ALLOWED");
    const headers = {Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"};
    if (token) headers.Authorization = "Bearer " + token;
    try {
      const response = await fetchImpl("https://api.github.com" + path,
        {method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(10000)});
      check(response.ok, "REMOTE_READ_FAILED");
      // Stream with a hard byte cap; do not load an unbounded response before checking its length.
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length; check(length <= 16000000, "REMOTE_RESPONSE_LIMIT"); chunks.push(Buffer.from(chunk));
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      throw new CoreError(error instanceof CoreError && ["REMOTE_RESPONSE_LIMIT", "REMOTE_READ_FAILED"].includes(error.code) ? error.code : "REMOTE_READ_FAILED");
    }
  };
}
