---
type: decision
title: Bounded Core foundation and cloud integration boundary
system: Astraea III
status: accepted
date_created: 2026-11-04
tags: [system/decision, system/architecture]
---

# ADR-002: Bounded Core foundation

## Context

At commit `a5bde6506da9d91d13cd8be6dfd9a583100d96ac`, the repository contains architecture v0.1, ADR-001, vault knowledge/templates, specialist prompts and vendor tooling. No Astraea Core runtime, application tests or CI exists. The canonical repository is now verified as `amirzulfadhli/Astraea-III`, with the vault under `Astraea III/`.

## Decision

Implement the smallest computational milestone: a sequential five-role workflow with explicit contracts, source evidence, conservative budgets, audit records and hash-bound human review. Use dependency-free JavaScript ES modules so the same contracts can run in Node, an isolated cloud JavaScript runner and eventually an Obsidian host. This choice introduces no build chain or model SDK.

Keep a pure policy layer for Git/trigger decisions. Defer mutation adapters until cloud persistence, fresh observations, cross-process locks and restart reconciliation are tested. All development and verification for this milestone occur through cloud services.

Preserve the existing vault paths, double-`.md` filenames, specialist prompts, templates and plugin setup. The registry references existing specialists without granting them scheduling or filesystem authority. Core owns orchestration as decided in ADR-001.

The repository root and vault root are distinct: configure repository identity plus a vault prefix rather than requiring them to be physically identical. This refines architecture §13 for the observed nested layout.

Runtime drafts, private snapshots, caches and live sync state are excluded from ordinary development commits. A future shared-state adapter must explicitly serialize sanitized operational records. GitHub remains canonical for shared knowledge and reviewed state; Obsidian continues to edit the same synchronized vault. No existing synchronization mechanism is replaced.

## Consequences

The default fixture demonstrates the full execution contract without API calls. Live research, durable memory, restart/resume and automatic Git synchronization remain incomplete and are recorded as such. A checkpoint callback is an extension point, not proof of persistence.

Exact source spans and hashes provide provenance, while evidence relevance and truth remain review responsibilities. Structured synthesis intentionally selects validated claims before richer prose generation is considered.

Approval identity, cloud provider access, budget ceilings and Git observations are trusted host responsibilities. No plugin is reconfigured and no autonomous schedule is installed.

## Revisit

After restart-safe cloud storage and temporary-repository integration tests pass, add approval-bound writing and push operations. Evaluate real providers against identical evidence fixtures before adding adaptive plans or schedules.
