# JS to TypeScript + Effect.ts Migration Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate ScaleForge-v2 from JavaScript/Express to TypeScript/Fastify with Effect.ts as the coordination kernel. This is a v2 with product changes (new features TBD), not just a refactor.

**Architecture:** Effect-Native Hexagonal. Fastify at the HTTP edge (routing, plugins, OpenAPI, serialization). Effect as the coordination runtime (services, layers, typed errors, resource management, concurrency, DI). One ManagedRuntime shared across all requests, registered as a Fastify decorator via `fastify-plugin`. All business logic lives in Effect workflows, never in Fastify handlers. Dual databases (MongoDB + PostgreSQL) wrapped as Effect services with `acquireRelease`.

**Tech Stack:** TypeScript 6.x, Bun, Fastify 5.x, Effect v4 (beta), Drizzle ORM, Mongoose, ioredis, amqp-connection-manager, Pino, OpenFGA, Elasticsearch, PASETO (paseto-ts), Arctic (OAuth)

> **Effect v4 Note:** This plan targets Effect v4 (beta). Key v4 changes applied throughout: `Context.Service` replaces `Effect.Service`; `Context.Reference` replaces `FiberRef`; `@effect/schema` and `@effect/platform` merged into core `effect` package (all imports from `"effect"`); Schema renames (`annotations` → `annotate`, `compose` → `decodeTo`, `asSchema` → `revealCodec`, `encodedSchema` → `toEncoded`, `typeSchema` → `toType`); `Scope.extend` → `Scope.provide`; unstable modules under `effect/unstable/*`. `ManagedRuntime` still exists. `.Default` layer naming TBD (may become `.layer` in final v4 — verify on release).

---

## Architecture Overview

### Effect IS the Hexagonal Architecture

No separate `ports/` or `adapters/` directories. Effect's type system provides the abstractions:

| Hexagonal Concept | Effect Equivalent |
|---|---|
| Port (abstraction) | `Context.Service` class declaration (v4) |
| Adapter (implementation) | `Layer` that provides the service |
| DI Container | `Layer.mergeAll` + `ManagedRuntime` |
| Swapping implementations | Provide different `Layer` (test vs prod) |

### Design Patterns Applied

| Pattern (from design-patterns.md) | Applied As |
|---|---|
| #1 Pure Core, Impure Shell | `*.service.ts` (pure Effect workflows) vs `*.routes.ts` (Fastify shell) |
| #2 Result Values for Expected Failures | Effect typed error channel (`Data.TaggedError`) |
| #3 Small Composable Functions | `helpers/` -- pure TS, no framework deps |
| #6 DI | Effect Services + Layers (automatic, type-safe) |
| #7 Boundary Adapters | `infra/` -- wraps vendors behind Effect Service interfaces |
| #9 Idempotent Command Handlers | RabbitMQ consumers in `workers/` |
| #12 Normalize Once at Boundary | Effect Schema decode at route entry |

### FP Over OOP

- **Classes for:** `Context.Service` tags (nominal types), `Context.Reference` (request context), Mongoose models, `Data.TaggedError`, Fastify declaration merging
- **Functions for:** Everything else -- validators, transforms, helpers, pipeline stages, workflow methods

The Effect Service class is just a tag. The actual logic is `Effect.gen` generators -- pure FP.

### Folder Structure (Target State)

```
src/
├── core/                              # Shared domain (depends on Effect only)
│   ├── errors/
│   │   ├── commonErrors.ts            # NotFoundError, ValidationError, etc.
│   │   ├── authErrors.ts              # UserNotFoundError, InvalidCredentialsError, etc.
│   │   ├── infraErrors.ts             # MongoConnectionError, RedisCommandError, etc.
│   │   └── httpErrors.ts              # toHttpError() mapping
│   ├── schemas/
│   │   └── commonSchemas.ts           # Email, UUID, PaginationParams, ApiResponse
│   ├── types/
│   │   └── branded.ts                 # UserId, Email, AccessToken branded types
│   └── config/
│       └── configService.ts           # Typed config from env (Effect Service)
├── infra/                             # Boundary adapters (wraps vendors)
│   ├── mongo/
│   │   └── mongoService.ts            # acquireRelease lifecycle
│   ├── postgres/
│   │   └── postgresService.ts         # Drizzle/Neon wrapper
│   ├── redis/
│   │   └── redisService.ts            # ioredis with typed commands
│   ├── rabbitmq/
│   │   └── rabbitmqService.ts         # amqp-connection-manager
│   ├── email/
│   │   └── emailService.ts            # Resend wrapper
│   ├── openfga/
│   │   └── openfgaService.ts          # Fine-grained authorization
│   └── elasticsearch/
│       └── elasticsearchService.ts    # Search backend
├── features/                          # Vertical slices
│   ├── health/
│   │   ├── healthService.ts           # Effect workflow
│   │   ├── healthRoutes.ts            # Fastify plugin
│   │   └── healthSchema.ts            # Effect Schema
│   ├── auth/
│   │   ├── authService.ts             # Effect workflow (orchestration)
│   │   ├── authRepository.ts          # Data access (Effect-wrapped Mongoose)
│   │   ├── authRoutes.ts              # Fastify plugin
│   │   ├── authSchema.ts              # Effect Schema (replaces Joi)
│   │   ├── tokenService.ts            # PASETO token management (access/refresh/impersonation)
│   │   ├── authMiddleware.ts          # Fastify preHandler hook
│   │   └── userModel.ts              # Mongoose model (colocated)
│   ├── audit/
│   ├── storage/
│   ├── gemini/
│   ├── payments/
│   ├── notifications/
│   └── search/
├── runtime/                           # Effect + Fastify bridge
│   ├── appLayer.ts                    # Layer composition
│   ├── appRuntime.ts                  # ManagedRuntime.make
│   └── fastifyBridge.ts              # effectRuntimePlugin (fp) + effectHandler
├── helpers/                           # Pure utility functions (no Effect, no Fastify)
│   ├── crypto.ts                      # argon2, PASETO, OTP
│   ├── phone.ts                       # Phone number parsing
│   └── format.ts                      # Formatting helpers
├── db/                                # Drizzle schemas + migrations
│   ├── schema/
│   │   ├── userSchema.ts
│   │   ├── paymentSchema.ts
│   │   └── auditSchema.ts
│   ├── migrations/
│   └── seeders/
├── workers/                           # Separate process entry points
│   ├── workerMain.ts                  # Worker entry point
│   ├── workerRuntime.ts               # Worker-specific Layer/Runtime
│   └── consumers/
│       └── auditConsumer.ts           # RabbitMQ consumer
├── app.ts                             # Fastify app builder
└── main.ts                            # Entry point
```

```
tests/
├── unit/
│   ├── health/
│   │   └── healthService.test.ts
│   ├── auth/
│   │   ├── authService.test.ts
│   │   └── tokenService.test.ts
│   └── helpers/
│       └── crypto.test.ts
├── integration/
│   ├── auth/
│   │   └── authRepository.test.ts
│   └── infra/
│       └── redisService.test.ts
└── e2e/
    ├── health.e2e.test.ts
    └── auth.e2e.test.ts
```

### Dependency Rules

```
main.ts / app.ts
    ↓ imports
runtime/          (composes everything)
    ↓ imports
features/         (business logic + routes)
    ↓ imports
infra/            (wraps external systems)
    ↓ imports
core/             (pure domain: types, errors, schemas, config)
    ↑ imports
helpers/          (pure functions, no deps)
```

- `core/` imports from: Effect only. Never Fastify, Mongoose, or vendor SDKs.
- `infra/` imports from: `core/` + vendor SDKs. Never `features/`.
- `features/` imports from: `core/`, `infra/` (via Effect tags), `helpers/`. Never other features.
- `runtime/` imports from: all layers (to compose them).
- `helpers/` imports from: nothing (pure TS + node stdlib).
- `workers/` imports from: `core/`, `infra/`, `features/` (Layer definitions only).

### Key Conventions

- **File naming:** camelCase (`authService.ts`, `configService.ts`)
- **Imports:** Direct, no barrel exports (`import { AuthService } from './auth/authService.ts'`)
- **API versioning:** URL prefix `/api/v1/`
- **Errors:** All centralized in `core/errors/`, grouped by domain area
- **Validation:** Effect Schema inside `effectHandler`, at route entry
- **Request context:** `Context.Reference` (v4) for userId, correlationId, IP — set via `Effect.provideService`, read by yielding directly
- **Logging:** Pino (Fastify-native) + Effect.log unified via Pino
- **Testing:** TDD test-first, tests in `tests/` directory

---

## Key Architectural Decisions

1. **No `asyncHandler`** -- Effect handles all error propagation via typed error channel
2. **No `req`/`next` in services** -- Services are pure Effect workflows, framework-agnostic
3. **No mutable module-level state** -- All connections managed via Effect Layers and `acquireRelease`
4. **No `throw`** -- All errors are `Data.TaggedError` in the Effect error channel
5. **One `ManagedRuntime`** -- Created at startup, injected into Fastify via `fastify-plugin` decorator
6. **Effect Schema everywhere** -- Replaces Joi for validation with compile-time type inference
7. **Pino** -- Replaces Winston (Fastify uses Pino natively)
8. **One `effectHandler`** -- Central error mapping via `toHttpError`, no `any` types
9. **Context.Reference for request context** (v4) -- userId, correlationId, IP as `Context.Reference` classes; set via `Effect.provideService`, read by yielding directly (replaces `FiberRef` + `Effect.locally`)
10. **Workers as separate processes** -- Own entry point, own runtime, shared Layer definitions

---

## Migration Strategy

**Incremental, module-by-module.** The app stays working at every step. Express runs on `dev:legacy` during transition.

### Phase Overview

| Phase | What | Result |
|-------|------|--------|
| **0** | Foundation | TypeScript strict, deps installed, tsconfig fixed |
| **1** | Core Domain | Errors, schemas, branded types, config service |
| **2** | Infrastructure | All connections as Effect services with `acquireRelease` |
| **3** | Runtime + Bridge | ManagedRuntime, Fastify bridge, app.ts, main.ts |
| **4** | Pilot Module (health) | TDD end-to-end migration of simplest feature |
| **5** | Auth Module | Most complex feature, establishes all patterns |
| **6** | Remaining Modules | Deferred -- pattern established, details TBD |
| **7** | Cleanup | Remove Express, dead JS files, final consolidation |

---

## Phase 0: Foundation

### Task 0.1: Rename All JS Files to TS

**Files:**
- Modify: Every `.js` file under `src/` (88 files)

- [ ] **Step 1: Rename all `.js` files to `.ts` under `src/`**

```bash
find src -name "*.js" -exec bash -c 'mv "$0" "${0%.js}.ts"' {} \;
```

- [ ] **Step 2: Update all import paths from `.js` to `.ts`**

```bash
find src -name "*.ts" -exec sed -i "s/from '\(\..*\)\.js'/from '\1.ts'/g" {} \;
find src -name "*.ts" -exec sed -i 's/from "\(\..*\)\.js"/from "\1.ts"/g' {} \;
```

- [ ] **Step 3: Verify the project still runs**

```bash
bun --hot src/app/index.ts
```

Expected: App starts. Type errors are fine -- we fix incrementally.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: rename all .js files to .ts"
```

### Task 0.2: Install Required Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Effect ecosystem + Fastify + new infra deps**

```bash
bun add effect
bun add fastify @fastify/cors @fastify/helmet @fastify/rate-limit @fastify/cookie @fastify/compress @fastify/swagger @fastify/swagger-ui @fastify/multipart @fastify/sensible fastify-plugin
bun add arctic
bun remove better-auth
bun add -d @effect/language-service
```

Note: In Effect v4, `@effect/schema` and `@effect/platform` are merged into the core `effect` package -- no separate installs needed. Many Fastify packages already in deps. This ensures latest versions. `arctic` replaces `better-auth` for OAuth (authorization URLs + token exchange only). `paseto-ts` already in deps.

- [ ] **Step 2: Commit**

```bash
git add package.json bun.lockb && git commit -m "chore: add Effect ecosystem and Fastify deps"
```

### Task 0.3: Fix tsconfig.json

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Clean up tsconfig**

Fix the empty string on line 54, tighten for pure TS, add Effect plugin:

```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "noEmit": true,
    "allowJs": false,
    "checkJs": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["bun-types"],
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [
      { "name": "@effect/language-service" }
    ]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Key changes: `allowJs: false`, `verbatimModuleSyntax: true` (forces `import type`), path alias `@/*` -> `./src/*`.

- [ ] **Step 2: Commit**

```bash
git add tsconfig.json && git commit -m "chore: tighten tsconfig for pure TypeScript"
```

---

## Phase 1: Core Domain

This phase creates the shared domain layer. `core/` depends only on Effect -- no Fastify, no Mongoose, no vendor SDKs.

### Task 1.1: Branded Types

**Files:**
- Create: `src/core/types/branded.ts`

- [ ] **Step 1: Define domain primitives as branded types**

```typescript
// src/core/types/branded.ts
import { Brand } from "effect"

export type UserId = string & Brand.Brand<"UserId">
export const UserId = Brand.nominal<UserId>()

export type Email = string & Brand.Brand<"Email">
export const Email = Brand.nominal<Email>()

export type AccessToken = string & Brand.Brand<"AccessToken">
export const AccessToken = Brand.nominal<AccessToken>()

export type RefreshToken = string & Brand.Brand<"RefreshToken">
export const RefreshToken = Brand.nominal<RefreshToken>()

export type CorrelationId = string & Brand.Brand<"CorrelationId">
export const CorrelationId = Brand.nominal<CorrelationId>()
```

- [ ] **Step 2: Commit**

```bash
git add src/core/types/ && git commit -m "feat: add branded types for domain primitives"
```

### Task 1.2: Centralized Errors

**Files:**
- Create: `src/core/errors/commonErrors.ts`
- Create: `src/core/errors/authErrors.ts`
- Create: `src/core/errors/infraErrors.ts`
- Create: `src/core/errors/httpErrors.ts`

- [ ] **Step 1: Define shared application errors**

```typescript
// src/core/errors/commonErrors.ts
import { Data } from "effect"

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly resource: string
  readonly identifier?: string
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
}> {}

export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
  readonly reason?: string
}> {}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly reason?: string
}> {}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly resource: string
  readonly identifier: string
}> {}

export class ExternalServiceError extends Data.TaggedError("ExternalServiceError")<{
  readonly service: string
  readonly cause: unknown
}> {}
```

- [ ] **Step 2: Define auth-domain errors**

```typescript
// src/core/errors/authErrors.ts
import { Data } from "effect"

export class UserNotFoundError extends Data.TaggedError("UserNotFoundError")<{
  readonly identifier: string
}> {}

export class UserAlreadyExistsError extends Data.TaggedError("UserAlreadyExistsError")<{
  readonly email: string
}> {}

export class InvalidCredentialsError extends Data.TaggedError("InvalidCredentialsError")<{}> {}

export class AccountNotConfirmedError extends Data.TaggedError("AccountNotConfirmedError")<{
  readonly email: string
}> {}

export class AccountAlreadyConfirmedError extends Data.TaggedError("AccountAlreadyConfirmedError")<{
  readonly email: string
}> {}

export class InvalidConfirmationCodeError extends Data.TaggedError("InvalidConfirmationCodeError")<{}> {}

export class InvalidPhoneNumberError extends Data.TaggedError("InvalidPhoneNumberError")<{
  readonly phoneNumber: string
}> {}

export class InvalidTimezoneError extends Data.TaggedError("InvalidTimezoneError")<{
  readonly isoCode: string
}> {}

export class PasswordResetExpiredError extends Data.TaggedError("PasswordResetExpiredError")<{}> {}

export class PasswordSameAsOldError extends Data.TaggedError("PasswordSameAsOldError")<{}> {}

export class InvalidOldPasswordError extends Data.TaggedError("InvalidOldPasswordError")<{}> {}

export class InvalidTokenError extends Data.TaggedError("InvalidTokenError")<{
  readonly reason: string
}> {}

export class InvalidOAuthCredentialsError extends Data.TaggedError("InvalidOAuthCredentialsError")<{
  readonly provider: string
}> {}
```

- [ ] **Step 3: Define infrastructure errors**

```typescript
// src/core/errors/infraErrors.ts
import { Data } from "effect"

export class MongoConnectionError extends Data.TaggedError("MongoConnectionError")<{
  readonly cause: unknown
}> {}

export class PostgresConnectionError extends Data.TaggedError("PostgresConnectionError")<{
  readonly cause: unknown
}> {}

export class PostgresQueryError extends Data.TaggedError("PostgresQueryError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export class RedisConnectionError extends Data.TaggedError("RedisConnectionError")<{
  readonly cause: unknown
}> {}

export class RedisCommandError extends Data.TaggedError("RedisCommandError")<{
  readonly command: string
  readonly cause: unknown
}> {}

export class RabbitMQConnectionError extends Data.TaggedError("RabbitMQConnectionError")<{
  readonly cause: unknown
}> {}

export class RabbitMQPublishError extends Data.TaggedError("RabbitMQPublishError")<{
  readonly exchange: string
  readonly routingKey: string
  readonly cause: unknown
}> {}

export class EmailSendError extends Data.TaggedError("EmailSendError")<{
  readonly to: readonly string[]
  readonly subject: string
  readonly cause: unknown
}> {}

export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

export class HealthCheckError extends Data.TaggedError("HealthCheckError")<{
  readonly component: string
  readonly cause: unknown
}> {}
```

- [ ] **Step 4: Create HTTP error mapping**

```typescript
// src/core/errors/httpErrors.ts
import { Match } from "effect"
import type {
  NotFoundError, ValidationError, UnauthorizedError,
  ForbiddenError, ConflictError, ExternalServiceError
} from "./commonErrors.ts"
import type {
  UserNotFoundError, UserAlreadyExistsError, InvalidCredentialsError,
  AccountNotConfirmedError, AccountAlreadyConfirmedError,
  InvalidConfirmationCodeError, InvalidPhoneNumberError,
  InvalidTimezoneError, PasswordResetExpiredError,
  PasswordSameAsOldError, InvalidOldPasswordError,
  InvalidTokenError, InvalidOAuthCredentialsError
} from "./authErrors.ts"

export interface HttpErrorResponse {
  readonly success: false
  readonly statusCode: number
  readonly message: string
  readonly data: null
}

// Union of all errors that can be mapped to HTTP responses
export type AppError =
  | NotFoundError
  | ValidationError
  | UnauthorizedError
  | ForbiddenError
  | ConflictError
  | ExternalServiceError
  | UserNotFoundError
  | UserAlreadyExistsError
  | InvalidCredentialsError
  | AccountNotConfirmedError
  | AccountAlreadyConfirmedError
  | InvalidConfirmationCodeError
  | InvalidPhoneNumberError
  | InvalidTimezoneError
  | PasswordResetExpiredError
  | PasswordSameAsOldError
  | InvalidOldPasswordError
  | InvalidTokenError
  | InvalidOAuthCredentialsError

const httpError = (statusCode: number, message: string): HttpErrorResponse => ({
  success: false,
  statusCode,
  message,
  data: null
})

export const toHttpError = (error: AppError): HttpErrorResponse =>
  Match.value(error).pipe(
    // Common errors
    Match.tag("NotFoundError", (e) =>
      httpError(404, `${e.resource} not found${e.identifier ? `: ${e.identifier}` : ""}`)
    ),
    Match.tag("ValidationError", (e) =>
      httpError(400, `Validation failed: ${e.field} - ${e.message}`)
    ),
    Match.tag("UnauthorizedError", (e) =>
      httpError(401, e.reason ?? "Unauthorized")
    ),
    Match.tag("ForbiddenError", (e) =>
      httpError(403, e.reason ?? "Forbidden")
    ),
    Match.tag("ConflictError", (e) =>
      httpError(409, `${e.resource} already exists: ${e.identifier}`)
    ),
    Match.tag("ExternalServiceError", (e) =>
      httpError(502, `External service error: ${e.service}`)
    ),
    // Auth errors
    Match.tag("UserNotFoundError", (e) =>
      httpError(404, `User not found: ${e.identifier}`)
    ),
    Match.tag("UserAlreadyExistsError", (e) =>
      httpError(409, `User already exists: ${e.email}`)
    ),
    Match.tag("InvalidCredentialsError", () =>
      httpError(401, "Invalid credentials")
    ),
    Match.tag("AccountNotConfirmedError", (e) =>
      httpError(403, `Account not confirmed: ${e.email}`)
    ),
    Match.tag("AccountAlreadyConfirmedError", (e) =>
      httpError(409, `Account already confirmed: ${e.email}`)
    ),
    Match.tag("InvalidConfirmationCodeError", () =>
      httpError(400, "Invalid confirmation code")
    ),
    Match.tag("InvalidPhoneNumberError", (e) =>
      httpError(400, `Invalid phone number: ${e.phoneNumber}`)
    ),
    Match.tag("InvalidTimezoneError", (e) =>
      httpError(400, `Invalid timezone for ISO code: ${e.isoCode}`)
    ),
    Match.tag("PasswordResetExpiredError", () =>
      httpError(410, "Password reset link has expired")
    ),
    Match.tag("PasswordSameAsOldError", () =>
      httpError(400, "New password must be different from old password")
    ),
    Match.tag("InvalidOldPasswordError", () =>
      httpError(401, "Invalid old password")
    ),
    Match.tag("InvalidTokenError", (e) =>
      httpError(401, `Invalid token: ${e.reason}`)
    ),
    Match.tag("InvalidOAuthCredentialsError", (e) =>
      httpError(401, `Invalid OAuth credentials: ${e.provider}`)
    ),
    Match.exhaustive
  )
```

- [ ] **Step 5: Commit**

```bash
git add src/core/errors/ && git commit -m "feat: add centralized error hierarchy and HTTP mapping"
```

### Task 1.3: Common Schemas

**Files:**
- Create: `src/core/schemas/commonSchemas.ts`

- [ ] **Step 1: Define shared Effect Schemas**

```typescript
// src/core/schemas/commonSchemas.ts
import { Schema } from "effect"

// Standard API response envelope
export class ApiResponse extends Schema.Class<ApiResponse>("ApiResponse")({
  success: Schema.Boolean,
  statusCode: Schema.Number,
  message: Schema.String,
  data: Schema.Unknown
}) {}

// Pagination
export class PaginationParams extends Schema.Class<PaginationParams>("PaginationParams")({
  page: Schema.optionalWith(Schema.NumberFromString, { default: () => 1 }),
  limit: Schema.optionalWith(Schema.NumberFromString, { default: () => 20 })
}) {}

// Common field schemas
export const EmailSchema = Schema.String.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: () => "Invalid email format"
  })
)

export const PasswordSchema = Schema.String.pipe(
  Schema.minLength(8, { message: () => "Password must be at least 8 characters" })
)

export const UUIDSchema = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
)
```

- [ ] **Step 2: Commit**

```bash
git add src/core/schemas/ && git commit -m "feat: add common Effect Schemas"
```

### Task 1.4: ConfigService

**Files:**
- Create: `src/core/config/configService.ts`

- [ ] **Step 1: Create typed config service**

```typescript
// src/core/config/configService.ts
import { Effect, Config, Context, Redacted } from "effect"

export class AppConfig extends Context.Service<AppConfig>()("AppConfig", {
  effect: Effect.gen(function* () {
    const port = yield* Config.integer("PORT").pipe(Config.withDefault(3000))
    const nodeEnv = yield* Config.string("NODE_ENV").pipe(Config.withDefault("development"))
    const mongoUri = yield* Config.string("DATABASE")
    const postgresUrl = yield* Config.string("POSTGRES_DATABASE_URL")
    const redisHost = yield* Config.string("REDIS_HOST")
    const redisPort = yield* Config.integer("REDIS_PORT").pipe(Config.withDefault(6379))
    const redisUsername = yield* Config.string("REDIS_USERNAME").pipe(Config.withDefault(""))
    const redisPassword = yield* Config.redacted("REDIS_PASSWORD")
    const accessTokenSecret = yield* Config.redacted("ACCESS_TOKEN_SECRET")
    const refreshTokenSecret = yield* Config.redacted("REFRESH_TOKEN_SECRET")
    const frontendUrl = yield* Config.string("FRONTEND_URL")
    const serverUrl = yield* Config.string("SERVER_URL")
    const rabbitmqUrl = yield* Config.string("RABBITMQ_URL").pipe(Config.withDefault("amqp://localhost"))
    const serverId = yield* Config.string("SERVER_ID").pipe(Config.withDefault("unknown"))
    const resendApiKey = yield* Config.redacted("RESEND_API_KEY").pipe(
      Config.withDefault(Redacted.make(""))
    )

    return {
      port,
      nodeEnv,
      isProduction: nodeEnv === "production",
      isDevelopment: nodeEnv === "development",
      mongo: { uri: mongoUri },
      postgres: { url: postgresUrl },
      redis: {
        host: redisHost,
        port: redisPort,
        username: redisUsername,
        password: redisPassword
      },
      auth: {
        accessTokenSecret,
        refreshTokenSecret
      },
      urls: { frontend: frontendUrl, server: serverUrl },
      rabbitmq: { url: rabbitmqUrl },
      serverId,
      email: { resendApiKey }
    } as const
  })
}) {}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/config/ && git commit -m "feat: add typed ConfigService with Effect"
```

---

## Phase 2: Infrastructure Layer

This phase wraps all external connections in Effect services using `acquireRelease` for guaranteed lifecycle management. Each service lives in `infra/` and depends only on `core/`.

### Task 2.1: MongoService

**Files:**
- Create: `src/infra/mongo/mongoService.ts`

- [ ] **Step 1: Create MongoService**

```typescript
// src/infra/mongo/mongoService.ts
import { Effect, Context } from "effect"
import mongoose from "mongoose"
import { AppConfig } from "../../core/config/configService.ts"
import { MongoConnectionError } from "../../core/errors/infraErrors.ts"

export class MongoService extends Context.Service<MongoService>()("MongoService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig

    const connection = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          mongoose.connect(config.mongo.uri, {
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            readPreference: "secondaryPreferred",
            writeConcern: { w: "majority", j: true, wtimeout: 5000 },
            readConcern: { level: "majority" },
            retryReads: true,
            retryWrites: true
          }),
        catch: (error) => new MongoConnectionError({ cause: error })
      }),
      () =>
        Effect.tryPromise({
          try: () => mongoose.disconnect(),
          catch: () => void 0
        }).pipe(Effect.ignoreLogged)
    )

    return {
      connection: connection.connection,
      isConnected: () => mongoose.connection.readyState === 1
    }
  }),
  dependencies: [AppConfig.Default]
}) {}
```

- [ ] **Step 2: Commit**

```bash
git add src/infra/mongo/ && git commit -m "feat: add MongoService with acquireRelease lifecycle"
```

### Task 2.2: PostgresService

**Files:**
- Create: `src/infra/postgres/postgresService.ts`

- [ ] **Step 1: Create PostgresService**

```typescript
// src/infra/postgres/postgresService.ts
import { Effect, Context } from "effect"
import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"
import { AppConfig } from "../../core/config/configService.ts"
import { PostgresConnectionError, PostgresQueryError } from "../../core/errors/infraErrors.ts"

export class PostgresService extends Context.Service<PostgresService>()("PostgresService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig

    const sql = neon(config.postgres.url)
    const db = drizzle(sql, { logger: config.isDevelopment })

    yield* Effect.tryPromise({
      try: () => sql`SELECT 1`,
      catch: (error) => new PostgresConnectionError({ cause: error })
    })

    return {
      db,
      sql,
      query: <T>(queryFn: (db: NeonHttpDatabase) => Promise<T>) =>
        Effect.tryPromise({
          try: () => queryFn(db),
          catch: (error) => new PostgresQueryError({ message: String(error), cause: error })
        })
    }
  }),
  dependencies: [AppConfig.Default]
}) {}
```

- [ ] **Step 2: Commit**

```bash
git add src/infra/postgres/ && git commit -m "feat: add PostgresService with Drizzle/Neon"
```

### Task 2.3: RedisService

**Files:**
- Create: `src/infra/redis/redisService.ts`

- [ ] **Step 1: Create RedisService**

```typescript
// src/infra/redis/redisService.ts
import { Effect, Context, Redacted } from "effect"
import Redis from "ioredis"
import { AppConfig } from "../../core/config/configService.ts"
import { RedisConnectionError, RedisCommandError } from "../../core/errors/infraErrors.ts"

export class RedisService extends Context.Service<RedisService>()("RedisService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig

    const client = yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const redis = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          username: config.redis.username,
          password: Redacted.value(config.redis.password),
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          keepAlive: 120000,
          family: 4,
          db: 0,
          connectTimeout: 120000,
          commandTimeout: 5000,
          enableAutoPipelining: true,
          autoResubscribe: true,
          autoResendUnfulfilledCommands: true
        })
        yield* Effect.tryPromise({
          try: () => redis.connect(),
          catch: (error) => new RedisConnectionError({ cause: error })
        })
        return redis
      }),
      (redis) =>
        Effect.tryPromise({
          try: () => redis.quit(),
          catch: () => void 0
        }).pipe(Effect.ignoreLogged)
    )

    return {
      client,
      get: (key: string) =>
        Effect.tryPromise({
          try: () => client.get(key),
          catch: (error) => new RedisCommandError({ command: "GET", cause: error })
        }),
      set: (key: string, value: string, ttl?: number) =>
        Effect.tryPromise({
          try: () => (ttl ? client.set(key, value, "EX", ttl) : client.set(key, value)),
          catch: (error) => new RedisCommandError({ command: "SET", cause: error })
        }),
      del: (key: string) =>
        Effect.tryPromise({
          try: () => client.del(key),
          catch: (error) => new RedisCommandError({ command: "DEL", cause: error })
        }),
      hget: (key: string, field: string) =>
        Effect.tryPromise({
          try: () => client.hget(key, field),
          catch: (error) => new RedisCommandError({ command: "HGET", cause: error })
        }),
      hset: (key: string, field: string, value: string, ttl?: number) =>
        Effect.gen(function* () {
          yield* Effect.tryPromise({
            try: () => client.hset(key, field, value),
            catch: (error) => new RedisCommandError({ command: "HSET", cause: error })
          })
          if (ttl) {
            yield* Effect.tryPromise({
              try: () => client.expire(key, ttl),
              catch: (error) => new RedisCommandError({ command: "EXPIRE", cause: error })
            })
          }
        }),
      hdel: (key: string, field: string) =>
        Effect.tryPromise({
          try: () => client.hdel(key, field),
          catch: (error) => new RedisCommandError({ command: "HDEL", cause: error })
        }),
      isConnected: () => client.status === "ready"
    }
  }),
  dependencies: [AppConfig.Default]
}) {}
```

- [ ] **Step 2: Commit**

```bash
git add src/infra/redis/ && git commit -m "feat: add RedisService with acquireRelease lifecycle"
```

### Task 2.4: RabbitMQService

**Files:**
- Create: `src/infra/rabbitmq/rabbitmqService.ts`

- [ ] **Step 1: Create RabbitMQService**

```typescript
// src/infra/rabbitmq/rabbitmqService.ts
import { Effect, Context, Schedule } from "effect"
import amqplib, { type Channel } from "amqp-connection-manager"
import { AppConfig } from "../../core/config/configService.ts"
import { RabbitMQConnectionError, RabbitMQPublishError } from "../../core/errors/infraErrors.ts"

export class RabbitMQService extends Context.Service<RabbitMQService>()("RabbitMQService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig

    const { connection, channel } = yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const conn = amqplib.connect([config.rabbitmq.url])
        const ch = conn.createChannel({
          json: true,
          setup: (channel: Channel) =>
            Promise.all([
              channel.assertExchange("main-exchange", "topic", { durable: true }),
              channel.prefetch(10)
            ])
        })

        yield* Effect.tryPromise({
          try: () =>
            new Promise<void>((resolve, reject) => {
              conn.on("connect", () => resolve())
              conn.on("connectFailed", ({ err }) => reject(err))
              setTimeout(() => reject(new Error("RabbitMQ connection timeout")), 30000)
            }),
          catch: (error) => new RabbitMQConnectionError({ cause: error })
        })

        return { connection: conn, channel: ch }
      }),
      ({ connection }) =>
        Effect.tryPromise({
          try: () => connection.close(),
          catch: () => void 0
        }).pipe(Effect.ignoreLogged)
    )

    return {
      publish: (exchange: string, routingKey: string, message: unknown) =>
        Effect.tryPromise({
          try: () => channel.publish(exchange, routingKey, message, { persistent: true }),
          catch: (error) => new RabbitMQPublishError({ exchange, routingKey, cause: error })
        }).pipe(
          Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3))))
        ),
      channel,
      isConnected: () => connection.isConnected()
    }
  }),
  dependencies: [AppConfig.Default]
}) {}
```

- [ ] **Step 2: Commit**

```bash
git add src/infra/rabbitmq/ && git commit -m "feat: add RabbitMQService with acquireRelease lifecycle"
```

### Task 2.5: EmailService

**Files:**
- Create: `src/infra/email/emailService.ts`

- [ ] **Step 1: Create EmailService**

```typescript
// src/infra/email/emailService.ts
import { Effect, Context, Redacted } from "effect"
import { Resend } from "resend"
import { AppConfig } from "../../core/config/configService.ts"
import { EmailSendError } from "../../core/errors/infraErrors.ts"

export class EmailService extends Context.Service<EmailService>()("EmailService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const resend = new Resend(Redacted.value(config.email.resendApiKey))

    return {
      send: (params: {
        readonly to: readonly string[]
        readonly subject: string
        readonly html: string
      }) =>
        Effect.tryPromise({
          try: () =>
            resend.emails.send({
              from: "noreply@yourdomain.com",
              to: [...params.to],
              subject: params.subject,
              html: params.html
            }),
          catch: (error) =>
            new EmailSendError({
              to: params.to,
              subject: params.subject,
              cause: error
            })
        })
    }
  }),
  dependencies: [AppConfig.Default]
}) {}
```

- [ ] **Step 2: Commit**

```bash
git add src/infra/email/ && git commit -m "feat: add EmailService wrapping Resend"
```

---

## Phase 3: Runtime + Fastify Bridge

### Task 3.1: AppLayer Composition

**Files:**
- Create: `src/runtime/appLayer.ts`

- [ ] **Step 1: Compose all infrastructure layers**

```typescript
// src/runtime/appLayer.ts
import { Layer } from "effect"
import { AppConfig } from "../core/config/configService.ts"
import { MongoService } from "../infra/mongo/mongoService.ts"
import { PostgresService } from "../infra/postgres/postgresService.ts"
import { RedisService } from "../infra/redis/redisService.ts"
import { RabbitMQService } from "../infra/rabbitmq/rabbitmqService.ts"
import { EmailService } from "../infra/email/emailService.ts"

export const InfraLayer = Layer.mergeAll(
  MongoService.Default,
  PostgresService.Default,
  RedisService.Default,
  RabbitMQService.Default,
  EmailService.Default
)

// Full application layer (will grow as features are added)
export const AppLayer = InfraLayer
```

- [ ] **Step 2: Commit**

```bash
git add src/runtime/appLayer.ts && git commit -m "feat: compose AppLayer from infrastructure services"
```

### Task 3.2: AppRuntime

**Files:**
- Create: `src/runtime/appRuntime.ts`

- [ ] **Step 1: Create ManagedRuntime**

```typescript
// src/runtime/appRuntime.ts
import { ManagedRuntime } from "effect"
import { AppLayer } from "./appLayer.ts"

export const AppRuntime = ManagedRuntime.make(AppLayer)
```

- [ ] **Step 2: Commit**

```bash
git add src/runtime/appRuntime.ts && git commit -m "feat: add ManagedRuntime"
```

### Task 3.3: Fastify Bridge (The Critical Integration)

**Files:**
- Create: `src/runtime/fastifyBridge.ts`

This is where Fastify and Effect meet. One file, three responsibilities:
1. `effectRuntimePlugin` -- `fastify-plugin` that shares ManagedRuntime as a typed decorator
2. Declaration merging -- types the `effectRuntime` decorator on FastifyInstance
3. `effectHandler` -- bridges Effect workflows into Fastify route handlers with central error mapping

- [ ] **Step 1: Create the Fastify-Effect bridge**

```typescript
// src/runtime/fastifyBridge.ts
import { Effect, Exit, Cause, Context } from "effect"
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import fp from "fastify-plugin"
import { AppRuntime } from "./appRuntime.ts"
import { toHttpError, type AppError } from "../core/errors/httpErrors.ts"

// -- Request context via Context.Reference (v4 -- replaces FiberRef) --
// These are yielded directly to read, set via Effect.provideService
export class RequestId extends Context.Reference<RequestId>()("RequestId", {
  defaultValue: () => ""
}) {}

export class CurrentUserId extends Context.Reference<CurrentUserId>()("CurrentUserId", {
  defaultValue: () => ""
}) {}

export class CurrentUserIp extends Context.Reference<CurrentUserIp>()("CurrentUserIp", {
  defaultValue: () => ""
}) {}

// -- Declaration merging: type the decorator --
declare module "fastify" {
  interface FastifyInstance {
    readonly effectRuntime: typeof AppRuntime
  }
}

// -- Plugin: registers ManagedRuntime as a shared Fastify decorator --
export const effectRuntimePlugin = fp(
  async (app: FastifyInstance) => {
    // Eagerly initialize the runtime (connects all services)
    await AppRuntime.runtime()

    // Decorate so every plugin/route can access it
    app.decorate("effectRuntime", AppRuntime)

    // Teardown: dispose runtime when Fastify closes
    app.addHook("onClose", async () => {
      await AppRuntime.dispose()
    })
  },
  { name: "effect-runtime" }
)

/**
 * Bridge: wraps an Effect workflow as a Fastify handler.
 *
 * - Fastify owns HTTP (request parsing, response sending, cookies).
 * - Effect owns business logic (workflows, errors, DI).
 * - This function is the ONLY runtime boundary.
 *
 * Error handling:
 * - AppError (typed failures): mapped to HTTP via toHttpError()
 * - Defects (unexpected crashes): logged + 500
 * - Request context (correlationId, IP) set via Context.Reference + Effect.provideService (v4)
 */
export const effectHandler = <A>(
  handler: (request: FastifyRequest, reply: FastifyReply) => Effect.Effect<A, AppError, never>
) => {
  return async function routeHandler(
    this: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const runtime = this.effectRuntime

    // Set request-scoped context via Context.Reference (v4)
    const effect = handler(request, reply).pipe(
      Effect.provideService(RequestId, request.id as string),
      Effect.provideService(CurrentUserIp, request.ip)
    )

    const exit = await runtime.runPromiseExit(effect)

    if (Exit.isSuccess(exit)) {
      if (!reply.sent) {
        return reply.send({
          success: true,
          statusCode: reply.statusCode || 200,
          message: "Success",
          data: exit.value
        })
      }
      return
    }

    // Typed failure -- map to HTTP error
    const failure = Cause.failureOption(exit.cause)
    if (failure._tag === "Some") {
      const error = failure.value
      const httpError = toHttpError(error)
      return reply.status(httpError.statusCode).send(httpError)
    }

    // Defect (unexpected crash) -- log and 500
    const defect = Cause.dieOption(exit.cause)
    request.log.error(
      defect._tag === "Some" ? defect.value : exit.cause,
      "Unhandled defect in Effect handler"
    )
    return reply.status(500).send({
      success: false,
      statusCode: 500,
      message: "Internal server error",
      data: null
    })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/runtime/fastifyBridge.ts && git commit -m "feat: add Fastify-Effect bridge with fastify-plugin"
```

### Task 3.4: Fastify App Setup

**Files:**
- Create: `src/app.ts`

- [ ] **Step 1: Create Fastify app builder**

```typescript
// src/app.ts
import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import cookie from "@fastify/cookie"
import compress from "@fastify/compress"
import sensible from "@fastify/sensible"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { effectRuntimePlugin } from "./runtime/fastifyBridge.ts"

export const buildApp = async () => {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug"
    },
    requestTimeout: 30000,
    genReqId: () => crypto.randomUUID()
  })

  // Effect runtime (must be first -- other plugins may depend on it)
  await app.register(effectRuntimePlugin)

  // Sensible defaults (httpErrors, to, etc.)
  await app.register(sensible)

  // Security
  await app.register(helmet)
  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? "*",
    credentials: true
  })

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "15 minutes"
  })

  // Compression
  await app.register(compress, { threshold: 1024 })

  // Cookies
  await app.register(cookie)

  // Swagger/OpenAPI
  await app.register(swagger, {
    openapi: {
      info: { title: "ScaleForge API", version: "2.0.0" }
    }
  })
  await app.register(swaggerUi, { routePrefix: "/api-docs" })

  // Routes (added as features are migrated)
  // await app.register(healthRoutes, { prefix: "/api/v1/health" })

  // Root
  app.get("/", async () => ({
    message: "Welcome to the ScaleForge API v2"
  }))

  return app
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app.ts && git commit -m "feat: add Fastify app setup with plugin registration"
```

### Task 3.5: Entry Point

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: Create entry point**

```typescript
// src/main.ts
import { buildApp } from "./app.ts"

const main = async () => {
  const app = await buildApp()

  const port = Number(process.env.PORT ?? 3000)
  const host = "0.0.0.0"

  await app.listen({ port, host })
  app.log.info(`Server running at http://${host}:${port}`)

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received. Shutting down...`)
    await app.close() // Triggers onClose hook which disposes Effect runtime
    process.exit(0)
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("unhandledRejection", (err) => {
    app.log.error(err, "UNHANDLED REJECTION")
    shutdown("unhandledRejection")
  })
}

main().catch((err) => {
  console.error("Startup failed:", err)
  process.exit(1)
})
```

- [ ] **Step 2: Update package.json scripts**

```jsonc
{
  "scripts": {
    "dev": "bun --hot src/main.ts",
    "dev:legacy": "bun --hot src/app/index.ts",
    "start": "bun run src/main.ts",
    "typecheck": "bunx tsc --noEmit",
    "test": "bun test",
    "test:unit": "bun test tests/unit/",
    "test:e2e": "bun test tests/e2e/"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main.ts package.json && git commit -m "feat: add Fastify entry point with graceful shutdown"
```

---

## Phase 4: Pilot Module -- Health (TDD)

TDD approach: write tests FIRST, then implement until tests pass.

### Task 4.1: Write Health Tests First

**Files:**
- Create: `tests/unit/health/healthService.test.ts`
- Create: `tests/e2e/health.e2e.test.ts`

- [ ] **Step 1: Write unit tests for HealthService**

```typescript
// tests/unit/health/healthService.test.ts
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { HealthService } from "../../../src/features/health/healthService.ts"
import { AppConfig } from "../../../src/core/config/configService.ts"
import { RedisService } from "../../../src/infra/redis/redisService.ts"

// Test layers with mocked services
const TestRedis = Layer.succeed(RedisService, {
  client: {} as never,
  get: () => Effect.succeed(null),
  set: () => Effect.succeed("OK"),
  del: () => Effect.succeed(1),
  hget: () => Effect.succeed(null),
  hset: () => Effect.void,
  hdel: () => Effect.succeed(1),
  isConnected: () => true
})

const TestConfig = Layer.succeed(AppConfig, {
  port: 3000,
  nodeEnv: "test",
  isProduction: false,
  isDevelopment: false,
  mongo: { uri: "mongodb://localhost/test" },
  postgres: { url: "postgres://localhost/test" },
  redis: { host: "localhost", port: 6379, username: "", password: "test" as never },
  auth: { accessTokenSecret: "test" as never, refreshTokenSecret: "test" as never },
  urls: { frontend: "http://localhost:3000", server: "http://localhost:3000" },
  rabbitmq: { url: "amqp://localhost" },
  serverId: "test-server",
  email: { resendApiKey: "test" as never }
})

const TestLayer = Layer.mergeAll(TestRedis, TestConfig)

describe("HealthService", () => {
  test("getSelfInfo returns server identity", async () => {
    const program = Effect.gen(function* () {
      const service = yield* HealthService
      return yield* service.getSelfInfo()
    }).pipe(Effect.provide(HealthService.Default), Effect.provide(TestLayer))

    const result = await Effect.runPromise(program)
    expect(result.server).toBe("test-server")
    expect(result.timestamp).toBeDefined()
    expect(typeof result.timestamp).toBe("string")
  })

  test("getHealth returns all check categories", async () => {
    const program = Effect.gen(function* () {
      const service = yield* HealthService
      return yield* service.getHealth()
    }).pipe(Effect.provide(HealthService.Default), Effect.provide(TestLayer))

    const result = await Effect.runPromise(program)
    expect(result.application.environment).toBe("test")
    expect(result.checks.memory.status).toBe("healthy")
    expect(result.checks.redis.status).toBe("healthy")
    expect(result.system.platform).toBeDefined()
    expect(result.timestamp).toBeDefined()
  })
})
```

- [ ] **Step 2: Write e2e tests using Fastify inject()**

```typescript
// tests/e2e/health.e2e.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { buildApp } from "../../src/app.ts"
import type { FastifyInstance } from "fastify"

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe("Health Routes", () => {
  test("GET /api/v1/health/self returns server info", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health/self"
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.data.server).toBeDefined()
    expect(body.data.timestamp).toBeDefined()
  })

  test("GET /api/v1/health/health returns comprehensive checks", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health/health"
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.data.application).toBeDefined()
    expect(body.data.system).toBeDefined()
    expect(body.data.checks).toBeDefined()
  })
})
```

- [ ] **Step 3: Run tests (they should fail -- TDD red phase)**

```bash
bun test tests/unit/health/ tests/e2e/health.e2e.test.ts
```

Expected: Tests fail because HealthService, healthRoutes don't exist yet.

- [ ] **Step 4: Commit**

```bash
git add tests/ && git commit -m "test: add health tests (TDD red phase)"
```

### Task 4.2: Health Schema

**Files:**
- Create: `src/features/health/healthSchema.ts`

- [ ] **Step 1: Define health response schema**

```typescript
// src/features/health/healthSchema.ts
import { Schema } from "effect"

export const HealthCheckResult = Schema.Struct({
  status: Schema.Literal("healthy", "unhealthy", "warning"),
  responseTime: Schema.optional(Schema.Number),
  details: Schema.optional(Schema.Unknown)
})

export const HealthResponse = Schema.Struct({
  application: Schema.Struct({
    environment: Schema.String,
    uptime: Schema.String,
    memoryUsage: Schema.Struct({
      heapTotal: Schema.String,
      heapUsed: Schema.String
    }),
    pid: Schema.Number,
    version: Schema.String
  }),
  system: Schema.Struct({
    cpuUsage: Schema.Array(Schema.Number),
    totalMemory: Schema.String,
    freeMemory: Schema.String,
    platform: Schema.String,
    arch: Schema.String
  }),
  timestamp: Schema.String,
  checks: Schema.Struct({
    database: HealthCheckResult,
    redis: HealthCheckResult,
    memory: HealthCheckResult,
    disk: HealthCheckResult
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add src/features/health/healthSchema.ts && git commit -m "feat: add health response schemas"
```

### Task 4.3: HealthService (Effect Workflow)

**Files:**
- Create: `src/features/health/healthService.ts`

- [ ] **Step 1: Create HealthService as pure Effect workflow**

```typescript
// src/features/health/healthService.ts
import { Effect, Context } from "effect"
import os from "node:os"
import fs from "node:fs/promises"
import mongoose from "mongoose"
import { RedisService } from "../../infra/redis/redisService.ts"
import { AppConfig } from "../../core/config/configService.ts"
import { HealthCheckError } from "../../core/errors/infraErrors.ts"

const formatBytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`

const checkDatabase = Effect.tryPromise({
  try: async () => {
    const start = Date.now()
    const state = mongoose.connection.readyState
    return {
      status: state === 1 ? ("healthy" as const) : ("unhealthy" as const),
      responseTime: Date.now() - start,
      details: { state: ["disconnected", "connected", "connecting", "disconnecting"][state] }
    }
  },
  catch: (error) => new HealthCheckError({ component: "database", cause: error })
})

const checkRedis = Effect.gen(function* () {
  const redis = yield* RedisService
  const start = Date.now()
  const connected = redis.isConnected()
  return {
    status: connected ? ("healthy" as const) : ("unhealthy" as const),
    responseTime: Date.now() - start,
    details: { connection: connected ? "ready" : "disconnected" }
  }
})

const checkMemory = Effect.sync(() => {
  const mem = process.memoryUsage()
  const totalMB = Math.round(mem.heapTotal / 1024 / 1024)
  const usedMB = Math.round(mem.heapUsed / 1024 / 1024)
  const usagePercent = Math.round((usedMB / totalMB) * 100)
  return {
    status: usagePercent > 90 ? ("warning" as const) : ("healthy" as const),
    details: { totalMB, usedMB, usagePercent }
  }
})

const checkDisk = Effect.tryPromise({
  try: async () => {
    await fs.access("/tmp", fs.constants.W_OK)
    return { status: "healthy" as const, details: { accessible: true } }
  },
  catch: (error) => new HealthCheckError({ component: "disk", cause: error })
})

export class HealthService extends Context.Service<HealthService>()("HealthService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig

    return {
      getSelfInfo: () =>
        Effect.succeed({
          server: config.serverId,
          container: process.env.HOSTNAME ?? "unknown",
          timestamp: new Date().toISOString()
        }),

      getHealth: () =>
        Effect.gen(function* () {
          const [database, redis, memory, disk] = yield* Effect.all(
            [checkDatabase, checkRedis, checkMemory, checkDisk],
            { concurrency: 4 }
          )

          const mem = process.memoryUsage()
          return {
            application: {
              environment: config.nodeEnv,
              uptime: `${process.uptime().toFixed(2)} Seconds`,
              memoryUsage: {
                heapTotal: formatBytes(mem.heapTotal),
                heapUsed: formatBytes(mem.heapUsed)
              },
              pid: process.pid,
              version: process.version
            },
            system: {
              cpuUsage: os.loadavg(),
              totalMemory: formatBytes(os.totalmem()),
              freeMemory: formatBytes(os.freemem()),
              platform: os.platform(),
              arch: os.arch()
            },
            timestamp: new Date().toISOString(),
            checks: { database, redis, memory, disk }
          }
        })
    }
  }),
  dependencies: [AppConfig.Default, RedisService.Default]
}) {}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/health/healthService.ts && git commit -m "feat: add HealthService as Effect workflow"
```

### Task 4.4: Health Routes (Fastify Plugin)

**Files:**
- Create: `src/features/health/healthRoutes.ts`

- [ ] **Step 1: Create Fastify health routes using effectHandler**

```typescript
// src/features/health/healthRoutes.ts
import type { FastifyInstance } from "fastify"
import { Effect } from "effect"
import { effectHandler } from "../../runtime/fastifyBridge.ts"
import { HealthService } from "./healthService.ts"

export const healthRoutes = async (app: FastifyInstance) => {
  app.get(
    "/self",
    {
      schema: {
        description: "Get server identification",
        tags: ["Health"],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              statusCode: { type: "integer" },
              message: { type: "string" },
              data: {
                type: "object",
                properties: {
                  server: { type: "string" },
                  container: { type: "string" },
                  timestamp: { type: "string", format: "date-time" }
                }
              }
            }
          }
        }
      }
    },
    effectHandler(() =>
      Effect.gen(function* () {
        const service = yield* HealthService
        return yield* service.getSelfInfo()
      })
    )
  )

  app.get(
    "/health",
    {
      schema: {
        description: "Comprehensive health check",
        tags: ["Health"],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              statusCode: { type: "integer" },
              message: { type: "string" },
              data: { type: "object" }
            }
          }
        }
      }
    },
    effectHandler(() =>
      Effect.gen(function* () {
        const service = yield* HealthService
        return yield* service.getHealth()
      })
    )
  )
}
```

- [ ] **Step 2: Register health routes in app.ts**

Add to `src/app.ts`:

```typescript
import { healthRoutes } from "./features/health/healthRoutes.ts"
// In buildApp(), after swagger registration:
await app.register(healthRoutes, { prefix: "/api/v1/health" })
```

- [ ] **Step 3: Update AppLayer with HealthService**

Add to `src/runtime/appLayer.ts`:

```typescript
import { HealthService } from "../features/health/healthService.ts"

export const FeatureLayer = Layer.mergeAll(
  HealthService.Default
)

export const AppLayer = Layer.mergeAll(InfraLayer, FeatureLayer)
```

- [ ] **Step 4: Run tests (TDD green phase)**

```bash
bun test tests/unit/health/
bun test tests/e2e/health.e2e.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Manual verification**

```bash
bun run dev
# GET http://localhost:3000/api/v1/health/self
# GET http://localhost:3000/api/v1/health/health
```

- [ ] **Step 6: Commit**

```bash
git add src/features/health/ src/app.ts src/runtime/appLayer.ts && git commit -m "feat: health module migrated end-to-end (TDD green)"
```

---

## Phase 5: Auth Module

The most critical module. Establishes patterns for: validation, repository, service with typed errors, Redis caching, PASETO tokens (access/refresh/impersonation), email, cookies, OAuth (via Arctic).

**Auth Architecture Decision:** Full custom PASETO auth as Effect services. No better-auth. Arctic for OAuth flows only (authorization URLs + token exchange). PASETO access tokens with embedded role+permissions for stateless RBAC. Refresh tokens tied to Redis sessions. Impersonation tokens (short-lived, no session). argon2 password hashing with timing-attack-safe dummy hash. WebSocket auth with per-user connection limits and Redis presence tracking.

### Task 5.1: Auth Schema (Effect Schema replaces Joi)

**Files:**
- Create: `src/features/auth/authSchema.ts`

- [ ] **Step 1: Define auth request/response schemas**

```typescript
// src/features/auth/authSchema.ts
import { Schema } from "effect"

export const RegisterInput = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(2)),
  emailAddress: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: () => "Invalid email" })
  ),
  password: Schema.String.pipe(Schema.minLength(8)),
  phoneNumber: Schema.String,
  consent: Schema.Boolean
})
export type RegisterInput = typeof RegisterInput.Type

export const LoginInput = Schema.Struct({
  emailAddress: Schema.String,
  password: Schema.String
})
export type LoginInput = typeof LoginInput.Type

export const ConfirmAccountInput = Schema.Struct({
  emailAddress: Schema.String,
  code: Schema.String.pipe(Schema.length(6))
})
export type ConfirmAccountInput = typeof ConfirmAccountInput.Type

export const ForgotPasswordInput = Schema.Struct({
  emailAddress: Schema.String
})
export type ForgotPasswordInput = typeof ForgotPasswordInput.Type

export const ResetPasswordInput = Schema.Struct({
  token: Schema.String,
  newPassword: Schema.String.pipe(Schema.minLength(8))
})
export type ResetPasswordInput = typeof ResetPasswordInput.Type

export const ChangePasswordInput = Schema.Struct({
  oldPassword: Schema.String,
  newPassword: Schema.String.pipe(Schema.minLength(8))
})
export type ChangePasswordInput = typeof ChangePasswordInput.Type

export const GoogleOAuthInput = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  picture: Schema.optional(Schema.String)
})
export type GoogleOAuthInput = typeof GoogleOAuthInput.Type
```

- [ ] **Step 2: Commit**

```bash
git add src/features/auth/authSchema.ts && git commit -m "feat: add auth schemas with Effect Schema (replaces Joi)"
```

### Task 5.2: Auth Repository (Effect-wrapped Data Access)

**Files:**
- Create: `src/features/auth/authRepository.ts`

- [ ] **Step 1: Create Effect-wrapped auth repository**

No `asyncHandler`, no `req`/`next`. Pure data access wrapped in Effect.

```typescript
// src/features/auth/authRepository.ts
import { Effect } from "effect"
import UserModel from "./userModel.ts"
import { RepositoryError } from "../../core/errors/infraErrors.ts"

export const findUserByEmail = (email: string) =>
  Effect.tryPromise({
    try: () => UserModel.findOne({ emailAddress: email }),
    catch: (error) => new RepositoryError({ operation: "findUserByEmail", cause: error })
  })

export const findUserByEmailWithPassword = (email: string) =>
  Effect.tryPromise({
    try: () => UserModel.findOne({ emailAddress: email }).select("+password"),
    catch: (error) => new RepositoryError({ operation: "findUserByEmailWithPassword", cause: error })
  })

export const findUserById = (id: string, select?: string) =>
  Effect.tryPromise({
    try: () => (select ? UserModel.findById(id).select(select) : UserModel.findById(id)),
    catch: (error) => new RepositoryError({ operation: "findUserById", cause: error })
  })

export const createUser = (payload: Record<string, unknown>) =>
  Effect.tryPromise({
    try: () => UserModel.create(payload),
    catch: (error) => new RepositoryError({ operation: "createUser", cause: error })
  })

export const findByResetToken = (token: string) =>
  Effect.tryPromise({
    try: () => UserModel.findOne({ "passwordReset.token": token }),
    catch: (error) => new RepositoryError({ operation: "findByResetToken", cause: error })
  })

export const updateLastLogin = (userId: string) =>
  Effect.tryPromise({
    try: () =>
      UserModel.findByIdAndUpdate(userId, { lastLoginAt: new Date() }, { new: true }),
    catch: (error) => new RepositoryError({ operation: "updateLastLogin", cause: error })
  })
```

- [ ] **Step 2: Commit**

```bash
git add src/features/auth/authRepository.ts && git commit -m "feat: add Effect-wrapped auth repository"
```

### Task 5.3: AuthService (Effect Workflow)

**Files:**
- Create: `src/features/auth/authService.ts`

No `req`, no `next`, no `asyncHandler`. Pure Effect workflows with typed errors. Methods named as workflows (verbs).

- [ ] **Step 1: Create AuthService**

```typescript
// src/features/auth/authService.ts
import { Effect, Context, Redacted } from "effect"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc.js"
import { RedisService } from "../../infra/redis/redisService.ts"
import { EmailService } from "../../infra/email/emailService.ts"
import { AppConfig } from "../../core/config/configService.ts"
import * as Repo from "./authRepository.ts"
import {
  UserNotFoundError, UserAlreadyExistsError, InvalidCredentialsError,
  AccountNotConfirmedError, InvalidPhoneNumberError, InvalidTimezoneError
} from "../../core/errors/authErrors.ts"
import type { RegisterInput, LoginInput } from "./authSchema.ts"
import {
  hashPassword, comparePassword, generatePasetoToken,
  generateRandomId, generateOtp,
  extractInfoPhoneNumber, countryTimezone, getDomainFromUrl
} from "../../helpers/crypto.ts"

dayjs.extend(utc)

export class AuthService extends Context.Service<AuthService>()("AuthService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const redis = yield* RedisService
    const email = yield* EmailService

    return {
      registerUser: (input: RegisterInput) =>
        Effect.gen(function* () {
          const { name, emailAddress, password, phoneNumber, consent } = input

          // Validate phone
          const phoneInfo = extractInfoPhoneNumber(`+${phoneNumber}`)
          if (!phoneInfo.countryCode || !phoneInfo.isoCode) {
            return yield* new InvalidPhoneNumberError({ phoneNumber })
          }

          const timezone = countryTimezone(phoneInfo.isoCode)
          if (!timezone || timezone.length === 0) {
            return yield* new InvalidTimezoneError({ isoCode: phoneInfo.isoCode })
          }

          // Check cache then DB
          const cached = yield* redis.hget("user", `email:${emailAddress}`)
          if (cached) {
            return yield* new UserAlreadyExistsError({ email: emailAddress })
          }

          const existing = yield* Repo.findUserByEmail(emailAddress)
          if (existing) {
            yield* redis.hset("user", `email:${emailAddress}`, JSON.stringify(existing.toObject()), 1800)
            return yield* new UserAlreadyExistsError({ email: emailAddress })
          }

          // Create user
          const encryptedPassword = yield* Effect.promise(() => hashPassword(password))
          const token = generateRandomId()
          const code = generateOtp(6)

          const user = yield* Repo.createUser({
            name,
            emailAddress,
            phoneNumber: {
              countryCode: phoneInfo.countryCode,
              isoCode: phoneInfo.isoCode,
              internationalNumber: phoneInfo.internationalNumber
            },
            accountConfirmation: { status: false, token, code, timestamp: null },
            passwordReset: { token: null, expiry: null, lastResetAt: null },
            lastLoginAt: null,
            role: "USER",
            timezone: timezone[0].name,
            password: encryptedPassword,
            consent
          })

          // Send confirmation email (fire-and-forget)
          const confirmationUrl = `${config.urls.frontend}/confirmation/${emailAddress}?code=${code}`
          yield* email
            .send({
              to: [emailAddress],
              subject: "Confirm Your Account",
              html: `<p>Welcome ${name}!</p><p>Your confirmation code: <strong>${code}</strong></p><p><a href="${confirmationUrl}">Confirm Account</a></p>`
            })
            .pipe(Effect.catchAll(() => Effect.void))

          return user
        }),

      loginUser: (input: LoginInput, userIp: string) =>
        Effect.gen(function* () {
          const { emailAddress, password } = input

          const cachedStr = yield* redis.hget("user", `email:${emailAddress}`)
          let user = cachedStr ? JSON.parse(cachedStr) : null
          if (!user) {
            user = yield* Repo.findUserByEmailWithPassword(emailAddress)
          }
          if (!user) {
            return yield* new UserNotFoundError({ identifier: emailAddress })
          }
          if (!user.accountConfirmation?.status) {
            return yield* new AccountNotConfirmedError({ email: emailAddress })
          }

          const isValid = yield* Effect.promise(() => comparePassword(password, user.password))
          if (!isValid) {
            return yield* new InvalidCredentialsError({})
          }

          const accessToken = generatePasetoToken(
            { userId: user._id, role: user.role, userIp },
            Redacted.value(config.auth.accessTokenSecret),
            3600
          )
          const refreshToken = generatePasetoToken(
            { userId: user._id, role: user.role, userIp },
            Redacted.value(config.auth.refreshTokenSecret),
            604800
          )

          yield* Repo.updateLastLogin(user._id)

          // Cache user (without sensitive fields)
          const userForCache = { ...user }
          delete userForCache.password
          delete userForCache.passwordReset
          yield* redis.hset("user", `email:${emailAddress}`, JSON.stringify(userForCache), 1800)
          yield* redis.hset("user", `id:${user._id}`, JSON.stringify(userForCache), 1800)

          const domain = getDomainFromUrl(config.urls.server)
          const userForResponse = { ...userForCache }
          delete userForResponse.accountConfirmation
          delete userForResponse.consent
          delete userForResponse.createdAt
          delete userForResponse.updatedAt

          return { accessToken, refreshToken, userForResponse, domain }
        }),

      // Additional workflow methods follow the same pattern:
      // confirmAccount, logoutUser, refreshAccessToken,
      // forgotPassword, resetPassword, changePassword,
      // googleOAuthSignup, googleOAuthLogin
      //
      // Each one:
      // 1. Takes typed input (no req/next)
      // 2. Returns Effect<Result, TaggedErrors>
      // 3. Uses yield* for all async operations
      // 4. Uses redis, email, config from closure
    }
  }),
  dependencies: [AppConfig.Default, RedisService.Default, EmailService.Default]
}) {}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/auth/authService.ts && git commit -m "feat: add AuthService as Effect workflow (no Express coupling)"
```

### Task 5.4: Auth Routes (Fastify Plugin)

**Files:**
- Create: `src/features/auth/authRoutes.ts`

- [ ] **Step 1: Create Fastify auth routes**

```typescript
// src/features/auth/authRoutes.ts
import type { FastifyInstance } from "fastify"
import { Effect, Schema } from "effect"
import { effectHandler } from "../../runtime/fastifyBridge.ts"
import { AuthService } from "./authService.ts"
import { RegisterInput, LoginInput, ConfirmAccountInput } from "./authSchema.ts"

export const authRoutes = async (app: FastifyInstance) => {
  app.post(
    "/register",
    effectHandler((request) =>
      Effect.gen(function* () {
        const body = yield* Schema.decodeUnknown(RegisterInput)(request.body)
        const auth = yield* AuthService
        return yield* auth.registerUser(body)
      })
    )
  )

  app.post(
    "/login",
    effectHandler((request, reply) =>
      Effect.gen(function* () {
        const body = yield* Schema.decodeUnknown(LoginInput)(request.body)
        const auth = yield* AuthService
        const result = yield* auth.loginUser(body, request.ip)

        // Fastify owns HTTP concerns (cookies)
        reply.setCookie("accessToken", result.accessToken, {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          maxAge: 3600,
          domain: result.domain,
          path: "/"
        })
        reply.setCookie("refreshToken", result.refreshToken, {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          maxAge: 604800,
          domain: result.domain,
          path: "/"
        })

        return result.userForResponse
      })
    )
  )

  app.post(
    "/confirmation",
    effectHandler((request) =>
      Effect.gen(function* () {
        const body = yield* Schema.decodeUnknown(ConfirmAccountInput)(request.body)
        const auth = yield* AuthService
        return yield* auth.confirmAccount(body)
      })
    )
  )

  // Remaining routes follow the same pattern:
  // POST /logout, POST /refresh-token, POST /forgot-password,
  // POST /reset-password, POST /change-password,
  // POST /google-oauth/signup, POST /google-oauth/login
}
```

- [ ] **Step 2: Register auth routes in app.ts and update AppLayer**

```typescript
// In src/app.ts:
import { authRoutes } from "./features/auth/authRoutes.ts"
await app.register(authRoutes, { prefix: "/api/v1/auth" })

// In src/runtime/appLayer.ts:
import { AuthService } from "../features/auth/authService.ts"
export const FeatureLayer = Layer.mergeAll(
  HealthService.Default,
  AuthService.Default
)
```

- [ ] **Step 3: Run all tests**

```bash
bun test
```

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/ src/app.ts src/runtime/appLayer.ts && git commit -m "feat: auth module migrated with Fastify routes"
```

---

## Phase 6: Remaining Modules (Deferred)

Each module follows the exact pattern established in Phases 4-5:

1. `featureSchema.ts` -- Effect Schema for request/response validation
2. `featureRepository.ts` (if DB access) -- Effect-wrapped data access
3. `featureService.ts` -- Pure Effect workflows with methods named as verbs
4. `featureRoutes.ts` -- Fastify plugin routes using `effectHandler`
5. Add to `appLayer.ts`
6. Write tests first (TDD)

**Modules to migrate:** audit, storage, gemini, payments, notifications, search

**Errors** for these modules will be added to `core/errors/` as needed (e.g., `storageErrors.ts`, `paymentErrors.ts`).

**Specific notes:**
- **Audit** uses PostgreSQL/Drizzle (via `PostgresService`), not Mongoose
- **Search** will use Elasticsearch (via `ElasticsearchService` in `infra/`)
- **Notifications** may use RabbitMQ for async delivery
- **Storage** wraps S3 as an Effect service in `infra/`

Details to be specified when implementation begins.

---

## Phase 7: Cleanup and Consolidation

### Task 7.1: Remove Express

- [ ] **Step 1: Remove Express dependencies**

```bash
bun remove express express-async-handler express-mongo-sanitize express-timeout-handler hpp
```

- [ ] **Step 2: Delete old Express files**

```bash
rm -rf src/app/app.ts src/app/index.ts src/app/middlewares/ src/app/utils/httpError.ts src/app/utils/httpResponse.ts
```

- [ ] **Step 3: Remove all `asyncHandler` imports across codebase**
- [ ] **Step 4: Remove `dev:legacy` from package.json scripts**
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: remove Express and legacy JS files"
```

### Task 7.2: Consolidate Helpers

- [ ] **Step 1: Type-annotate remaining helpers in `src/helpers/`**
- [ ] **Step 2: Delete files replaced by Effect services** (`email.ts` -> EmailService, `redisFunctions.ts` -> RedisService)
- [ ] **Step 3: Commit**

### Task 7.3: Consolidate Logger

- [ ] **Step 1: Remove Winston, use Fastify's built-in Pino + Effect.log**
- [ ] **Step 2: Delete old `logger.ts`**
- [ ] **Step 3: Commit**

### Task 7.4: Final Type Check and Tests

- [ ] **Step 1: Full type check**

```bash
bunx tsc --noEmit
```

- [ ] **Step 2: Run all tests**

```bash
bun test
```

- [ ] **Step 3: Fix any remaining issues**
- [ ] **Step 4: Final commit**

```bash
git add -A && git commit -m "chore: final cleanup, all type errors resolved"
```

---

## Migration Checklist

| Current Pattern | Replaced By | Phase |
|---|---|---|
| `asyncHandler` | Effect error channel | 2-5 |
| `req`/`next` in services | Pure Effect workflows | 4-5 |
| `process.env.*` scattered | `AppConfig` service | 1 |
| Mutable `let db = null` | `acquireRelease` | 2 |
| `Promise.all` for startup | Effect Layer composition | 2 |
| Manual graceful shutdown | `ManagedRuntime.dispose()` via Fastify `onClose` | 3 |
| Joi validation | Effect Schema | 5 |
| JWT tokens | PASETO tokens (paseto-ts) with embedded claims | 5 |
| better-auth | Custom auth + Arctic (OAuth only) | 5 |
| `httpError(next, err, req)` | Tagged errors + `toHttpError` | 1 |
| `httpResponse(req, res, ...)` | `effectHandler` response envelope | 3 |
| Express Router | Fastify plugin routes | 4-5 |
| Winston logger | Pino (Fastify-native) + Effect.log | 7 |
| Express middleware chain | Fastify hooks + plugins | 4-5 |
| `throw new Error()` | `yield* new TaggedError()` | All |
| `Effect.Service` (v3) | `Context.Service` (v4) | All |
| `FiberRef` + `Effect.locally` | `Context.Reference` + `Effect.provideService` (v4) | 3 |
| `@effect/schema` import | `import { Schema } from "effect"` (v4 merge) | 0 |
| `@effect/platform` import | `import { ... } from "effect"` (v4 merge) | 0 |

## Risk Mitigation

1. **Both servers run in parallel** during migration (Express on `dev:legacy`, Fastify on `dev`)
2. **Tests at every step**: No phase is complete until tests pass (TDD)
3. **Incremental commits**: Small, atomic commits so any step can be reverted
4. **Feature flags**: Each module can be toggled between old Express routes and new Fastify routes

## Estimated Effort

| Phase | Estimated Time |
|---|---|
| Phase 0: Foundation | 2-3 hours |
| Phase 1: Core Domain | 3-4 hours |
| Phase 2: Infrastructure | 4-6 hours |
| Phase 3: Runtime + Bridge | 2-3 hours |
| Phase 4: Health Pilot (TDD) | 2-3 hours |
| Phase 5: Auth Module | 6-8 hours |
| Phase 6: Remaining (deferred) | TBD |
| Phase 7: Cleanup | 3-4 hours |
| **Total (through Auth)** | **~22-31 hours** |

---

## v2 Improvement Suggestions (from Graphify Analysis)

These 12 architectural improvements were identified from graph analysis of the v1 codebase (739 nodes, 1141 edges, 48 communities). None are automatically solved by Effect v4 -- they require deliberate architectural work during the relevant phase. Sorted by integration point.

### Phase 2 (Infrastructure) Improvements

| # | Suggestion | Action | Why |
|---|---|---|---|
| 2 | **Split Redis into RedisService + CacheService** | Create `CacheService` (bloom filters, rate limiting, pub/sub) on top of `RedisService` (raw commands) | Single Redis service doing too much in v1 -- 22-community coupling via Logger pattern |
| 3 | **RabbitMQ producer/consumer/DLX abstractions** | `RabbitMQService` exposes `declareQueue`, `declareExchange`, `publish`, `consume`, `setupDLX` -- not just `publish()` | v1 RabbitMQ was fire-and-forget only; v2 needs consumers, dead-letter queues, per-queue config |

### Phase 3 (Runtime + Bridge) Improvements

| # | Suggestion | Action | Why |
|---|---|---|---|
| 1 | **Logger as Effect layer only** | Create `PinoLoggerLayer` via `Logger.replace(Logger.defaultLogger, ...)` -- features use `Effect.log`, never import Pino directly | Logger is the #1 god node (39 edges, bridges 22/48 communities). Effect layer eliminates coupling |
| 6 | **Derive Fastify JSON Schema from Effect Schema** | Use `JSONSchema.make(MySchema)` in route `schema.body`/`schema.response` -- single source of truth | Eliminates dual-schema maintenance (Effect Schema for validation + hand-written JSON Schema for Swagger) |
| 12 | **Fix effectHandler R-channel typing** | Parameterize `effectHandler<A, E extends AppError, R>` so routes can yield services from R | CRITICAL: plan had R typed as `never` but route bodies yield `HealthService`, `AuthService`, etc. |

### Phase 4 (Health) Improvements

| # | Suggestion | Action | Why |
|---|---|---|---|
| 7 | **Graceful degradation tiers** | Health checks return `"critical"` / `"degraded"` / `"graceful"` status instead of binary healthy/unhealthy | Current `HealthCheckError` not in `AppError` union -- health checks should catch and return degraded, not crash |

### Phase 5 (Auth) Improvements

| # | Suggestion | Action | Why |
|---|---|---|---|
| 5 | **zxcvbn for password strength** | Add `zxcvbn` check in `RegisterInput` schema or `authService.registerUser` -- reject passwords below score threshold | Already in deps but unused. Prevents weak passwords beyond just length checks |
| 8 | **Password hash migration bcrypt→argon2** | On login, if hash starts with `$2b$` (bcrypt), re-hash with argon2 and save. Transparent to user | Existing v1 passwords are bcrypt. argon2 is the v2 standard. Migration on login avoids mass reset |
| 11 | **Per-route rate limiting** | Fastify `@fastify/rate-limit` config per route: login 5/min, register 3/min, forgot-password 2/min | Global 100/15min is too loose for auth. Credential stuffing needs per-endpoint throttling |

### Phase 6+ (Deferred) Improvements

| # | Suggestion | Action | Why |
|---|---|---|---|
| 4 | **WebSocket layer** | `@fastify/websocket` + PASETO upgrade auth + Redis presence tracking + per-user connection limits | v1 had WebSocket but no auth, no presence, no connection limits |
| 9 | **Event-driven audit via RabbitMQ** | Auth/admin actions publish to `audit.#` topic exchange. Dedicated `auditConsumer` writes to PostgreSQL | Audit as a cross-cutting concern via events, not direct calls from features |
| 10 | **OpenTelemetry tracing** | `@effect/opentelemetry` + `Effect.withSpan` on service methods. Export to Jaeger/Tempo | v4 has improved OTel support. Distributed tracing across Effect workflows |

### Mapping to Plan Review Issues

The 3 critical and 2 medium issues from plan self-review are addressed:

| Review Issue | Suggestion # | Status |
|---|---|---|
| (1) `effectHandler` R channel typed as `never` | #12 | Addressed in Phase 3 |
| (2) `HealthCheckError` not in `AppError` union | #7 | Addressed in Phase 4 |
| (3) `ParseError` not mapped to `ValidationError` | (inline fix) | Add `ParseError` → `ValidationError` mapping in `effectHandler` |
| (4) `helpers/crypto.ts` missing migration task | (inline fix) | Already in folder structure, add explicit task in Phase 5 |
| (5) `tokenService.ts`, `authMiddleware.ts`, `userModel.ts` missing tasks | (inline fix) | Already in folder structure, add explicit tasks in Phase 5 |

---

## Effect v4 Verification Checklist

Items to verify when Effect v4 reaches stable release (beta APIs may shift):

- [ ] Confirm `Context.Service` is the final API name (not `Effect.Service`)
- [ ] Confirm `Context.Reference` is the final API name and pattern (class-based with `defaultValue`)
- [ ] Confirm `ManagedRuntime.make` still exists and works the same way
- [ ] Confirm `.Default` layer naming (may become `.layer` in final release)
- [ ] Confirm `Data.TaggedError` still exists in the `Data` module
- [ ] Verify `Effect.provideService` works for `Context.Reference` values (replaces `Effect.locally`)
- [ ] Test Schema APIs used: `Schema.pattern`, `Schema.minLength`, `Schema.optionalWith`, `Schema.Class`, `Schema.decodeUnknown`
- [ ] Verify `JSONSchema.make()` still works for Fastify JSON Schema generation
- [ ] Confirm `Match.value` + `Match.tag` + `Match.exhaustive` pattern unchanged
- [ ] Verify `Effect.acquireRelease` signature unchanged
- [ ] Test `Logger.replace(Logger.defaultLogger, ...)` for Pino integration
- [ ] Confirm ecosystem packages use single version number (install `effect@4.x` only)
