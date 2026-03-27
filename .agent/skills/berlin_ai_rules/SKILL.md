---
name: berlin_ai_rules
description: Essential architectural, technical, and operational rules for the Berlin AI Automation Studio. Includes Architectural Integrity, TDD, ATDD, and PRISM Protocol standards.
---

# Berlin AI Studio: Unified Governance & Architectural Protocol

This skill provides the comprehensive rules and standards that MUST be followed by every agent working within the Berlin AI Studio ecosystem. These rules ensure zero duplication, high craftsmanship, and absolute functional integrity.

## 🏛️ 1. Architectural Integrity (Zero Duplication)

**The One Law**: Before starting ANY task, you MUST check for existing capabilities in the `Microservices_Catalog.md`.
- **Scan Phase**: Identify if the requested logic (e.g., geofencing, auth, encryption) already exists.
- **Match Phase**: If it exists, use the existing service via its defined port/interface.
- **Extraction Phase**: If creating new domain-agnostic logic, extract it into a standalone service following DDD patterns.

**Core Structure (Hexagonal Architecture)**:
- `domain/`: Pure business logic (Entities, Value Objects).
- `ports/`: Primary and Secondary interfaces.
- `application/`: Orchestration and use cases.
- `infrastructure/`: Database, external APIs, and system-specific implementations.

## 🏗️ 2. Code Quality & Craftsmanship (Gold Standard)

- **Test-First (TDD)**: Write unit and acceptance tests BEFORE implementation.
- **Complexity**: Keep cyclomatic complexity ≤ 3 per function. Flat logic is reliable logic.
- **Coverage**: Maintain ≥80% test coverage for all new features.
- **Bug Protocol**: Write a failing test reproducing the bug before attempting a fix.
- **SOLID & Clean Code**: Apply SOLID, DRY, and Uncle Bob's Clean Code principles relentlessly.

## 📜 3. Spec Files as Single Source of Truth (ATDD)

Spec files (`*.spec.ts`, `*.test.ts`) are the **living documentation**.
- **The Protocol**: 
    1. Feature Addition: Write spec FIRST.
    2. Feature Modification: Update spec FIRST.
    3. Feature Deletion: Mark spec as `skipped` first, then delete code.
- **Understand Before Build**: Always read existing specs in `tests/` or `e2e/` to understand the system's functional contract.

## 🧠 4. Planning & Prompt Engineering

- **Peer-Planner Approach**: Draft plan silently -> Internal Critique -> Optimized Plan with **Key Risks**.
- **Prompts are Code**: Define acceptance criteria FIRST. Test prompts like code (validation, semantic quality).

## 🚨 5. Infrastructure & Technical Debt

- **Agent-Ready APIs**: Every service MUST expose functional OpenAPI manifests (`/api/openapi.json`) and Swagger UI (`/api/docs`).
- **Synchronized Brain**: The SSOT for rules is `/Users/user1000/gitprojects/RULES.md`. If it's missing, use `install-brain.sh` to fetch it.
- **Shared DB Isolation**: Use table prefixing (e.g., `am_agents`) when working in shared database environments.

## 🎶 6. Communication & Prose

- **Musical Metaphors**: When communicating architectural decisions, use the "Digital Symphony" paradigm (Master Score, Orchestration, Harmony).
- **Prose Style**: Professional, fluid human-like language. Avoid dashes. Use storytelling hooks.

## 🛠️ Resources & Scripts

- **Catalog**: `/Users/user1000/gitprojects/Microservices_Catalog.md`
- **Sync Script**: `/Users/user1000/gitprojects/sync-registry.sh`
- **Audit Script**: `/Users/user1000/gitprojects/audit-workspace.sh`

*Failure to follow these rules is unacceptable. Consistency over duplication.*
