// Pure, dependency-free contracts. IDs and paths are deliberately conservative.
export class CoreError extends Error {
  constructor(code, message = code) { super(message); this.name = "CoreError"; this.code = code; }
}
export function check(condition, code) { if (!condition) throw new CoreError(code); }
export function textValue(value, code = "INVALID_TEXT", max = 100000) {
  check(typeof value === "string" && value.trim().length > 0 && value.length <= max, code);
  return value;
}
export function id(value) { check(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value), "INVALID_ID"); return value; }
export function integer(value, code = "INVALID_INTEGER", min = 0) {
  check(Number.isSafeInteger(value) && value >= min, code); return value;
}
export function copy(value) { return JSON.parse(JSON.stringify(value)); }
export function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { check(Number.isFinite(value), "INVALID_JSON"); return JSON.stringify(value); }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  check(value && Object.getPrototypeOf(value) === Object.prototype, "INVALID_JSON");
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}
export function digestText(value, hash) {
  const result = hash(value);
  check(typeof result === "string" && /^[a-f0-9]{64}$/.test(result), "INVALID_HASH_ADAPTER");
  return result;
}
export function fingerprint(value, hash) { return digestText(canonical(value), hash); }
export function relativePath(path) {
  textValue(path, "INVALID_PATH", 500);
  check(!/[\\\\:%\x00-\x1f\x7f]/.test(path) && !path.startsWith("/") &&
    path.split("/").every(part => part.length > 0 && part !== "." && part !== ".." &&
      !part.endsWith(".") && !part.endsWith(" ") && !/[<>"|?*]/.test(part)), "INVALID_PATH");
  return path;
}
export function sourceRecord(input, hash) {
  id(input.id);
  textValue(input.content, "INVALID_SOURCE_CONTENT", 1000000);
  textValue(input.title, "INVALID_SOURCE_TITLE", 300);
  check(["public", "private"].includes(input.privacy), "INVALID_PRIVACY");
  check(["vault", "web"].includes(input.kind), "INVALID_SOURCE_KIND");
  if (input.kind === "vault") {
    relativePath(input.locator);
    check(!input.locator.split("/").some(part => part.startsWith(".")), "PRIVATE_CONFIG_SOURCE");
  } else {
    textValue(input.locator, "INVALID_SOURCE_URL", 2000);
    // Deliberately accept only a conservative credential-free HTTPS subset.
    check(/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:\/[^\s<>]*)?$/.test(input.locator), "INVALID_SOURCE_URL");
  }
  check(typeof input.retrievedAt === "string" && /^\d{4}-\d\d-\d\dT/.test(input.retrievedAt) &&
    Number.isFinite(Date.parse(input.retrievedAt)), "INVALID_SOURCE_DATE");
  textValue(input.extractionMethod, "INVALID_EXTRACTION_METHOD", 100);
  let provenance;
  if (input.provenance !== undefined) {
    const value = input.provenance;
    check(value && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository) &&
      /^[a-f0-9]{40}$/.test(value.commit) && /^[a-f0-9]{40}$/.test(value.blob), "INVALID_GIT_PROVENANCE");
    provenance = {repository: value.repository, commit: value.commit, blob: value.blob};
  }
  return { ...(provenance ? {provenance} : {}), schemaVersion: "0.1", id: input.id, title: input.title, kind: input.kind,
    locator: input.locator, privacy: input.privacy, retrievedAt: input.retrievedAt,
    extractionMethod: input.extractionMethod, content: input.content,
    contentHash: digestText(input.content, hash) };
}
export function validateClaim(claim, sources, existingIds) {
  id(claim.id); check(!existingIds.includes(claim.id), "DUPLICATE_CLAIM");
  textValue(claim.text, "INVALID_CLAIM");
  check(["fact", "inference"].includes(claim.kind), "INVALID_CLAIM_KIND");
  check(Number.isFinite(claim.confidence) && claim.confidence >= 0 && claim.confidence <= 1, "INVALID_CONFIDENCE");
  check(Array.isArray(claim.evidence) && claim.evidence.length > 0 && claim.evidence.length <= 100, "MISSING_EVIDENCE");
  for (const evidence of claim.evidence) {
    const source = sources.find(item => item.id === evidence.sourceId);
    check(source, "UNKNOWN_SOURCE");
    integer(evidence.start); integer(evidence.end);
    check(evidence.end > evidence.start && evidence.end <= source.content.length, "INVALID_SPAN");
    textValue(evidence.quote, "EMPTY_QUOTE");
    check(source.content.slice(evidence.start, evidence.end) === evidence.quote, "QUOTE_MISMATCH");
  }
  // Return an allowlisted object: provider-supplied metadata never becomes authority.
  return { id: claim.id, text: claim.text, kind: claim.kind, confidence: claim.confidence,
    evidence: claim.evidence.map(e => ({sourceId: e.sourceId, start: e.start, end: e.end, quote: e.quote})) };
}
