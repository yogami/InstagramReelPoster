# Global User Rules

## Planning Mode Behavior
When in Planning Mode, always use the peer-planner approach:
1. First draft a detailed plan silently (Planner-Opus).
2. Then critique and improve it silently (Reviewer-Opus).
3. Only output the final synthesized plan with a brief list of key risks (Synthesizer-Opus).

## Code Quality & Craftsmanship Standards
**Apply to ALL code changes (bugs/features):**

- **Test-First**: New features = write tests first. Legacy code = scaffold tests before changes.
- **Clean Code Philosophy**: Uncle Bob (Clean Code) + Martin Fowler (refactoring). Leave code better than found.
- **Pre-Commit Gates** (fix if failing):
  - No circular dependencies
  - Cyclomatic complexity ≤ 3 per function (refactor if higher)
  - Zero linter errors/warnings
  - Small classes/methods (split if >1 responsibility)

## Prompt Engineering Standards (Treat Prompts as Code)
**Apply to ALL prompt changes/modifications:**

1. **Define Acceptance Criteria FIRST**: Before writing/editing prompts, specify exact output requirements:
   - Structure (exact fields, array lengths, required sections)
   - Content rules (min/max lengths, specific keywords must appear)
   - Format (JSON validity, no missing delimiters)
   - Edge case handling (graceful fallbacks)

2. **Write Executable Tests** for:
   - **Structure validation** (field presence, types, counts)
   - **Semantic quality** (sentence length, hook engagement, simplicity)
   - **Edge cases** (missing fields, malformed JSON, array-as-string)
   - **Mock responses** (no real API calls during tests)

3. **Test Loop**:
   - Write acceptance tests → Craft prompt → Validate with real API → Add to codebase
   - Future prompt changes **MUST pass all existing tests**

4. **Version prompts** like code. Never edit without tests protecting behavior.

## Bug Fixing Protocol (TDD + Full Cycle)
When user reports a bug or says "fix bug", "there's a bug", or describes broken functionality, follow this exact sequence **without asking for confirmation**:

1. **RED**: Write minimal failing test reproducing bug. Run to confirm failure.
2. **GREEN**: Fix until test passes. Apply SOLID + Clean Code.
3. **REFACTOR**: Improve structure/readability/maintainability. **Run Code Quality Gates** (circular deps, complexity ≤3, linter clean, small methods).
4. **REGRESSION**: Run ALL tests (unit + prompt tests) to ensure no regressions.
5. **CODE REVIEW**: Independent review checking:
   - SOLID violations
   - Code smells (Fowler's catalog)
   - Security/performance issues
   - Craftsmanship standards met
   - Prompt tests pass (if prompts modified)
   
   **IF ANY inconsistencies found, REPEAT 1-5 until clean.**

6. **COMMIT**: `git commit -m "fix: <bug> (#issue)"` + `git push`.
7. **VERIFY BUILD**: 
   - **IF CI/CD available**: Confirm build success + deployment.
   - **IF NOT possible**: Prompt user: "Manual verification needed: Please check build/deploy status."
8. **E2E TESTS**: 
   - **IF Playwright + production access available**: Run against production URL.
   - **IF NOT possible**: Prompt user: "Manual E2E testing needed: Please verify bug fix on production."
9. **REPORT**: 
   - **Full automation**: "✅ Bug fixed. Tests passed. Deployed. Playwright confirmed."
   - **Manual steps needed**: "✅ Code fixed/tests passed/committed. Manual verification needed: [specific steps]."

## Feature Development Protocol
1. **Test-First**: Write tests (unit + acceptance) defining feature behavior first. **Include prompt tests if prompts involved**.
2. **Implement**: Make tests pass incrementally.
3. **Refactor + Quality Gates**: Clean Code standards + pre-commit checks + **prompt validation**.
4. Follow bug protocol from step 4 (regression → commit → deploy → verify).

**Important**: Never skip steps. Legacy code/prompts = characterize with tests first. Prompts are code—test them rigorously. Only prompt user for manual verification when automation impossible. Use `// turbo` for safe terminal automation.
