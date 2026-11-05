// Launched only by the cloud integration tests against their own temporary SQLite database.
import {DatabaseSync} from "node:sqlite";
import {join} from "node:path";
import {SqliteJobStore} from "../src/sqlite-store.mjs";
import {DurableAstraea} from "../src/durable-core.mjs";
import {testRegistry, fixtureProvider, demoJob} from "./helpers.mjs";
const [directory, mode] = process.argv.slice(2);
const store = await SqliteJobStore.open({directory, forbiddenRoots: [process.cwd()]});
if (mode === "transaction") {
  const db = new DatabaseSync(join(directory, "jobs.sqlite"));
  db.exec("BEGIN IMMEDIATE");
  db.prepare("UPDATE runs SET body=? WHERE run_id=?").run("interrupted", "demo-run");
  process.exit(47);
}
if (mode === "completed") {
  const save = store.save.bind(store);
  store.save = (...args) => {
    const result = save(...args), run = result.snapshot;
    if (run.steps.length === 1 && run.steps[0].status === "completed") process.exit(44);
    return result;
  };
}
const fixture = fixtureProvider();
const provider = {locality: "local", execute(request, options) {
  if (mode === "inflight") process.exit(45);
  return fixture.execute(request, options);
}};
const service = new DurableAstraea({store, registry: testRegistry(), providers: {fixture: provider}, leaseMs: 100});
service.submit(demoJob());
await service.execute("demo-run");
throw new Error("Expected crash boundary was not reached");
