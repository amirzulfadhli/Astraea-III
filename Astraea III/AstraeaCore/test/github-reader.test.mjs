import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {GitHubVaultReader, githubGetJson} from "../src/github-reader.mjs";
import {CoreError} from "../src/contracts.mjs";
const path = "Astraea III/field/cs.md.md", commit = "a".repeat(40), treeSha = "b".repeat(40);
const bytes = Buffer.from("A vault note 🌌.", "utf8");
const blobSha = createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
function setup({treePatch = {}, blobPatch = {}, mode = "100644", content = bytes} = {}) {
  const requests = [];
  const sha = createHash("sha1").update("blob " + content.length + "\0").update(content).digest("hex");
  const getJson = async endpoint => {
    requests.push(endpoint);
    if (endpoint.endsWith("/branches/main")) return {commit: {sha: commit, commit: {tree: {sha: treeSha}}}};
    if (endpoint.includes("/git/trees/")) return {sha: treeSha, truncated: false, tree: [
      {path, mode, type: "blob", sha, size: content.length},
      {path: "Astraea III/.obsidian/plugins/copilot/data.json", mode: "100644", type: "blob", sha, size: content.length}
    ], ...treePatch};
    return {sha, encoding: "base64", content: content.toString("base64"), size: content.length, ...blobPatch};
  };
  return {reader: new GitHubVaultReader({getJson}), requests};
}
const code = expected => error => error.code === expected;
test("read-only snapshot exposes only approved vault Markdown paths", async () => {
  const {reader} = setup(); const snapshot = await reader.openSnapshot();
  assert.deepEqual(snapshot.paths, [path]); assert.equal(snapshot.localWorktree, "not_observed");
  assert.equal(snapshot.readOnly, true);
});
test("source captures exact text, byte hash, commit and Git blob identity", async () => {
  const {reader, requests} = setup(); const snapshot = await reader.openSnapshot();
  const source = await reader.readSource(snapshot.commit, path, {id: "S1"});
  assert.equal(source.content, bytes.toString("utf8")); assert.equal(source.privacy, "private");
  assert.equal(source.contentHash, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(source.provenance, {repository: "amirzulfadhli/Astraea-III", commit, blob: blobSha});
  assert(requests.at(-1).endsWith(blobSha));
});
test("a modified returned snapshot cannot authorize a hidden file read", async () => {
  const {reader} = setup(); const snapshot = await reader.openSnapshot();
  snapshot.paths.push("Astraea III/.obsidian/data.json");
  await assert.rejects(() => reader.readSource(snapshot.commit, "Astraea III/.obsidian/data.json", {id: "S1"}),
    code("EXCLUDED_SOURCE_PATH"));
});
test("unknown commit cannot select arbitrary source content", async () => {
  const {reader} = setup(); await reader.openSnapshot();
  await assert.rejects(() => reader.readSource("c".repeat(40), path, {id: "S1"}), code("UNKNOWN_REMOTE_SNAPSHOT"));
});
test("truncated remote trees fail closed", async () => {
  const {reader} = setup({treePatch: {truncated: true}});
  await assert.rejects(() => reader.openSnapshot(), code("INCOMPLETE_REMOTE_TREE"));
});
test("symlink entries never become readable source paths", async () => {
  const {reader} = setup({mode: "120000"}); const snapshot = await reader.openSnapshot();
  assert.deepEqual(snapshot.paths, []);
  await assert.rejects(() => reader.readSource(commit, path, {id: "S1"}), code("SOURCE_NOT_IN_SNAPSHOT"));
});
test("changed or forged remote blob bytes are rejected", async () => {
  const wrong = Buffer.alloc(bytes.length, 65).toString("base64");
  const {reader} = setup({blobPatch: {content: wrong}}); await reader.openSnapshot();
  await assert.rejects(() => reader.readSource(commit, path, {id: "S1"}), code("GIT_BLOB_MISMATCH"));
});
test("invalid UTF-8 is rejected before source creation", async () => {
  const {reader} = setup({content: Buffer.from([0xff, 0xfe])}); await reader.openSnapshot();
  await assert.rejects(() => reader.readSource(commit, path, {id: "S1"}), code("INVALID_SOURCE_ENCODING"));
});
test("UTF-8 BOM bytes are preserved in source hashes", async () => {
  const content = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]);
  const {reader} = setup({content}); await reader.openSnapshot();
  const source = await reader.readSource(commit, path, {id: "S1"});
  assert.equal(source.content.charCodeAt(0), 0xfeff);
  assert.equal(source.contentHash, createHash("sha256").update(content).digest("hex"));
});
test("operational state paths cannot be read as research sources", async () => {
  const {reader} = setup(); await reader.openSnapshot();
  await assert.rejects(() => reader.readSource(commit, "Astraea III/AstraeaCore/registry.json", {id: "S1"}),
    code("EXCLUDED_SOURCE_PATH"));
});
test("HTTP adapter uses GET only, a fixed host and no redirects", async () => {
  const requests = [];
  const get = githubGetJson({fetchImpl: async (url, options) => {
    requests.push({url, options}); return new Response('{"ok":true}');
  }});
  await get("/repos/amirzulfadhli/Astraea-III/branches/main");
  assert.equal(requests[0].options.method, "GET"); assert.equal(requests[0].options.redirect, "error");
  assert.equal(requests[0].url, "https://api.github.com/repos/amirzulfadhli/Astraea-III/branches/main");
});
test("HTTP adapter denies mutation and other repository endpoints before networking", async () => {
  let calls = 0; const get = githubGetJson({fetchImpl: async () => {calls++;}});
  for (const endpoint of ["/repos/other/repo/branches/main", "/repos/amirzulfadhli/Astraea-III/git/refs",
    "https://other.example/", "/repos/amirzulfadhli/Astraea-III/branches/main?token=x"])
    await assert.rejects(() => get(endpoint), code("READ_ENDPOINT_NOT_ALLOWED"));
  assert.equal(calls, 0);
});
test("HTTP adapter accepts exact tree/blob read endpoints", async () => {
  let calls = 0; const get = githubGetJson({fetchImpl: async () => {calls++; return new Response("{}");}});
  await get("/repos/amirzulfadhli/Astraea-III/git/trees/" + treeSha + "?recursive=1");
  await get("/repos/amirzulfadhli/Astraea-III/git/blobs/" + blobSha); assert.equal(calls, 2);
});
test("HTTP errors redact raw transport messages", async () => {
  const get = githubGetJson({fetchImpl: async () => {throw new CoreError("secret-token");}});
  await assert.rejects(() => get("/repos/amirzulfadhli/Astraea-III/branches/main"),
    error => error.code === "REMOTE_READ_FAILED" && !error.message.includes("secret-token"));
});
