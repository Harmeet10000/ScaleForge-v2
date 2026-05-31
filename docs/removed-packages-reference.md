# Removed Packages — What They Did & What Replaced Them

**Runtime note:** Bun is used as the package manager only (`bun install` / `bun remove`).  
The runtime is **Node.js** (18+). This matters for a few entries below (source maps, env loading).

---

## Express Ecosystem

These packages formed the entire old middleware stack. Every single one is replaced by a
Fastify-native equivalent or is simply unnecessary.

| Package | What it did | Replaced by |
|---|---|---|
| `express` | HTTP framework — routing, middleware chain, `req`/`res` objects | `fastify` |
| `express-async-handler` | Wraps `async` route handlers so thrown errors reach Express's error middleware. Was imported in **39 files** — the single biggest migration signal. | Fastify route handlers are `async` natively; errors propagate automatically. In new code: `runtime.runFork(effect)` |
| `express-mongo-sanitize` | Strips `$` and `.` from user input to prevent MongoDB operator injection | Not needed: Effect Schema decodes to typed structs, so raw untrusted input never reaches the DB layer |
| `express-rate-limit` | In-memory (or Redis-backed) rate limiting middleware for Express | `@fastify/rate-limit` ✅ already wired in `src/app/plugins/rateLimiting.ts` |
| `express-timeout-handler` | Calls `next(new Error)` if a request takes longer than N ms | Fastify has `connectionTimeout` and `requestTimeout` server options built in |
| `express-prom-bundle` | Auto-instruments Express routes with Prometheus `http_request_duration_seconds` | `prom-client` ✅ wired manually in `MetricsService`; Fastify route hooks record durations |
| `helmet` *(standalone)* | Sets security-related HTTP headers (CSP, HSTS, X-Frame-Options, etc.) via Express middleware | `@fastify/helmet` ✅ already wired in `src/app/plugins/security.ts` |
| `cors` *(standalone)* | Cross-Origin Resource Sharing headers for Express | `@fastify/cors` ✅ already wired |
| `compression` | Gzip/deflate response compression for Express | `@fastify/compress` (installed, wired in Section 3) |
| `cookie-parser` | Parses `Cookie` header into `req.cookies` for Express | `@fastify/cookie` (installed, wired in Section 3) |
| `hpp` | HTTP Parameter Pollution guard — flattened duplicate query params from arrays to the last string value so validators wouldn't be bypassed | **Not needed**: Fastify's JSON Schema validation on `querystring` rejects unexpected types (arrays vs strings) before the handler runs. No Fastify port of `hpp` exists, nor is one necessary. |

---

## Authentication

| Package | What it did | Replaced by |
|---|---|---|
| `jsonwebtoken` | Signed and verified HS256/RS256 JSON Web Tokens. Used for access and refresh tokens. | `paseto-ts` ✅ — PASETO v4.public (Ed25519 asymmetric signing). Stronger security model: no `alg: none` attack surface, no algorithm confusion. |
| `bcryptjs` | Password hashing with bcrypt (cost factor ~12). Pure-JS, slower than native. | `argon2` ✅ — argon2id with OWASP-2024 params (64 MiB / 3 iter / 4 par). Winner of the Password Hashing Competition. Resistant to GPU and side-channel attacks. |
| `@fastify/jwt` | Fastify plugin that decorates `request.jwtVerify()` and `reply.jwtSign()` using `jsonwebtoken` under the hood | `paseto-ts` ✅ + custom `requireAuth` preHandler in `src/app/features/auth2/authMiddleware.ts` |

---

## Validation

| Package | What it did | Replaced by |
|---|---|---|
| `joi` | Runtime validation with a fluent schema builder. Used in 6 `*Validation.ts` files. Schema defined separately from types — no static type inference. | `effect/Schema` ✅ — single source of truth for both runtime decoding and TypeScript types. `Schema.decodeUnknownResult` for sync paths, `Schema.decodeUnknownEffect` for async. |
| `ajv` | JSON Schema validator. Fastify's own validation pipeline uses AJV internally. We were declaring it as a direct dep but never importing it ourselves. | Fastify ships its own bundled AJV instance. It's a transitive dep — remove as direct dep. |
| `neverthrow` | Railway-oriented programming — `Result<T, E>` and `ResultAsync<T, E>` types for error handling without exceptions. | `Effect<A, E, R>` ✅ — strictly typed errors, composable, with fiber scheduling, resource management, and dependency injection on top. |

---

## Logging

| Package | What it did | Replaced by |
|---|---|---|
| `winston` | Structured logger with transports (file, console, MongoDB, Loki). Used via `src/app/utils/logger.ts`. | `pino` ✅ — fastest Node.js logger. 5–8× throughput vs winston. JSON output, low overhead, pino-pretty for dev. Wired as Effect `Logger.make` in `PinoLoggerLayer`. |
| `winston-mongodb` | Winston transport that writes log entries to a MongoDB collection | `pino` ✅ — pino transports (e.g. `pino-mongodb`) can be added as a stream, but structured logging to MongoDB for application logs is an antipattern. Use an observability stack (Loki/Datadog/etc.). |
| `colorette` | Terminal color utilities (red, blue, green, etc.) used by the old `utils/logger.ts` | `pino-pretty` handles colorized dev output. Pino's transport config handles formatting. |
| `source-map-support` | Monkey-patched `Error.prepareStackTrace` to translate compiled-JS line numbers back to TypeScript source locations in stack traces. | **Node 18+ native**: run with `node --enable-source-maps dist/main.js`. For dev with `tsx`: source maps work natively. No npm package needed. |

---

## Environment / Config

| Package | What it did | Replaced by |
|---|---|---|
| `dotenv-flow` | Loaded `.env`, `.env.{NODE_ENV}`, `.env.local` files in priority order. Useful for environment-specific overrides. | **Node 20.6+**: `node --env-file=.env src/app/main.js`. `Effect.Config` ✅ handles validation, defaults, and redaction — it reads from `process.env` regardless of how env vars were loaded. For multi-env overrides: use shell scripts or a Makefile that exports the right vars before starting Node. |
| `@fastify/env` | Fastify plugin that validated environment variables against a JSON Schema on startup and decorated `fastify.config` with the parsed values | `Effect.Config` ✅ — `Config.string("PORT")`, `Config.redacted("DB_PASSWORD")`, etc. Validated at `ManagedRuntime.make` startup; any missing var throws a typed `ConfigError` that surfaces immediately. |

---

## Message Queue

| Package | What it did | Replaced by |
|---|---|---|
| `rabbitmq-client` | Alternative amqplib-style client with auto-reconnect and a slightly different API surface. Was only in a commented-out block. | `amqplib` ✅ — used in all new code (`rabbitmqService.ts`, `rabbitConsumer.ts`, `dlqService.ts`). Manual reconnect via `Schedule.exponential`. |
| `rabbitmq-stream-js-client` | Client for the RabbitMQ Streams protocol (persistent ordered log, different from classic queues). Not imported anywhere. | `amqplib` ✅ — RabbitMQ classic queues (AMQP 0-9-1) cover all current use cases. Streams would add protocol complexity without clear benefit at current scale. |
| `fastify-amqp-async` | Fastify plugin that connected to RabbitMQ and decorated `fastify.amqp` with a channel. | `RabbitConsumerService` ✅ — typed Effect service in `src/workers/shared/rabbitConsumer.ts`. Separate consumer channel, Effect Queue bridge, ack/nack as Effects. |
| `@platformatic/rabbitmq-hooks` | Platformatic framework hooks for RabbitMQ — lifecycle events tied to the Platformatic app lifecycle. | `RabbitMQServiceLive` + `RabbitConsumerServiceLive` ✅ — Effect `acquireRelease` manages connection lifecycle with LIFO finalizers. |
| `@platformatic/job-queue` | Platformatic's job queue backed by PostgreSQL — a simpler alternative to RabbitMQ for background jobs. | Effect-native worker architecture ✅ — `webhookDeliveryWorker.ts`, `pdfReceiptWorker.ts`, `emailWorker.ts` each run as separate `ManagedRuntime` processes consuming from dedicated RabbitMQ queues. Supports DLQ, retry, backoff, per-message fiber isolation. |

---

## Kafka

All three removed. **The architecture decision is RabbitMQ-only.** Kafka would add operational complexity (broker, partition management, consumer group rebalancing) with no benefit at current scale. RabbitMQ's topic exchanges cover every routing pattern needed.

| Package | What it did | Replaced by |
|---|---|---|
| `kafkajs` | Pure-JS Kafka client — producers, consumers, admin. Used in `src/app/connections/connectKafka.ts`. | `amqplib` ✅ + RabbitMQ topic exchanges |
| `node-rdkafka` | Native C++ Kafka client (librdkafka binding) — higher throughput than kafkajs. Only in a commented-out example file. | Same as above |
| `@platformatic/kafka` | Platformatic framework's Kafka integration module. Not imported. | Same as above |

---

## Dependency Injection

| Package | What it did | Replaced by |
|---|---|---|
| `awilix` | IoC container — registers services by name, resolves dependency graphs, supports lifetime scopes (singleton, scoped, transient). | `Effect.Layer` ✅ — compile-time dependency graph, no string-based registration, no runtime reflection. `Layer.mergeAll` + `Layer.provide` compose the graph. Scopes are explicit `Scope` values. |
| `@fastify/awilix` | Fastify plugin wrapper for awilix — registered an awilix container as `fastify.diContainer` and created a request-scoped child container per request. | `ManagedRuntime` ✅ as `effectRuntime` Fastify decorator (`fastifyBridge.ts`). Request scope via `Effect.scoped`. |

---

## Fastify Plugins (superseded or out of scope)

| Package | What it did | Replaced by |
|---|---|---|
| `@fastify/express` | Compatibility shim — allowed mounting Express middleware (`app.use(...)`) inside Fastify during incremental migration. | Migration is complete for new code. Old Express files are replaced wholesale, not shimmed. |
| `@fastify/middie` | Lighter shim for Express-style middleware (`use(fn)`) in Fastify without full Express compat. Used during migration. | Same — not needed once old middleware is gone. |
| `@fastify/jwt` | Fastify plugin for JWT via `request.jwtVerify()`. Used HS256 or RS256. | `paseto-ts` ✅ + `requireAuth` preHandler |
| `@fastify/secure-session` | Cookie-based encrypted sessions using `sodium-native`. Stores server-side session state in a cookie. | PASETO v4.public tokens ✅ — stateless, no server-side session storage needed. Refresh tokens in `httpOnly` cookies via `@fastify/cookie`. |
| `@fastify/schedule` | Fastify plugin wrapping `@sinonjs/fake-timers` and `toad-scheduler` for cron and interval jobs. | `Effect.Schedule` ✅ — `Schedule.cron("0 * * * *")`, `Schedule.fixed(Duration.hours(1))`, etc. Composable, testable, fiber-managed. |
| `@fastify/mongodb` | Fastify plugin that connected to MongoDB and decorated `fastify.mongo.db`. | `MongoServiceLive` ✅ — Effect `Context.Service` with `acquireRelease` lifecycle. |
| `@fastify/postgres` | Fastify plugin for `pg` / `postgres.js` — decorated `fastify.pg.query(...)`. | `PostgresServiceLive` ✅ — Drizzle + Neon, Effect service with typed `query()` helper. |
| `@fastify/redis` | Fastify plugin for ioredis — decorated `fastify.redis`. | `RedisServiceLive` ✅ — ioredis Effect service with `ping()`, `get`, `set`, `del`, etc. |
| `@fastify/autoload` | Scanned a directory for plugin files and loaded them automatically. Reduced explicit registration boilerplate. | Manual route registration in `src/app/app.ts`. More explicit — import order is visible, no magic file discovery. |
| `@fastify/hotwire` | Integrated Hotwire Turbo / Stimulus into Fastify for server-side rendered HTML with stream updates. | Not applicable — ScaleForge is a JSON API + WebSocket server, not an SSR HTML app. |
| `@fastify/funky` | Added functional programming helpers to Fastify — `reply.send(effect)`, automatic promise unwrapping. | Effect + `fastifyBridge.ts` ✅ — `runtime.runFork(effect)` in route handlers. |
| `@fastify/accepts` + `@fastify/accepts-serializer` | Content-type negotiation — parsed `Accept` header and routed serialization to JSON, msgpack, etc. | Not needed — all endpoints produce `application/json`. If msgpack is needed for WebSocket, `msgpackr` is wired directly. |
| `@fastify/sse` | Server-Sent Events — `reply.sse(generator)` for streaming one-way text/event-stream responses. | `@fastify/websocket` ✅ — WebSocket is bidirectional and has better browser support (no polling reconnect needed for leaderboard). |
| `@fastify/throttle` | Per-connection byte-rate throttling for response streams — useful for file download rate limiting. | Not in scope. If file download bandwidth control is needed, add back. |
| `@fastify/routes` + `@fastify/routes-stats` | Dev-mode route introspection — `fastify.routes` array, request count stats per route. | Not needed as a dep — Fastify exposes `fastify.printRoutes()` and `fastify.routes` natively in v5. |
| `@fastify/url-data` | Decorated `request.urlData()` with parsed URL components (host, pathname, query, hash). | Not needed — `request.url`, `request.hostname`, `request.query` cover all use cases. |
| `@fastify/static` | Served files from a directory via `fastify.register(staticPlugin, { root })`. | Removed from scope — no static file serving needed. SDK artifacts are served via S3 presigned URLs. |
| `fastify-graceful-shutdown` | Listened for `SIGTERM`/`SIGINT` and called `fastify.close()` with a timeout. | `ManagedRuntime.dispose()` ✅ in `src/app/main.ts` — Effect's `Scope` finalizers drain all services in LIFO order. `close-with-grace` (Section 3) adds a grace-period deadline. |
| `fastify-axios` | Fastify plugin that decorated `fastify.axios` with an Axios instance. | `undici` ✅ — Node's preferred HTTP client, no dependency on Axios's interceptor complexity. |
| `fastify-cloudflare-turnstile` | Fastify plugin for verifying Cloudflare Turnstile CAPTCHA tokens as a preHandler. | Removed from scope. CAPTCHA can be added back as a single `Effect.tryPromise` call in the auth preHandler if needed. |
| `fastify-formbody` *(old unscoped)* | Parsed `application/x-www-form-urlencoded` request bodies. Was the original package before Fastify moved to scoped names. | `@fastify/formbody` ✅ — the official scoped successor (already installed). Exact same functionality. |
| `@kne/fastify-user` | Alpha-stage plugin to attach user context to requests. Never imported. | `@fastify/request-context` (Section 3) + `requireAuth` preHandler attaches the verified user to request context. |

---

## Concurrency Utilities

All three replaced by Effect's built-in concurrency model. Adding these on top of Effect would create two competing concurrency abstractions.

| Package | What it did | Replaced by |
|---|---|---|
| `p-limit` | Limits concurrent async promise executions — `const limit = pLimit(5); limit(() => fetch(...))` | `Effect.all(effects, { concurrency: 5 })` or `Effect.forEach(items, fn, { concurrency: 5 })` |
| `p-map` | Async `Array.map` with a concurrency limit | `Effect.forEach(items, fn, { concurrency: N })` |
| `p-retry` | Retries a promise-returning function with configurable backoff | `Effect.retry(effect, Schedule.exponential("1 second").pipe(Schedule.compose(Schedule.recurs(5))))` |
| `piscina` | Worker thread pool — offloaded CPU-bound work to a pool of `worker_threads` workers | Effect fibers ✅ are lightweight (not OS threads). For true CPU parallelism, `bun --smol` or Node `worker_threads` directly. Not needed at current scale. |

---

## ID Generation

Both removed. `@paralleldrive/cuid2` is used exclusively throughout the codebase (all DB schemas, auth service, audit log).

| Package | What it did | Replaced by |
|---|---|---|
| `uuid` | Generated RFC 4122 UUIDs (v1 timestamp, v4 random, v5 namespace). Used in `auditService.ts` and `generalHelper.ts`. | `@paralleldrive/cuid2` ✅ — collision-resistant, URL-safe, monotonically sortable, fingerprint-free. `createId()` is all you need. Note: `uuid` as a Drizzle column type (`uuid()` from `drizzle-orm/pg-core`) is unrelated to the npm package — that stays. |
| `nanoid` | URL-safe random ID (21 chars by default). Used in `serverMiddleware.ts` for request IDs. | `@paralleldrive/cuid2` ✅ or `crypto.randomUUID()` (Node 14.17+ native) for request IDs. |

---

## Date / Time

| Package | What it did | Replaced by |
|---|---|---|
| `dayjs` | Immutable date manipulation with a Moment.js-compatible API. Required plugins (`utc`, `timezone`, etc.) loaded separately. Used only in old Express files. | `date-fns` ✅ (already installed) — pure functions, ESM-native, tree-shakeable (import only what you use). No plugin system — UTC/timezone functions are direct imports. `date-fns` v4 is the modern choice. |

---

## State Machines

| Package | What it did | Replaced by |
|---|---|---|
| `xstate` | Finite state machine and statechart library. Actor model with typed states, events, guards, and actions. Never imported in the codebase. | `Effect` ✅ — `Effect.gen` + typed error channels model state transitions explicitly. For complex multi-step flows (payment lifecycle, onboarding), `Effect.gen` with `Schema`-validated input at each step is sufficient. If explicit FSM semantics are needed, `Effect`'s `STM` module handles transactional state. |

---

## Server Management / DevOps Tools

| Package | What it did | Replaced by |
|---|---|---|
| `overload-protection` | Monitored Node.js event-loop lag and heap usage; rejected incoming requests with 503 when thresholds were exceeded. | `@fastify/under-pressure` ✅ (Section 3) — same behaviour as a Fastify plugin with configurable `maxEventLoopDelay`, `maxHeapUsedBytes`, `maxRssBytes`, and a custom health check function. |
| `wattpm` | Platformatic's application manager — like pm2 but for the Platformatic framework. Managed process lifecycle, logs, and restarts. | Not needed. Workers run as separate Node processes managed by ECS task definitions or Docker Compose. |
| `lefthook` | Git hook runner (alternative to Husky). Defined hooks in `lefthook.yml`. | `husky` ✅ — already configured in `.husky/`. Two git hook tools in the same project cause unpredictable hook execution order. |

---

## Serialization / Parsing

| Package | What it did | Replaced by |
|---|---|---|
| `fast-json-stringify` | Ahead-of-time JSON serializer compiled from a JSON Schema — 2–3× faster than `JSON.stringify` for known shapes. | Fastify uses this internally for all route response serialization (when a `response` JSON Schema is defined). It is a transitive dep — we get the benefit for free. No need to import it directly. If needed for WebSocket broadcast serialization, access via `app.serializerCompiler`. |
| `flatted` | Serialized and deserialized circular JSON structures (objects with self-references). | Not needed — we don't have circular data structures. Effect's `Cause` and data models are acyclic. If circular debug output is needed, `util.inspect` handles it. |
| `fast-xml-parser` | Zero-dependency XML parser and builder. | Removed. Add back if an external API (e.g. an older Razorpay endpoint) returns XML. |
| `simdjson` | Node.js binding for the SIMD-accelerated `simdjson` C++ JSON parser — faster than `JSON.parse` for large payloads. | Not needed. Node 18+ and Bun both have native JSON parsers that are already highly optimized. The performance delta only matters for very large payloads (>1 MB JSON). |
| `busboy` | Streaming multipart form-data parser. The most used Node.js multipart library. | `@fastify/multipart` owns `busboy` as a direct transitive dependency. Don't declare it twice. |
| `form-data` | Created `multipart/form-data` request bodies for outbound HTTP calls (e.g. file uploads to external APIs). | `undici` ✅ — `new FormData()` is a Web API available natively in Node 18+ and Bun. No npm package needed. |
| `superjson` | Extended JSON serializer that preserved non-JSON-native types (`Date`, `Map`, `Set`, `BigInt`, `undefined`) by adding a `__meta` envelope. Used in old Redis helper. | **Kept for Phase 6.1** — wire alongside `@fastify/websocket` for type-preserving WebSocket message payloads. *(Not removed — listed here to clarify it moved to Section 4.)* |
| `qs` | Advanced query string parser supporting nested objects and arrays (`a[b][c]=1`). | Fastify's built-in query parser handles standard query strings. For deeply nested query objects, configure `querystringParser: (str) => qs.parse(str)` in the Fastify server options if needed. Not a direct dep. |
| `msgpackr` | **Kept for Phase 6.4** — binary RabbitMQ serialization upgrade. *(Not removed — listed here to clarify it stays.)* | — |

---

## Clone / Equality

| Package | What it did | Replaced by |
|---|---|---|
| `clone-deep` | Deep-cloned plain objects and arrays recursively, handling circular references. | `structuredClone()` ✅ — Web API, native in Node 17+ and Bun. Handles circular references, typed arrays, Maps, Sets, Dates. |
| `fast-deep-equal` | Deep structural equality check — faster than lodash's `isEqual`. | Effect Schema's `Schema.equivalence()` ✅ for domain type equality. For plain objects `JSON.stringify(a) === JSON.stringify(b)` or `structuredClone` comparison works at low scale. At high scale, Effect provides `Equal.equals()`. |

---

## Runtime Utilities (not needed with Node 18+ / Bun)

| Package | What it did | Replaced by |
|---|---|---|
| `source-map-support` | Monkey-patched `Error.prepareStackTrace` to remap compiled `.js` stack traces back to `.ts` source lines and columns. | **Node 18+**: `node --enable-source-maps dist/main.js`. **Node 20+**: source maps work with inline sourceMappingURL. **tsx** (for dev): source maps are natively active. No npm package needed. |
| `ms` | Converted time strings (`'2 days'`, `'1h'`, `'30m'`) to milliseconds and back. | `Effect.Duration` ✅ — `Duration.seconds(30)`, `Duration.hours(2)`, `Duration.decode("1 minutes")`. Composable with `Schedule`. Not needed as a standalone package. |
| `atomic-sleep` | Synchronous sleep using `Atomics.wait` — blocked the event loop for an exact duration. | Not needed. `Effect.sleep(Duration.millis(100))` for async sleep in Effect. Synchronous blocking of the event loop is an antipattern in a server. |
| `reflect-metadata` | Enabled TypeScript's `emitDecoratorMetadata` — allowed runtime inspection of constructor parameter types for decorator-based DI. | Not needed. Effect's dependency injection uses `Context.Service` + `Layer`, which is compile-time and does not require decorators or metadata reflection. |
| `ci-info` | Detected whether the process was running in a CI environment and which one (GitHub Actions, CircleCI, etc.). Exposed `isCI`, `name`, `isPR`. | Not used. CI-specific behaviour should be handled by environment variables (`CI=true`) set by the CI platform directly. |

---

## Web Scraping / Terminal UI

These were likely prototyped features or pulled in accidentally. None belong in a SaaS backend API.

| Package | What it did | Replaced by |
|---|---|---|
| `crawlee` | Web scraping and browser automation framework by Apify — built on top of Playwright/Puppeteer. Handled request queues, proxy rotation, and storage. | Nothing. Not a backend API concern. |
| `tree-sitter` + `tree-sitter-javascript` | Incremental AST parser for source code analysis. Used by code editors and linters. | Nothing. Not relevant to a backend API. |
| `node-pty` | Created pseudo-terminal (PTY) instances from Node — enabled spawning a shell and reading/writing its I/O. Typically paired with xterm.js. | Nothing. Not relevant to a backend API. |
| `@xterm/xterm` + `@xterm/addon-fit` | Browser-side terminal emulator UI library. `addon-fit` resized the terminal to fit its container. | Nothing. These are frontend libraries that ended up in the backend `package.json`. |

---

## CLI Tools (not relevant to a server process)

| Package | What it did | Replaced by |
|---|---|---|
| `yargs` | CLI argument parser — defined commands, options, and types; generated `--help` output. | Not needed. The only CLI tools in this project are npm scripts. `bun run <script>` handles all invocations. |
| `prompts` | Interactive CLI prompts — text input, select, multiselect, confirm. Async and composable. | Not needed for a server process. If a migration or seed script needs interactive confirmation, use Node's `readline` directly. |
| `open` | Opened URLs, files, or apps using the OS default handler (`xdg-open` on Linux, `open` on macOS). | Not needed. Backend servers don't open browser windows. |
| `ora` | Animated terminal spinner for long-running CLI operations. | Not needed for a server process. |
| `which` | Found the path of an executable in `PATH` — equivalent to the Unix `which` command. | Not needed. |
| `execa` | Ergonomic wrapper around `child_process.spawn` with promise support, piping, and signal handling. | Not needed. No subprocess execution in the server or workers. |
| `colorette` | Terminal string colorization using ANSI escape codes. Used by the old `utils/logger.ts`. | Pino's `pino-pretty` transport handles all colorized log output. |
| `varlock` | Locked/pinned specific dependency versions more aggressively than `package.json` semver ranges. | Not needed. `bun.lockb` (or `package-lock.json`) provides reproducible installs. |
| `@pierre/diffs` | Diffed text or object structures, returned structured diff output. | Not used anywhere. |
| `xxhashjs` | Pure-JS implementation of the xxHash non-cryptographic hash algorithm. Extremely fast for checksums. | Not used. If a fast non-cryptographic hash is needed (e.g. cache keys), `crypto.createHash('sha1')` or `crypto.subtle.digest` are native alternatives. |

---

## Notification Providers

| Package | What it did | Replaced by |
|---|---|---|
| `@novu/node` | Novu's Node.js SDK — triggered notification workflows (email, SMS, push, in-app) via the Novu API. The old `notificationService.ts` was built around it. | `@knocklabs/node` ✅ — Knock's Node.js SDK. Cleaner developer API, better suited for product notifications (in-app feeds, email digests, multi-channel). A new `NotificationService` Effect layer will replace the old Novu code in Phase 7. |

---

## devDependencies

| Package | What it did | Replaced by |
|---|---|---|
| `swagger-autogen` | Auto-generated a Swagger 2.0 JSON spec by scanning Express route files and JSDoc comments. | `@fastify/swagger` ✅ — generates OpenAPI 3.x spec from Fastify route schemas at runtime. No scanning needed; the spec is derived directly from the route `schema` object. |
| `swagger-jsdoc` | Merged JSDoc `@swagger` / `@openapi` annotations into an OpenAPI spec. Required comments in source files. | `@fastify/swagger` ✅ — spec is co-located with the route definition as a `schema` property. |
| `swagger-model-validator` | Validated that request/response objects conformed to their Swagger 2.0 model definitions at runtime. | `@fastify/response-validation` ✅ (Section 5, keep conditionally in dev) + Effect Schema's `decodeUnknownResult` for request validation. |
| `swagger-ui-express` | Served the Swagger UI HTML/assets as an Express middleware endpoint. | `@fastify/swagger-ui` ✅ — already wired; serves the Redoc/Swagger UI at `/docs`. |
| `lefthook` | Git hook runner — alternative to Husky. Defined hooks in `lefthook.yml`. | `husky` ✅ — already configured. Two git hook managers conflict on hook execution. |
| `globals` | Provided `globals.browser`, `globals.node`, etc. for ESLint configuration (specifying which global variables exist in each environment). | Not needed with `oxlint`. Oxlint has its own environment inference and does not use ESLint-style `globals` config. |
