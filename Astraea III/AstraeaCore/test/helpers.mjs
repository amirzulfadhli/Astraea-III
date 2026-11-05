import {fixtureProvider, demoJob} from "../examples/fixture.mjs";
export {fixtureProvider, demoJob};
export function testRegistry() {
  return ["Scout", "Researcher", "Analyst", "Critic", "Synthesizer"].map(role => ({
    id: role, role, providerId: "fixture", modelId: "fixture-v0", maxTokens: 1000, maxMicroUsd: 0
  }));
}
