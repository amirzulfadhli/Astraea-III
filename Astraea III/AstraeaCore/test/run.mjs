import {createHash} from "node:crypto";
import * as contracts from "../src/contracts.mjs";
import * as core from "../src/core.mjs";
import * as sync from "../src/sync-policy.mjs";
import * as fixture from "../examples/fixture.mjs";
import {runSuite} from "./suite.mjs";

const hash = text => createHash("sha256").update(text, "utf8").digest("hex");
const report = await runSuite({...contracts, ...core, ...sync, ...fixture}, hash);
for (const result of report.results) console.log((result.passed ? "PASS " : "FAIL ") + result.name +
  (result.error ? ": " + result.error : ""));
console.log(report.passed + " passed; " + report.failed + " failed");
if (report.failed) process.exitCode = 1;
