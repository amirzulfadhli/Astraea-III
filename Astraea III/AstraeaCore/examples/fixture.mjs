// Demonstration adapter only: no research, network requests, billing or filesystem access.
export function fixtureProvider() {
  return {locality: "local", async execute(request) {
    const source = request.context.sources[0];
    const evidence = [{sourceId: source.id, start: 0, end: source.content.length, quote: source.content}];
    let output;
    switch (request.role) {
      case "Scout": output = {questions: [request.context.question]}; break;
      case "Researcher": output = {claims: [{id: "C1", text: source.content, kind: "fact", confidence: 1, evidence}]}; break;
      case "Analyst": output = {claims: [{id: "C2", text: "The supplied source supports the extracted statement.",
        kind: "inference", confidence: 0.8, evidence}]}; break;
      case "Critic": output = {findings: []}; break;
      case "Synthesizer": output = {title: "Astraea fixture demonstration", sections: [
        {heading: "Evidence and inference", claimIds: ["C1", "C2"]}]}; break;
      default: throw new Error("Unsupported fixture role");
    }
    return {output, usage: {tokens: 0, microUsd: 0}};
  }};
}
export function demoJob() {
  return {id: "demo-job", runId: "demo-run", eventId: "demo-event",
    question: "What does the supplied fixture say?",
    budget: {tokens: 5000, microUsd: 0, calls: 5, timeoutMs: 1000, maxContextChars: 100000},
    sources: [{id: "S1", kind: "vault", locator: "note/fleet/demo.md", title: "Demonstration source",
      privacy: "private", retrievedAt: "2026-11-04T00:00:00Z", extractionMethod: "fixture",
      content: "Astraea keeps evidence separate from derived knowledge."}]};
}
