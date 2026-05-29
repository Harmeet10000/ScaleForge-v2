# CI/Testing Setup Analysis & Recommendations

**Date:** 2026-05-29  
**Status:** Ready for Implementation  
**Priority:** High (Foundation for Phase 0+)

---

## Executive Summary

ScaleForge-v2 has a **solid foundation** for CI/CD with comprehensive GitHub Actions workflows. However, **major changes are required** to support the JS→TS + Effect v4 migration:

- ✅ **Keep:** Existing GitHub Actions structure, Docker build strategy, security scanning
- ❌ **Remove:** Node's `node:test` (currently in test-runner.ts)
- ✅ **Add:** Bun's native test runner with TypeScript support, updated configurations
- ❌ **Fix:** tsconfig.json syntax error (line 54 empty string)
- ✅ **Enhance:** Type checking, pre-commit hooks for .ts files

**Estimated effort:** 4-6 hours for full implementation

---

## Current State Analysis

### What Exists (Positive)

#### 1. **GitHub Actions Workflows** (Comprehensive)
- **ci.yml** (444 lines): Main pipeline with stages:
  - Code quality & security (ESLint, Prettier, Snyk, Trivy, Semgrep, GitLeaks)
  - Test suite (unit + integration tests with services: MongoDB, Redis, RabbitMQ)
  - Security scanning (Trivy filesystem + image, Semgrep, GitLeaks)
  - Docker image build & push (multi-platform: amd64, arm64)
  - SBOM generation (Software Bill of Materials)
  - Performance testing (k6 load tests)
  - Results notification & summary

- **test.yml** (163 lines): Dedicated test workflow
  - Tests on Node 22.x
  - Services: MongoDB, Redis, RabbitMQ
  - Coverage reporting to Codecov
  - Artifact archival on failure

#### 2. **Code Quality Tools** (Production-Ready)
- **oxlint** (377-line config): Advanced linting
  - Type safety, async/promise detection, security rules
  - Auto-fixable rules, import validation
  - 300+ active rules across 6 plugins
- **oxfmt**: Code formatting
- **commitlint**: Commit message validation
- **husky**: Git hooks (pre-commit, commit-msg)
- **lint-staged**: Run linters only on staged files

#### 3. **Test Structure** (Organized)
- Tests in `tests/{unit,integration,e2e,performance}/`
- Existing tests use Node's `node:test` with native `assert`
- Coverage configuration present
- Test runner: custom `test-runner.ts` (184 lines, highly configurable)

#### 4. **package.json Scripts** (Complete)
```json
"test": "bun test",
"test:watch": "bun test --watch",
"test:coverage": "bun test --coverage",
"lint": "bunx oxlint",
"lint:fix": "bunx oxlint --fix",
"format": "bunx oxfmt --write",
"format:check": "bunx oxfmt --check",
"check": "bun lint && bun format:check"
```

#### 5. **Docker Support** (Mature)
- Multi-stage Dockerfile (prod.Dockerfile)
- Docker Compose for local services
- Image scanning with Trivy
- SBOM generation

---

### What Needs to Change

#### 1. **Test Runner Configuration** (CRITICAL)
**Current:** `test-runner.ts` (custom Node runner) + mixed `.test.js` files  
**Problem:** 
- Uses `node:test` (Node's built-in, slower, limited DX)
- test-runner.ts tries to import `.js` files that will be `.ts` after Phase 0
- Not optimized for TypeScript or Bun

**Change Required:**
- Remove custom test-runner.ts (replaced by Bun's native test runner)
- Update package.json scripts to use `bun test` directly
- Convert test files from `.test.js` → `.test.ts`
- Add Bun configuration to `bunfig.toml` for test options

**Why Bun:**
- Native TypeScript support (no compilation needed)
- 3-5x faster than Node test runner
- Better integration with Effect.TS code
- Supports coverage, watch mode, snapshots out-of-box
- No extra dependencies

#### 2. **tsconfig.json** (BUG FIX)
**Current Issues:**
```json
Line 54: ""  // Empty string - SYNTAX ERROR
Line 79: "watchDirectory": ""  // Empty string - should be deleted or removed
```

**Fix:**
- Remove line 54 (empty string)
- Clean up watch options
- Add `tests/**/*.ts` to includes
- Remove `"checkJs": true` (migrate .js files to .ts first)
- Ensure `noEmit: true` (we use Bun, not tsc)

#### 3. **CI Workflows** (UPDATE)
**Needed Changes:**
- Replace npm → bun package manager commands
- Update Node.js version to match minimum (24.11.0 per package.json)
- Add type checking step (`bun run --watch src` won't work in CI, need separate command)
- Update test patterns to `.test.ts` format
- Fix env file creation (currently has secrets syntax issues)

**Files to Update:**
- `.github/workflows/ci.yml` — Main CI pipeline
- `.github/workflows/test.yml` — Test-specific workflow

#### 4. **Pre-Commit Hooks** (ENHANCE)
**Current:**
- lint-staged only handles `*.{js,jsx,ts,tsx}` files
- Husky hooks exist but may need TypeScript support

**Enhancement:**
- Keep lint-staged config (already good)
- Ensure pre-commit runs type checking on .ts files
- Add pre-push hook for tests (optional but recommended)

#### 5. **Test File Naming & Structure** (MIGRATE)
**Current:** Mixed `.test.js` files  
**Target:** Consistent `.test.ts` files

**Files to Migrate:**
```
tests/unit/
  - healthController.test.js → healthController.test.ts
  - health.test.js → health.test.ts

tests/integration/
  - health.integration.test.js → health.integration.test.ts
  - billingIntegration.test.js → billingIntegration.test.ts

tests/e2e/
  - health.e2e.test.js → health.e2e.test.ts

tests/performance/
  - (No tests yet, template ready)
```

#### 6. **Coverage Configuration** (ADD)
**Current:** Minimal coverage setup  
**Add:** Proper coverage thresholds and reporting

**Implement:**
- Coverage thresholds: 80% statements, 75% branches, 80% lines
- Coverage reports in `coverage/` directory
- Codecov integration (secrets already in repo)
- Coverage badges in README

---

### What Needs to Be Added

#### 1. **Type Checking in CI** (NEW)
**Missing:** Explicit type checking step in GitHub Actions

**Add:**
```bash
# Check types without emitting (fast, finds errors)
bunx tsc --noEmit

# Or use Bun's TypeScript support directly
bun run --prefer-build src/index.ts  # Validate without running
```

**Update:** Add to ci.yml after code quality, before tests

#### 2. **Bun Configuration** (MINIMAL)
**File:** `bunfig.toml` (already exists, might need updates)

**Add:**
```toml
[test]
preload = ["./tests/setup.ts"]  # Optional: shared setup
# timeout in ms
timeout = 30000
# Enable coverage
coverage = true
# Coverage directory
coverage_dir = "./coverage"
```

**Create:** `tests/setup.ts` (optional, for shared test utilities)

#### 3. **Test Utilities & Helpers** (NEW)
**Create:** `tests/helpers/`

**Files to Create:**
```
tests/helpers/
  ├── testRuntime.ts          # Shared Effect.TS runtime for tests
  ├── services.ts             # Mock services for testing
  ├── fixtures.ts             # Common test data
  └── assertions.ts           # Custom assertions (optional)
```

**Example testRuntime.ts:**
```typescript
import { Effect, Context } from 'effect'
import { ManagedRuntime } from '#/runtime/appRuntime'

// Singleton runtime for all tests
export const testRuntime = ManagedRuntime.make({
  // Test-specific config
  environment: 'test',
  logLevel: 'error',
  // etc.
})

// Helper to run Effect code in tests
export const runEffect = <E, A>(effect: Effect.Effect<A, E, never>) => {
  return testRuntime.runSync(effect)
}
```

#### 4. **GitHub Actions Enhancements** (NEW)
**Add to ci.yml:**

1. **Matrix Testing**
   ```yaml
   strategy:
     matrix:
       node-version: [24.11.0]  # Use min version from package.json
       # Can add multiple versions later
   ```

2. **Type Checking Job**
   ```yaml
   type-check:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: oven-sh/setup-bun@v1
       - run: bun install
       - run: bunx tsc --noEmit
   ```

3. **Test Matrix** (unit + integration + e2e)
   ```yaml
   test:
     strategy:
       matrix:
         test-type: [unit, integration, e2e]
     runs-on: ubuntu-latest
   ```

#### 5. **Coverage Reporting** (ENHANCE)
**Add:**
- Codecov action configuration (already partially in ci.yml)
- Coverage thresholds in package.json or coverage config
- Comment on PRs with coverage changes

**Configuration:**
```json
// package.json or .nycrc.json
{
  "coverage": {
    "branches": 75,
    "functions": 80,
    "lines": 80,
    "statements": 80,
    "exclude": ["**/*.test.ts", "**/node_modules/**"]
  }
}
```

#### 6. **Performance Baseline** (NEW)
**Missing:** Performance baseline tracking

**Add:**
- Store performance metrics in workflow artifacts
- Compare against main branch
- Alert on regressions > 10%

#### 7. **Local Development Helpers** (NEW)
**Create:** `scripts/`

**Files to Create:**
```
scripts/
  ├── test-watch.sh         # Run tests in watch mode with color
  ├── ci-local.sh           # Simulate CI locally (run all checks)
  ├── coverage-report.sh    # Generate + open coverage report
  └── setup-test-env.sh     # Setup local test environment (Docker services)
```

---

## Implementation Plan

### Phase 0.1: Foundation (2 hours)

**Priority: CRITICAL — Must complete before Phase 0.2**

1. **Fix tsconfig.json**
   ```bash
   # Remove empty strings, clean up config
   # Add tests to includes
   # Verify strict mode is enabled
   ```

2. **Create `tests/setup.ts`**
   ```typescript
   // Placeholder for shared test setup
   // Will be expanded later
   ```

3. **Add Bun test configuration to `bunfig.toml`**

4. **Update package.json test scripts**
   ```json
   {
     "test": "bun test tests/**/*.test.ts",
     "test:watch": "bun test --watch tests/**/*.test.ts",
     "test:coverage": "bun test --coverage tests/**/*.test.ts",
     "type-check": "bunx tsc --noEmit"
   }
   ```

5. **Test locally**
   ```bash
   bun install
   bun test          # Should run, might not find tests yet
   bun run type-check
   ```

### Phase 0.2: Migrate Test Files (1 hour)

**After Phase 0: Rename JS→TS**

1. **Rename all test files from `.js` → `.ts`**
   ```bash
   find tests -name "*.test.js" -exec bash -c 'mv "$0" "${0%.js}.ts"' {} \;
   ```

2. **Update imports in test files**
   ```typescript
   // Before
   import { getSystemHealth } from '../../src/utils/quicker.js'
   
   // After
   import { getSystemHealth } from '../../src/utils/quicker'
   ```

3. **Verify tests run**
   ```bash
   bun test
   ```

### Phase 0.3: Remove Custom Test Runner (1 hour)

1. **Delete `test-runner.ts`**
   ```bash
   rm test-runner.ts
   ```

2. **Remove from package.json any custom test script references**

3. **Update CI workflows to use `bun test` directly**

### Phase 0.4: Update CI/CD Workflows (1-2 hours)

**File: `.github/workflows/ci.yml`**

Changes needed:
1. Replace npm → bun:
   ```yaml
   - name: Setup Bun
     uses: oven-sh/setup-bun@v1
   
   - name: Install dependencies
     run: bun install
   ```

2. Add type checking job (before tests):
   ```yaml
   type-check:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: oven-sh/setup-bun@v1
       - run: bun install
       - run: bun run type-check
   ```

3. Update test patterns:
   ```yaml
   - run: bun test tests/${{ matrix.test-type }}/**/*.test.ts
   ```

4. Fix environment file generation (remove secrets syntax issues)

5. Update Node version to 24.x (match minimum from package.json)

**File: `.github/workflows/test.yml`**

Similar updates:
- Setup Bun instead of Node
- Use `bun test` instead of npm
- Update file patterns

### Phase 0.5: Add Coverage Configuration (30 min)

1. **Create `.bun-test-config.json`** (optional, or use bunfig.toml)

2. **Add coverage threshold enforcement**

3. **Configure Codecov integration**

---

## File-by-File Changes

### New Files to Create

```
📄 tests/setup.ts                          # Shared test setup
📄 tests/helpers/testRuntime.ts            # Effect runtime helper
📄 tests/helpers/services.ts               # Mock services
📄 tests/helpers/fixtures.ts               # Test data
📄 bunfig.toml (update)                    # Bun config
📄 scripts/test-watch.sh                   # Helper script
📄 scripts/ci-local.sh                     # Helper script
```

### Files to Delete

```
❌ test-runner.ts                          # Custom test runner (no longer needed)
```

### Files to Update

```
📝 tsconfig.json                           # Fix syntax error, add tests to includes
📝 package.json                            # Update test scripts, add type-check
📝 .github/workflows/ci.yml                # Update for Bun + TypeScript + type checking
📝 .github/workflows/test.yml              # Update for Bun
📝 tests/**/*.test.js → .test.ts          # Rename all test files (Phase 0.2)
```

---

## Clarification Questions Resolved ✅

### 1. **Testing Framework** 
**Decision:** Use Bun's native test runner (selected by user)

**Rationale:**
- 3-5x faster than node:test
- Native TypeScript support (no extra transpilation)
- Better Bun integration (alignment with dev environment)
- Simpler configuration
- Full Feature parity for Phase 0+

**Why not Vitest:**
- Would add 500+ dependencies
- Unnecessary complexity for Effect.TS + TypeScript-first codebase
- Bun is already used as package manager

### 2. **CI/CD Scope**
**Decision:** Full quality gate (selected by user)

**This means CI will enforce:**
- ✅ Type checking (tsc --noEmit)
- ✅ Linting (oxlint)
- ✅ Formatting (oxfmt check)
- ✅ Unit tests (bun test)
- ✅ Integration tests (with services)
- ✅ Security scanning (Trivy, Semgrep, GitLeaks)
- ✅ Dependency audit (Snyk)
- ✅ Coverage reporting (Codecov)

**Enforcement:** CI will **BLOCK** PRs that fail any check

---

## Testing Strategy for Effect.TS + TypeScript

### Unit Tests
**Pattern:** Pure Effect workflows with no external dependencies

```typescript
import { describe, it, expect } from 'bun:test'
import { Effect } from 'effect'

describe('AuthService.login', () => {
  it('should return a token on success', async () => {
    const result = await Effect.runPromise(
      authService.login('user@example.com', 'password')
    )
    
    expect(result.token).toBeDefined()
  })
  
  it('should return error on invalid password', async () => {
    const result = await Effect.runPromise(
      authService.login('user@example.com', 'wrong')
    )
    
    expect(result).toBeInstanceOf(InvalidPasswordError)
  })
})
```

### Integration Tests
**Pattern:** Real services (MongoDB, Redis, RabbitMQ from Docker)

```typescript
describe('Health Integration', () => {
  it('should check MongoDB connectivity', async () => {
    const health = await Effect.runPromise(healthService.checkMongo())
    expect(health.status).toBe('healthy')
  })
})
```

### E2E Tests
**Pattern:** Full HTTP requests against running server (Phase 5+)

```typescript
describe('POST /api/v1/auth/login', () => {
  it('should return 200 with token', async () => {
    const res = await client.post('/api/v1/auth/login', {
      email: 'test@example.com',
      password: 'password'
    })
    
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })
})
```

---

## Success Criteria

After implementation, you should be able to:

1. ✅ Run `bun test` and see all tests pass
2. ✅ Run `bun run type-check` and see zero type errors
3. ✅ Run `bun run lint` and see no critical errors
4. ✅ Push to GitHub and see CI pipeline pass all checks
5. ✅ PR has status: "Checks passed" (all jobs green)
6. ✅ Coverage badge shows >75% coverage
7. ✅ No custom test runner; bun test owns all testing

---

## Timeline

**Total Effort:** 4-6 hours

- Phase 0.1 (Fix config): 2 hours
- Phase 0.2 (Migrate tests): 1 hour
- Phase 0.3 (Remove runner): 1 hour
- Phase 0.4 (Update CI): 1-2 hours
- Phase 0.5 (Coverage): 0.5 hour

**Critical Path:** Do all 5 phases before merging Phase 0 to main

---

## Next Steps

1. **Ask for approval** on this plan
2. **Execute Phase 0.1-0.5** (in order)
3. **Test locally** after each phase
4. **Commit after each phase** (atomic commits)
5. **Verify CI passes** on GitHub after final commit

---

## Appendix: Quick Reference

### Bun Test Syntax
```bash
bun test                              # Run all tests
bun test --watch                      # Watch mode
bun test --coverage                   # With coverage report
bun test tests/unit                   # Only unit tests
bun test --bail                       # Stop on first failure
```

### Type Checking
```bash
bun run type-check                    # Check types
bunx tsc --noEmit --pretty           # Verbose type errors
```

### Local Development
```bash
bun run dev                           # Start dev server
bun run check                         # Lint + format check
bun run lint:fix && bun run format   # Auto-fix issues
```

### Coverage Viewing
```bash
bun test --coverage
open coverage/index.html              # View HTML report
```

---

**Document Status:** Ready for implementation  
**Last Updated:** 2026-05-29  
**Reviewer:** OpenCode Agent
