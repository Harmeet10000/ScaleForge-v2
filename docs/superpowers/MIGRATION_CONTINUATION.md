# ScaleForge v2 Migration Continuation Guide

**Last Updated:** 2026-05-29  
**Status:** Ready for Phase 0 implementation  
**Plan Location:** `docs/superpowers/plans/2026-05-28-js-to-ts-effect-migration.md`

## What Has Been Completed

This document summarizes work completed on the JavaScript → TypeScript + Fastify + Effect v4 migration for ScaleForge v2.

### 1. **Codebase Analysis** ✅
- Explored 88 JS files, 3 TS files
- Current architecture: Express.js with vertical slice (features-based) structure
- Identified all modules to migrate: auth, health, user, database, workers, helpers

### 2. **Architecture Decision** ✅
- **Chosen: Hybrid Folder Structure** (Effect-Native Hexagonal)
  - `src/core/` – Domain logic, errors, schemas, types
  - `src/infra/` – Database, cache, message queue, external services
  - `src/features/` – Business logic modules (vertical slices)
  - `src/runtime/` – Layers, runtime composition, appRuntime
  - `src/helpers/` – Pure utility functions
  - `src/db/` – Drizzle schemas (separate from models)
  - `src/workers/` – Background job consumers

### 3. **Effect v4 Migration** ✅
All architectural decisions updated to use **Effect v4 beta** API:

| Concept | Effect v3 | Effect v4 | Status |
|---------|-----------|-----------|--------|
| Service Definition | `Effect.Service` | `Context.Service` | ✅ Applied |
| Request Context | `FiberRef` | `Context.Reference` | ✅ Applied |
| Setting Values | `Effect.locally` | `Effect.provideService` | ✅ Applied |
| Schema Library | `@effect/schema` | Part of `effect` package | ✅ Updated |
| Imports | Scattered | Single `effect` package | ✅ Consolidated |

**Key Context.Reference classes to use:**
- `RequestId` – Unique per HTTP request
- `CurrentUserId` – Set at route entry, read by services
- `CurrentUserIp` – Client IP address

### 4. **Auth Architecture** ✅
- **Chosen: Option C (Full Custom)**
  - Custom PASETO auth via Effect services
  - Arctic for OAuth flows only (authorization URLs + token exchange)
  - No better-auth dependency
  - argon2 password hashing with timing-attack-safe dummy hash
  - WebSocket auth with per-user connection limits + Redis presence

### 5. **Design Pattern Analysis** ✅
**16 of 21 patterns applied (76% coverage)**

**Explicitly applied:**
1. Pure Core, Impure Shell – service.ts vs routes.ts
2. Result Values – Data.TaggedError + Match.exhaustive
3. Small Composable Functions – helpers/*
4. Dependency Injection – Effect Services + Layers
5. Boundary Adapters – infra/* for vendors
6. Idempotent Command Handlers – workers/* consumers
7. Normalize Once At Boundary – Schema at route entry
8. Return Result Pattern – All effects return tagged errors

**Implicit in architecture:** Adapter, Facade, Repository, Strategy, Singleton, Factory, Bulkhead, Unit of Work, Outbox

**Alignment with reference patterns:** 11/12 "prefer" patterns (92%)

### 6. **Graphify Knowledge Graph** ✅
- Built knowledge graph from 109 source files (~115K words)
- 739 nodes, 1,141 edges, 48 communities
- God nodes identified: Logger (39 edges), httpError (19), httpResponse (11)
- Available for queries: `graphify query "<question>"` after Phase 0

### 7. **12 Improvement Suggestions Identified & Mapped** ✅
All mapped to specific implementation phases with design pattern mappings:

| # | Improvement | Phase | Pattern | Impact |
|---|-------------|-------|---------|--------|
| 1 | Logger layer (Effect.log + Pino) | Phase 3 | Facade | Reduce Logger coupling |
| 2 | Split Redis (cache vs session) | Phase 2 | Repository | Better separation |
| 3 | RabbitMQ retry/DLQ abstractions | Phase 2 | Adapter | Cleaner queue handling |
| 4 | WebSocket real-time events | Phase 6+ | Strategy | Extensible messaging |
| 5 | zxcvbn password strength | Phase 5 | Strategy | Safer validation |
| 6 | JSON Schema OpenAPI gen | Phase 3 | Facade | Auto API docs |
| 7 | Graceful degradation (health checks) | Phase 4 | Bulkhead | Resilience |
| 8 | Hash function migration | Phase 5 | Adapter | Future-proof crypto |
| 9 | Event audit log (Outbox) | Phase 6+ | Outbox | Compliance + replay |
| 10 | OpenTelemetry observability | Phase 6+ | Decorator | Monitoring |
| 11 | Rate limiting per endpoint | Phase 5 | Bulkhead | DDoS protection |
| 12 | effectHandler R-channel typing | Phase 3 | DI | Fix type safety |

### 8. **Complete Migration Plan Written** ✅
**File:** `docs/superpowers/plans/2026-05-28-js-to-ts-effect-migration.md`

**Contents:**
- Full phase breakdown (Phases 0-6+) with task lists
- Effect v4 syntax applied throughout all code examples
- All 12 improvement suggestions mapped to phases
- v4 verification checklist (12 items for stable release)
- Self-review findings (3 critical, 2 medium gaps)
- Design pattern analysis and alignment table
- Dependency graph and critical context
- File renames and module structure
- ~2,470 lines + 2,200+ lines of detailed tasks

**Critical Issues Found & Documented:**
1. `effectHandler` R channel typed as `never` but should be parameterized (→ Improvement #12)
2. `HealthCheckError` not in `AppError` union (→ Improvement #7)
3. `ParseError` from Schema.decodeUnknown needs mapping to `ValidationError`

### 9. **Tech Stack Finalized** ✅
| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript | 6.x |
| Runtime | Bun | Latest |
| Framework | Fastify | 5.x |
| Effect | Effect | v4 (beta) |
| DB (SQL) | Drizzle + Neon | Latest |
| DB (NoSQL) | Mongoose | Latest |
| Cache | ioredis | Latest |
| Message Queue | RabbitMQ (amqp-connection-manager) | Latest |
| Logging | Pino | Latest |
| Auth | PASETO (paseto-ts) + Arctic | Latest |
| Authorization | OpenFGA | Latest |
| Search | Elasticsearch | Latest |
| Testing | Vitest + Effect (Fiber) | Latest |

---

## How to Continue

### **For the Next Session**

1. **Check current state:**
   ```bash
   git status
   git log --oneline -5
   ```

2. **Review the detailed plan:**
   ```bash
   cat docs/superpowers/plans/2026-05-28-js-to-ts-effect-migration.md
   ```

3. **Choose your next action:**
   - **Option A:** Start Phase 0 (Rename + Setup)
   - **Option B:** Review plan in detail first
   - **Option C:** Run architecture spike (Fastify + Effect v4 proof-of-concept)
   - **Option D:** Deep-dive into Phase 1 planning

### **Phase 0: Initial Setup** (Est. 1-2 hours)
```
- [ ] Rename JS files to .ts (keep src/ structure)
- [ ] Install effect (v4 beta)
- [ ] Fix tsconfig.json (remove empty line 54, add Effect plugin)
- [ ] Remove @effect/schema, @effect/platform from dependencies
- [ ] Remove Express (keep Fastify)
- [ ] First compile check (expect ~100+ errors)
- [ ] Create AGENTS.md checkpoints
- [ ] Commit: "Phase 0: Rename to TS + install effect v4"
```

### **Phase 1: Core Domain** (Est. 3-4 hours)
```
- [ ] Branded types (UserId, RequestId, etc.)
- [ ] Centralized errors (core/errors/)
- [ ] Common schemas (core/schemas/)
- [ ] ConfigService Effect service
- [ ] Crypto helpers (crypto.ts, phone.ts)
- [ ] TDD: Write tests first
- [ ] Commit per task
```

### **Phase 2: Infrastructure** (Est. 5-6 hours)
```
- [ ] Mongo service (Context.Service, acquireRelease)
- [ ] Postgres service (Drizzle + Context.Service)
- [ ] Redis service (split cache/session)
- [ ] RabbitMQ service with retry/DLQ
- [ ] Email service
- [ ] Health check service
- [ ] TDD for each service
```

### **Phase 3: Runtime + Bridge** (Est. 3-4 hours)
```
- [ ] appLayer (compose all services)
- [ ] appRuntime (ManagedRuntime + fiber)
- [ ] effectHandler (routes → services bridge)
- [ ] Fastify plugin (fastify-plugin for dependency)
- [ ] Request context setup (Context.Reference)
- [ ] Logging layer (Pino + Effect.log)
- [ ] Fix effectHandler R-channel typing (Improvement #12)
- [ ] app.ts entry
- [ ] TDD for handler logic
```

### **Phase 4: Health Pilot** (Est. 2-3 hours)
```
- [ ] Migrate health module (TDD)
- [ ] Health routes (/health, /health/ready, /health/live)
- [ ] Graceful degradation (Improvement #7)
- [ ] Tests: unit + integration
- [ ] First full working endpoint
```

### **Phase 5: Auth Module** (Est. 6-8 hours)
```
- [ ] PASETO token service (Effect service)
- [ ] argon2 password hashing
- [ ] Arctic OAuth integration
- [ ] JWT refresh token logic
- [ ] Impersonation tokens
- [ ] WebSocket auth
- [ ] Password strength (zxcvbn, Improvement #5)
- [ ] Rate limiting (Improvement #11)
- [ ] TDD for all auth flows
```

### **Phase 6+: Deferred** (Pattern established)
```
- WebSocket real-time
- Event audit (Outbox)
- OpenTelemetry
- Circuit Breaker
- Advanced rate limiting
```

---

## Key Files & Locations

### **Architecture & Plans**
- `docs/superpowers/plans/2026-05-28-js-to-ts-effect-migration.md` – Detailed phase-by-phase plan
- `docs/superpowers/MIGRATION_CONTINUATION.md` – This file
- `graphify-out/graph.json` – Knowledge graph (query via `graphify query`)
- `graphify-out/GRAPH_REPORT.md` – Full graph analysis

### **Current State**
- `src/app/` – Express.js code (to migrate)
- `src/` – New TS structure (to build)
- `tests/` – Test directory (to update)
- `tsconfig.json` – Has bug on line 54 (empty string)

### **Reference Materials**
- `/home/harmeet/Desktop/prompts/design-patterns.md` – 21 backend patterns
- `/home/harmeet/Desktop/prompts/coding_guideline_based_on_JSF_MIRSA.md` – 76 coding rules
- Effect v4 docs: https://effect.website/

### **Dependencies**
- `effect` v4 (beta) – **To install**
- `fastify` 5.x – Already in package.json
- `typescript` 6.x – Already in package.json
- `paseto-ts`, `zxcvbn` – Already in package.json
- `arctic` – **To install** (OAuth library)
- `better-auth` – **To remove**

---

## Decision Log

| Decision | Option Chosen | Reason |
|----------|---------------|--------|
| Folder structure | Hybrid (Hexagonal) | Balances clarity with domain logic separation |
| Service pattern | Effect v4 Context.Service | Type-safe, modern Effect API |
| Request context | Context.Reference | Explicit, type-safe, v4 recommended |
| Auth approach | Option C (Full custom) | Maximum control, PASETO + Arctic combo |
| Framework | Fastify | Modern, performant, Pino integration |
| Database split | Mongo + Postgres | Mongoose for users, Drizzle for everything else |
| Error handling | Tagged errors + Match.exhaustive | No exceptions for control flow, exhaustive matching |
| Pattern coverage | 16/21 (76%) | All "prefer" patterns applied, rest unnecessary for MVP |
| Phase split | 6 phases (0-5 + deferred) | Incremental, deliverable-focused, app stays working |

---

## Critical Context for Next Developer

### **Effect v4 API Changes**
- All `Effect.Service` → `Context.Service`
- All `FiberRef` → `Context.Reference`
- All `Effect.locally` → `Effect.provideService`
- Imports: Always `from "effect"` (single package)
- Schema API changes noted but not used in plan (backwards compatible for now)

### **Architecture Constraints**
- `core/` ← `infra/` ← `features/` ← `runtime/` ← `app.ts` (dependency arrow shows imports flow)
- Never use barrel exports (direct imports only)
- All business logic in Effect services, never in Fastify handlers
- One shared ManagedRuntime (not per-request)
- All errors as Data.TaggedError + exhaustive matching

### **Type Safety Rules**
- No `any`
- effectHandler must have parameterized R channel (not `never`)
- All services must declare dependencies via Context.Service
- Schema.decodeUnknown → ValidationError mapping at route entry

### **Testing Strategy**
- TDD: Write tests first, then implementation
- Pure core testable in isolation
- Infra adapters tested separately with mocks
- Integration tests for workflows
- Tests live in `tests/{unit,integration,e2e}/`

### **Graphify Integration**
The knowledge graph can answer questions about the codebase:
```bash
graphify query "where are errors from the client handled?"
graphify path "Logger" "httpError"
graphify explain "authentication flow"
graphify update .  # After making changes
```

---

## Quick Start: What to Do Next

### **If starting Phase 0 immediately:**
1. Run `git checkout -b phase-0-setup`
2. Use the task list from "Phase 0: Initial Setup" above
3. Commit frequently (per task)
4. After compiling, use graphify to map new errors to modules

### **If reviewing first:**
1. Read `docs/superpowers/plans/2026-05-28-js-to-ts-effect-migration.md` (sections 1-4 first)
2. Check design pattern section (section 8)
3. Ask clarifying questions about any phase
4. Then proceed with Phase 0

### **If running architecture spike:**
1. Create a spike branch
2. Create `src/spike/` with minimal Fastify + Effect v4 setup
3. Verify:
   - Fastify plugin can share ManagedRuntime
   - Context.Reference works across requests
   - Schema validation works
   - Error handling chain works
3. Commit findings to `AGENTS.md`
4. Then proceed with Phase 0

---

## Communication & Feedback

- **For questions:** Review the detailed plan first, then ask specific questions
- **For issues:** Use graphify queries to understand relationships
- **To checkpoint:** Use `/checkpoint` skill to save progress before switching context
- **To report bugs:** Check graphify god nodes (Logger, httpError, httpResponse) first

---

## Version History

| Date | Status | Key Changes |
|------|--------|------------|
| 2026-05-29 | ✅ Ready | Migration plan complete, Effect v4 fully applied, design patterns analyzed, 12 improvements mapped, continuation guide written |
| 2026-05-28 | ✅ Complete | Full migration plan written with self-review |

---

**Next Step:** Choose Phase 0, Phase 1 review, or architecture spike. Ask for clarification on any aspect before proceeding.
