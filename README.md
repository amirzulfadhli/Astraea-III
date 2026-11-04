# Astraea III

Astraea combines a human-owned Obsidian knowledge vault with a provider-independent research orchestrator. GitHub is the canonical shared repository; the vault remains in `Astraea III/`.

- [Architecture v0.1](Astraea%20III/AstraeaCore/architecture/v0.1-architecture.md)
- [Core runtime and contracts](Astraea%20III/AstraeaCore/README.md)
- [Development progress and repository audit](Astraea%20III/AstraeaCore/development/progress.md)
- [Incremental implementation decision](Astraea%20III/AstraeaCore/decisions/ADR-002-bounded-core-foundation.md)

The first runtime milestone performs a bounded five-worker computation and returns a draft for review. Network/model adapters, persistent checkpoint storage, and Git/Obsidian mutation adapters remain future work.

From a **cloud checkout**, with Node.js 22 or 24:

```sh
node "Astraea III/AstraeaCore/test/run.mjs"
node "Astraea III/AstraeaCore/examples/demo.mjs"
```

No package installation or API credentials are needed. The example uses a deterministic fixture provider and prints the draft to stdout. CI runs tests only; it does not deploy, publish, or write to the vault.
