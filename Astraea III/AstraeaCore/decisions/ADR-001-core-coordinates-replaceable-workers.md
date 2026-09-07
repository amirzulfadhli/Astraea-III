---
type: decision
title: Core coordinates replaceable workers
system: Astraea III
status: accepted
version: 0.1
tags:
  - system/decision
  - system/architecture
date_created: 2026-09-07
---

# ADR-001: Astraea Core coordinates replaceable workers

## Decision

Scout, Researcher, Analyst, Critic, and Synthesizer are capability roles implemented by replaceable workers. Astraea Core owns orchestration, policy, state, budgets, permissions, approvals, synchronization, and auditability.

Workers communicate through versioned task/result envelopes and cannot independently schedule work, mutate policy, push Git, or promote memory. Existing `sub_agents/` specifications may be registered as implementations of these roles.

## Context

The vault already has several useful specialist prompts and an interchangeable AI model layer. Giving each specialist independent autonomy would duplicate state, weaken human control, make provider changes expensive, and make Git/Obsidian synchronization unsafe.

## Consequences

Positive: bounded execution, provider independence, testable contracts, resumability, clear permissions, and safe replacement of prompts or models.

Trade-off: Core needs explicit schemas and routing rules, and some flexible agent-to-agent conversation is sacrificed. That complexity is accepted because it is the minimum needed for traceability and safe evolution.

## Alternatives rejected

- A collection of independent autonomous agents with shared filesystem access: too difficult to audit and likely to overwrite human work.
- A single monolithic agent: simpler initially but couples planning, evidence handling, criticism, synthesis, and provider choice.
- Provider-specific workers: creates lock-in and makes local/future providers second-class.

## Revisit when

Revisit after v1 evaluation shows that the typed DAG cannot express a recurring research pattern without excessive orchestration overhead. Any relaxation must retain Core-owned budgets, permissions, provenance, approvals, and Git synchronization.

