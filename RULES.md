# Development Rules & Definition of Done

## 0. Microservice Reuse Strategy (Check First!)
Before starting any new feature or project:
1. Check `MICROSERVICES.md` (Internal Microservice Catalog) in the project root.
2. If a relevant microservice exists, reuse it (import from `src/lib/` or the appropriate package).
3. If implementing a new complex domain, design it as a potential microservice (Bounded Context) in `src/lib/` from the start.


## Testing Pyramid (Required for All Changes)

### 1. Unit Tests (Fastest, Cheapest)
- Test individual functions/classes in isolation
- Mock external dependencies (axios, databases, APIs)
- Run on every commit: `npm test`

### 2. Contract Tests (Zero API Cost)
- Validate request payloads match external API schemas
- Use JSON Schema validation (ajv)
- Location: `tests/contracts/`
- Run: `npx jest tests/contracts/`

**Contract tests are MANDATORY for any code that calls external APIs:**
- Beam.cloud (images, video)
- OpenRouter (LLM, images)
- Fish Audio (TTS)
- Cloudinary (storage)
- Telegram Bot API

### 3. Integration Tests (Occasional, Real API)
- Real API calls with real credentials
- Run manually before major releases
- Location: `tests/integration/` (skipped by default)

---

## Security & Quality Gates
**These rules are strictly enforced. All violations must be fixed before merging.**

### 1. Security (Defensive Coding)
- **Log Injection**: Use `safeLogger` (no direct `console.log`). Sanitize all user inputs.
- **ReDoS**: Avoid polynomial regex. Use `indexOf` or regex timeouts where possible.
- **Secrets**: NEVER commit secrets. Use `safeLogger` to obfuscate sensitive data in logs.
- **Dependencies**: Zero High/Critical vulnerabilities in `npm audit`.

### 2. Code Quality
- **Complexity**: Maximum Cyclomatic Complexity per function = 10. Split complex logic into helper functions (SRP).
- **Circular Dependencies**: Zero circular dependencies allowed.
- **Length**: Functions should be short (< 50 lines ideal).

---

## Definition of Done (DoD)

A feature/bugfix is DONE when ALL of the following are complete:

- [ ] **Unit tests** pass (`npm test`)
- [ ] **Contract tests** pass (`npx jest tests/contracts/`)
- [ ] **Linter** passes (`npx eslint . --quiet`)
- [ ] **Complexity** rules passed (Cyclomatic Complexity < 10)
- [ ] **Security** check passed (CodeQL alerts cleared, `npm audit` clean)
- [ ] **Circular Dependencies** check passed (madge/dpdm)
- [ ] **Build** succeeds (`npm run build`)
- [ ] **Code** committed with descriptive message
- [ ] **Pushed** to remote repository

### For External API Changes
When modifying code that calls external APIs:

- [ ] Contract schema updated/verified in `tests/contracts/ExternalApiContracts.test.ts`
- [ ] Request payload validated against schema
- [ ] No unsupported fields sent (e.g., `quality` for Beam.cloud)

---

## Bug Fix Protocol (TDD)

1. **RED**: Write failing test that reproduces the bug
2. **GREEN**: Fix code until test passes
3. **REFACTOR**: Clean up
4. **REGRESSION**: Run full test suite
5. **COMMIT**: `git commit -m "fix: <description>"`
6. **PUSH**: `git push`

---

## Pre-Commit Checklist

```bash
# Quick validation before pushing
npm run build && npx eslint . --quiet && npx jest tests/contracts/ && npm test
```
