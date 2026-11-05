import {randomUUID} from "node:crypto";
import {AstraeaCore} from "./core.mjs";
import {check, CoreError, textValue, copy} from "./contracts.mjs";
import {sha256} from "./sqlite-store.mjs";

// The store owns transactions and fencing. Each operation restores a fresh Core instance.
export class DurableAstraea {
  #store; #options; #leaseMs; #authorize;
  constructor({store, registry, providers, clock = Date.now, leaseMs = 60000, authorizeReconciliation = async () => null}) {
    this.#store = store; this.#options = {registry, providers, clock, hash: sha256}; this.#leaseMs = leaseMs; this.#authorize = authorizeReconciliation;
  }
  submit(job) {
    const core = new AstraeaCore(this.#options);
    return this.#store.register(core.createRun(job)).snapshot;
  }
  get(runId) { return this.#store.load(runId).snapshot; }
  async #withRun(runId, operation) {
    const lease = this.#store.acquire(runId, randomUUID(), this.#leaseMs);
    try {
      let {snapshot, revision} = this.#store.load(runId);
      const checkpoint = async run => { revision = this.#store.save(run, revision, lease).revision; };
      const core = new AstraeaCore({...this.#options, checkpoint});
      const restored = core.restoreRun(snapshot);
      if (restored.status !== snapshot.status) await checkpoint(restored);
      const result = await operation(core);
      // No result is returned if its last acknowledged persistence operation failed.
      return result;
    } finally { this.#store.release(lease); }
  }
  async reconcile(runId, command) {
    // Only a trusted cloud host can authenticate the actor and verify provider evidence.
    const approvedCommand = copy(command);
    let authorization;
    try { authorization = await this.#authorize({capability: "reconcile_uncertain_request", runId, command: copy(approvedCommand)}); }
    catch { throw new CoreError("RECONCILIATION_NOT_AUTHORIZED"); }
    check(authorization && typeof authorization.actor === "string", "RECONCILIATION_NOT_AUTHORIZED");
    textValue(authorization.actor, "INVALID_ACTOR", 200);
    return this.#withRun(runId, core => core.reconcile(runId, approvedCommand, authorization.actor));
  }
  execute(runId) { return this.#withRun(runId, core => core.execute(runId)); }
  review(runId, decision) { return this.#withRun(runId, core => core.review(runId, decision)); }
  cancel(runId) { return this.#withRun(runId, core => core.cancel(runId)); }
}
