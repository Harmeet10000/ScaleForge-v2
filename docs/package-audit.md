# Package Audit Plan

**Date:** 2026-05-31  
**Current total:** 188 packages (165 deps + 23 devDeps)  
**Target after all removals:** ~90 packages

---

## Section 1 — REMOVE NOW (zero imports, no future use case)

These have **0 references** anywhere in `src/` and no place in a backend API project.
Safe to `bun remove` immediately without touching any source file.

### Zero-use utilities / CLI tools

| Package | Reason |
|---|---|
| `compression` | Express middleware; use `@fastify/compress` (already installed) |
| `hpp` | Express HTTP-param-pollution guard; not needed with Fastify |
| `cookie-parser` | Express; use `@fastify/cookie` (already installed) |
| `reflect-metadata` | OOP decorators; not part of Effect approach |
| `atomic-sleep` | Busy-wait sleep; no use case |
| `varlock` | Dep locking tool; not used |
| `wattpm` | Platformatic plugin manager; not used |
| `crawlee` | Web scraping; wrong product |
| `tree-sitter` + `tree-sitter-javascript` | AST parsing; not relevant to a backend API |
| `node-pty` + `@xterm/xterm` + `@xterm/addon-fit` | Terminal emulator UI; backend API project |
| `piscina` | Worker threads; superseded by Effect fibers |
| `ci-info` | CI environment detection; not used |
| `flatted` | Circular JSON serializer; not used |
| `clone-deep` | `structuredClone()` is native in Node 17+ / Bun |
| `fast-deep-equal` | Effect Schema handles structural equality |
| `xxhashjs` | Hashing; not used anywhere |
| `simdjson` | Bun's native JSON parser is already SIMD-accelerated |
| `@pierre/diffs` | Diff utility; not used |
| `open` | Opens browser/files from CLI; backend API |
| `ora` | CLI spinner; not relevant |
| `prompts` | Interactive CLI prompts; not relevant |
| `which` | Finds executables in PATH; not used |
| `yargs` | CLI arg parsing; not used |
| `fast-xml-parser` | 0 uses; add back only if an external API returns XML |
| `execa` | Subprocess execution; not used |
| `p-limit` | Superseded by `Effect.all({ concurrency: N })` |
| `p-map` | Superseded by `Effect.forEach` with concurrency option |
| `p-retry` | Superseded by `Effect.retry` + `Schedule` |
| `xstate` | State machines; Effect is the coordination model |
| `neverthrow` | `Result` type; superseded by `Effect` |
| `qs` | Fastify handles query parsing natively via its own parser |
| `busboy` | Transitive dep of `@fastify/multipart`; not a direct dep |
| `form-data` | Not imported anywhere in new code |
| `ms` | Not imported directly; used only transiently by other libs |
| `ajv` | Fastify ships its own bundled AJV instance; not a direct dep |
| `fast-json-stringify` | Fastify uses this internally; access via `app.serializerCompiler` if ever needed |
| `ws` (standalone) | `@fastify/websocket` owns `ws` as a transitive dep; remove as direct dep |
| `@fastify/static` | Not used; no static file serving in scope |

### Fastify plugins superseded by Effect

| Package | Superseded by |
|---|---|
| `@fastify/hotwire` | SSR Hotwire/Turbo; wrong stack entirely |
| `@fastify/autoload` | We register routes manually (more explicit, no magic) |
| `@fastify/env` | `Effect.Config` + Bun reads `.env` natively |
| `@fastify/funky` | Functional helpers; superseded by Effect |
| `@fastify/middie` | Express middleware compat shim; not needed |
| `@fastify/express` | Express compat layer; not needed |
| `@fastify/secure-session` | Cookie sessions; we use stateless PASETO tokens |
| `@fastify/schedule` | Cron scheduling; use `Effect.Schedule` |
| `@fastify/mongodb` | Mongoose Fastify adapter; we use the Effect `MongoService` |
| `@fastify/postgres` | Drizzle Fastify adapter; we use the Effect `PostgresService` |
| `@fastify/redis` | ioredis Fastify adapter; we use the Effect `RedisService` |
| `awilix` + `@fastify/awilix` | DI container; superseded by Effect `Layer` |
| `@kne/fastify-user` | Alpha, never imported, no stability guarantee |
| `fastify-graceful-shutdown` | We shutdown via `ManagedRuntime.dispose` + SIGTERM handlers |
| `fastify-cloudflare-turnstile` | CAPTCHA; not in scope |
| `fastify-axios` | We use `undici` |
| `fastify-formbody` *(unscoped old)* | Duplicate of `@fastify/formbody` (keep the scoped one) |

### Niche Fastify plugins (remove, add back on demand)

| Package | Notes |
|---|---|
| `@fastify/accepts` + `@fastify/accepts-serializer` | We serve JSON only; no content negotiation needed |
| `@fastify/caching` | Add when serving cacheable GET endpoints (leaderboard snapshots) |
| `@fastify/etag` | Add when leaderboard/cache endpoints need ETag validation |
| `@fastify/sse` | WebSocket covers our real-time use case |
| `@fastify/throttle` | Bandwidth throttle for file downloads; not in scope |
| `@fastify/routes` + `@fastify/routes-stats` | Dev introspection utilities; not needed in dep tree |
| `@fastify/url-data` | Not used anywhere |

### devDeps

| Package | Reason |
|---|---|
| `swagger-autogen` | Express-era; replaced by `@fastify/swagger` |
| `swagger-jsdoc` | Express-era; replaced by `@fastify/swagger` |
| `swagger-model-validator` | Express-era; replaced by `@fastify/swagger` |
| `swagger-ui-express` | Express-era; replaced by `@fastify/swagger-ui` |
| `lefthook` | Duplicate git hook tool; we use `husky` |
| `globals` | Not needed with oxlint |

**Total Section 1 removals: ~55 packages**

---

## Section 2 — REMOVE WITH LEGACY CODE PURGE

These are **still imported by the old Express feature files** (`src/app/features/auth/`, `audit/`, `notifications/`, `payments/`, `search/`, `storage/`, `gemini/`).

Remove each package **when its corresponding feature module is migrated** to Effect/Fastify. Do not remove them before the old file is deleted — it will break the build.

| Package | Currently in | Replace with |
|---|---|---|
| `express` | 7 old route files | Fastify route handlers |
| `express-async-handler` | **39 old files** — biggest migration signal | Fastify + `runtime.runFork` |
| `express-mongo-sanitize` | old middleware | Not needed: Effect Schema + Fastify |
| `express-rate-limit` | old middleware | `@fastify/rate-limit` ✅ already wired |
| `express-timeout-handler` | old middleware | Fastify `connectionTimeout` config |
| `express-prom-bundle` | old metrics middleware | `prom-client` ✅ already wired |
| `helmet` *(standalone)* | old middleware | `@fastify/helmet` ✅ already wired |
| `cors` *(standalone)* | old middleware | `@fastify/cors` ✅ already wired |
| `jsonwebtoken` | `auth/authMiddleware.ts`, `generalHelper.ts` | `paseto-ts` ✅ |
| `bcryptjs` | `generalHelper.ts`, `userSeeder.ts` | `argon2` ✅ |
| `joi` | 6 old `*Validation.ts` files | `effect/Schema` ✅ |
| `winston` | `utils/logger.ts` | `pino` ✅ |
| `winston-mongodb` | `utils/logger.ts` | `pino` |
| `uuid` | `auditService.ts`, `generalHelper.ts` | `@paralleldrive/cuid2` ✅ |
| `nanoid` | `serverMiddleware.ts` | `@paralleldrive/cuid2` ✅ |
| `dayjs` | old auth/audit files | `date-fns` (keep, remove `dayjs`) |
| `colorette` | `utils/logger.ts` | `pino` handles log formatting |
| `source-map-support` | `utils/logger.ts` | Bun has native source maps |
| `dotenv-flow` | `config/dotenvConfig.ts` | Bun + `Effect.Config` |
| `overload-protection` | `serverMiddleware.ts` | `@fastify/under-pressure` |
| `kafkajs` | `connections/connectKafka.ts` | **Plan is RabbitMQ-only; delete that file** |
| `node-rdkafka` | commented-out in kafka examples | Same — delete the file |
| `@platformatic/kafka` | not imported; implied by above | Remove |
| `rabbitmq-client` | commented-out in `connectRabbitMQ.ts` | `amqplib` ✅ |
| `rabbitmq-stream-js-client` | not imported anywhere | Remove |
| `fastify-amqp-async` | not imported anywhere | `RabbitConsumerService` ✅ |
| `@platformatic/rabbitmq-hooks` | not imported anywhere | Remove |
| `@fastify/jwt` | not imported in any new code | `paseto-ts` ✅ |
| `@novu/node` | referenced only in legacy notification service | **Replaced by `@knocklabs/node` exclusively** |
| `@platformatic/job-queue` | not imported in new code | Our Effect-native worker architecture ✅ |
| `bottleneck` | `serverMiddleware.ts` (old) | Migrate to new code for outbound API rate limiting (see Section 4) |

**Total Section 2 removals: ~31 packages (one-by-one as features migrate)**

---

## Section 3 — WIRE UP NOW

Installed, not yet used in new Effect/Fastify code, high ROI, no phase boundary.
These should be added in the next coding session.

| Package | Where | What it fixes |
|---|---|---|
| `@fastify/cookie` | `src/app/app.ts` + `auth2/authRoutes.ts` | Refresh token in `httpOnly; Secure; SameSite=Strict` cookie — eliminates XSS token theft from JSON body |
| `@fastify/compress` | `src/app/app.ts` | Brotli/gzip all JSON responses; ~60–70% bandwidth reduction with zero logic change |
| `@fastify/under-pressure` | `src/app/app.ts` | CPU + heap pressure → automatic 503 before requests queue; wire readiness into `/health` |
| `@fastify/request-context` | `src/app/app.ts` + `fastifyBridge.ts` | `x-request-id` correlation ID propagated through every `Effect.log*` via annotations |
| `close-with-grace` | `src/app/main.ts` + all 3 worker entry points | Replace manual `process.on('SIGTERM')` with a `grace=10s` deadline that drains in-flight requests |
| `ts-pattern` | `src/core/errors/httpErrors.ts` + new feature mappers | Exhaustive `match()` — makes `toHttpError` compile-fail on missing cases instead of falling through |

---

## Section 4 — PHASE MAP (keep, use when the phase arrives)

| Phase | Package(s) | Planned usage |
|---|---|---|
| **6.1 Leaderboard WS** | `@fastify/websocket` | WebSocket route handler for real-time score broadcast |
| **6.1 Leaderboard WS** | `superjson` | Type-preserving WS message serialization (preserves `Date`, `BigInt`, `Map`) |
| **6.3 Authorization** | `@openfga/sdk` | `OpenFgaService` Effect layer; `src/app/connections/connectOpenFGA.ts` is the reference stub |
| **6.4 Worker perf** | `msgpackr` | Binary RabbitMQ message serialization — replace `JSON.stringify` in all producers |
| **6.5 Outbound limiting** | `bottleneck` | Rate-limit calls to Razorpay, Resend, Gemini (migrate from old `serverMiddleware.ts`) |
| **6.5 Outbound limiting** | `async-cache-dedupe` | Deduplicate concurrent identical feature-flag and external API lookups |
| **7 Payments** | `razorpay` | `RazorpayService` Effect layer; HMAC webhook verification already built in Phase 17 |
| **7 Search** | `@elastic/elasticsearch` | `SearchService` Effect layer; `src/app/connections/connectElasticSearch.ts` is the reference stub |
| **7 Notifications** | `@knocklabs/node` | `NotificationService` Effect layer — replaces all old Novu code |
| **7 User profile** | `libphonenumber-js` | Phone number validation in user profile `Schema.check()` |
| **7 User profile** | `countries-and-timezones` | Country/timezone picker validation |
| **7 User profile** | `zxcvbn` | Password strength scoring at registration (feed score into `PasswordTooWeakError`) |
| **7 File uploads** | `@fastify/multipart` | Multipart route handler; `S3Service` ✅ already built |
| **8 AI** | `@google/genai` | `GeminiService` Effect layer; `src/app/helpers/gemini.ts` is the reference stub |
| **8 OAuth** | `arctic` | Google + GitHub OAuth flows in `auth2/`; PKCE + token exchange |
| **8 2FA** | `qrcode` | TOTP QR code PNG at 2FA setup |
| **Dev / profiling** | `@platformatic/flame` | Flamegraph profiling; dev/staging only |

---

## Section 5 — DECISIONS NEEDED

Review these before acting on them.

| Package | Options | Recommendation |
|---|---|---|
| `date-fns` vs `dayjs` | Both installed. `dayjs` only in old Express code. `date-fns` v4 is ESM-native, tree-shakeable, no plugin system. | **Keep `date-fns`, remove `dayjs`** |
| `@platformatic/fastify-http-metrics` | Could replace the manual `httpRequestDuration` Histogram wiring in `MetricsService`. Auto-instruments all routes. | **Evaluate**: if Prometheus labels match (method, route, status_code), swap it in and delete the manual histogram |
| `@fastify/auth` | Multi-strategy auth combinator (AND/OR preHandlers). Not yet imported. | **Keep** — needed when PASETO + API-key strategies need to coexist on the same route |
| `@fastify/circuit-breaker` | Wrap outbound HTTP calls to Razorpay, Resend, OpenFGA. | **Keep for Phase 7** — wrap any call where a downstream outage should not cascade |
| `es-toolkit` | Modern lodash-style utilities; 0 imports currently. | **Keep through Phase 7** — use in data mappers/transformers; remove if still 0 imports after Phase 7 ships |
| `@fastify/response-validation` | Validates response payloads against JSON Schema at runtime. | **Wire conditionally**: `if (config.isDevelopment)` — catches response contract drift during dev without prod overhead |
| `@fastify/formbody` | Parses `application/x-www-form-urlencoded`. | **Keep** — required for OAuth redirect form posts from Arctic |
| `@fastify/caching` + `@fastify/etag` | HTTP cache-control and ETag headers. | **Defer to Phase 6.1** — add on leaderboard snapshot and feature-flag GET endpoints |
| `superjson` | Type-preserving JSON for WebSocket payloads. | **Wire in Phase 6.1** alongside `@fastify/websocket` |
| `@socketsecurity/bun-security-scanner` | Supply chain security scanner for Bun. | **Keep as devDep** — run in CI |
| `@fastify/sse` | Server-Sent Events. | **Remove** — `@fastify/websocket` covers the real-time use case with better browser support |

---

## Migration Checklist (execute in order)

- [ ] **Today / next session**: Execute Section 1 removes (`bun remove ...`)
- [ ] **Next session**: Wire Section 3 packages into `app.ts` + `main.ts` + workers
- [ ] **Phase 6.1**: Wire `@fastify/websocket` + `superjson`; remove `@fastify/sse`
- [ ] **Per feature migration**: Remove Section 2 packages one-by-one as each `src/app/features/<name>/` gets replaced
- [ ] **Phase 7**: Wire payments, search, notifications, file uploads
- [ ] **Phase 8**: Wire AI, OAuth, 2FA
- [ ] **After Phase 7**: Audit `es-toolkit` — remove if still 0 imports
- [ ] **Resolve Section 5 decisions** before Phase 6.1 starts

---

## Quick Reference: What stays in the final stack

| Layer | Package |
|---|---|
| Runtime | `effect`, `fastify`, `fastify-plugin` |
| HTTP plugins | `@fastify/cors`, `@fastify/helmet`, `@fastify/csrf-protection`, `@fastify/rate-limit`, `@fastify/cookie`, `@fastify/compress`, `@fastify/under-pressure`, `@fastify/request-context`, `@fastify/swagger`, `@fastify/swagger-ui`, `@fastify/websocket`, `@fastify/formbody`, `@fastify/multipart`, `@fastify/auth`, `@fastify/circuit-breaker`, `@fastify/response-validation` |
| Database | `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `mongoose` |
| Cache / Queue | `ioredis`, `amqplib`, `lru-cache`, `async-cache-dedupe`, `msgpackr` |
| Auth | `paseto-ts`, `argon2`, `arctic` |
| Storage | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| Observability | `pino`, `prom-client`, `@sentry/node`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/auto-instrumentations-node` |
| External APIs | `resend`, `razorpay`, `@knocklabs/node`, `@google/genai`, `@openfga/sdk`, `@elastic/elasticsearch` |
| Validation / IDs | `@paralleldrive/cuid2`, `date-fns` |
| HTTP client | `undici` |
| Utilities | `ts-pattern`, `superjson`, `bottleneck`, `close-with-grace`, `zxcvbn`, `libphonenumber-js`, `countries-and-timezones`, `qrcode`, `es-toolkit` |
| Build / DX | `@effect/language-service`, `oxlint`, `oxfmt`, `husky`, `lint-staged`, `@commitlint/cli`, `drizzle-kit`, `pdfkit` |
| Dev / profiling | `@platformatic/flame`, `clinic`, `@socketsecurity/bun-security-scanner` |
