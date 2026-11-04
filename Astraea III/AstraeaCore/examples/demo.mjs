import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {AstraeaCore} from "../src/core.mjs";
import {demoJob, fixtureProvider} from "./fixture.mjs";

const registry = JSON.parse(await readFile(new URL("../registry.json", import.meta.url), "utf8"));
const hash = text => createHash("sha256").update(text, "utf8").digest("hex");
const core = new AstraeaCore({registry: registry.workers, providers: {fixture: fixtureProvider()}, hash});
core.createRun(demoJob());
const run = await core.execute("demo-run");
if (run.status !== "awaiting_approval") throw new Error(run.error || run.status);
console.log(run.artifact.markdown);
console.log("Status: " + run.status + "; artifact SHA-256: " + run.artifact.hash);
// The demonstration prints to stdout. It never writes notes or records an approval.
