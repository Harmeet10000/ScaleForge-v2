---
name: elysia
description: |
  ## When to Use This Skill

  Use this skill whenever you need to work with **Elysia**, the high-performance web framework for Bun. Elysia is ergonomic, type-safe, and optimized for Bun with extensive TypeScript support.

  **Trigger this skill for:**
  - Building REST APIs, GraphQL servers, or WebSocket applications
  - Setting up authentication, validation, cookies, CORS, or middleware
  - Configuring routes, groups, guards, path parameters, or dynamic paths
  - Using plugins (Apollo, Yoga, Bearer, CORS, Cron, OpenAPI, etc.)
  - Implementing lifecycle hooks (onRequest, beforeHandle, afterHandle, etc.)
  - Type-safe client generation with Eden (Treaty, Fetch, Test)
  - Learning Elysia patterns: best practices, folder structure, MVC setup
  - Deployment strategies: binary compilation, Docker, Vercel, Railway, clustering
  - Integrating with databases, authentication frameworks, or services
  - Troubleshooting performance, typing issues, or configuration problems
  - Creating custom body parsers, error handlers, or macros
  - Testing Elysia applications with Bun Test and Eden

  **This skill is EXHAUSTIVE** — it covers every aspect of Elysia including all configuration options, all plugin APIs, all lifecycle hooks, all validation patterns, all HTTP methods, all status codes, all headers, all cookies, all error handling strategies, all deployment options, and all client patterns. Nothing is excluded.

---

# Elysia Framework — Complete Reference

Welcome to the exhaustive Elysia skill. This document serves as your navigation hub and quick-reference. For deep dives into specific areas, consult the bundled references below.

## What is Elysia?

**Elysia** is an ergonomic, high-performance web framework for Bun, built with TypeScript and type-safety in mind. Key strengths:

- **Type Integrity**: Automatic type inference from code without manual declarations
- **Performance**: Matches or exceeds Golang/Rust frameworks; fastest TypeScript framework available
- **End-to-End Type Safety**: Synchronize types between server and client with Eden (tRPC-like experience)
- **Platform Agnostic**: Deploy to Bun, Node.js, Deno, Cloudflare Workers, Vercel, etc.
- **Developer Experience**: Single source of truth for validation schemas and types
- **Standards Compliance**: OpenAPI, WinterTC, Standard Schema support

---

## Quick Navigation

### Getting Started
- **Hello World**: Minimal setup, first route
- **Path Parameters & Dynamic Routes**: `:id`, `*` wildcards, typed params
- **HTTP Methods**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- **Custom Methods**: Non-standard HTTP verbs

### Core Concepts
- **Routing**: Paths, groups, prefixes, guards, scope
- **Validation (Elysia.t)**: Object, String, Number, Boolean, Array, Union, Enum, etc.
- **Standard Schema**: Use Zod, Valibot, ArkType, Effect Schema, Yup, Joi alongside Elysia.t
- **Context**: Request, response, params, query, body, headers, cookies, state
- **Handler Function**: Destructure context, return response, use `set` and `status`
- **Lifecycle Hooks**: Request flow, parse, beforeHandle, afterHandle, response, error, stop
- **Macros**: Reusable handler logic with resolve function
- **State & Decorators**: Global store, custom properties
- **Cookie**: Read, write, sign, remove, set attributes

### Plugins & Extensions
- **Bearer Token**: `@elysiajs/bearer`
- **CORS**: `@elysiajs/cors` — full origin/method/header configuration
- **Cron Jobs**: `@elysiajs/cron` — schedule tasks with predefined patterns
- **GraphQL Apollo**: `@elysiajs/apollo` — GraphQL server with type-safe context
- **GraphQL Yoga**: `@elysiajs/graphql-yoga` — alternative GraphQL implementation
- **OpenAPI**: `@elysiajs/openapi` — auto-generate API docs from types
- **Authentication**: `better-auth`, custom PASETO, JWT, sessions
- **HTML/JSX**: `@elysiajs/html` — server-side rendering
- **OpenTelemetry**: `@elysiajs/opentelemetry` — observability
- **Swagger**: `@elysiajs/swagger` — interactive API documentation

### Advanced Features
- **WebSocket**: Real-time bidirectional communication
- **File Upload**: Multi-file and single-file uploads
- **Error Handling**: Custom error handlers, status codes, error mapping
- **Request Parsing**: Custom body parsers, multipart, form data
- **Middleware**: Plugins as middleware, middleware composition
- **Performance Optimization**: AOT compilation, precompilation, native static response
- **Plugin Deduplication**: Automatic singleton behavior with named plugins

### Configuration
- **Server Options**: Port, hostname, TLS/SSL, max body size, idle timeout
- **Instance Config**: Name, prefix, normalize, sanitize, encoding, validation detail levels
- **Lifecycle Control**: Hot reload, graceful shutdown
- **WebSocket Config**: Message compression, message size limits

### Client Patterns (Eden)
- **Eden Treaty**: Type-safe client generation (tRPC-like)
- **Eden Fetch**: Fetch-based alternative to Treaty
- **Eden Test**: Integration testing with type safety
- **Error Handling**: Destructure `{ data, error }` from responses

### Deployment
- **Bun Runtime**: Native, optimized performance
- **Node.js Runtime**: Full compatibility via adapters
- **Cluster Mode**: Multi-core CPU utilization on Node.js
- **Binary Compilation**: Compile to portable binary for Bun
- **Docker**: Multi-stage builds, distroless images, external modules
- **Vercel**: Zero-config deployment with Bun or Node
- **Railway**: Dynamic port handling
- **Monorepo**: Turborepo, Lerna, workspace support

### Best Practices
- **Folder Structure**: Feature-based (auth, users, etc.) with controller/service/model separation
- **Testing**: Unit tests with `bun:test`, integration tests with Eden
- **Error Handling**: Consistent error responses, status code mapping
- **Type Safety**: Never pass entire Context to controllers; use object destructuring
- **Service Layer**: Static methods or Elysia instances for non-request-dependent logic
- **MVC Pattern**: Elysia instance as controller, decoupled services

---

## Documentation Map

This skill organizes all Elysia knowledge into focused, feature-based reference documents:

| Document | Content |
|----------|---------|
| `references/01-essentials.md` | Core concepts: routes, handlers, context, validation |
| `references/02-routing.md` | Path parameters, groups, prefixes, guards, scope |
| `references/03-validation.md` | Elysia.t schema builder, Standard Schema, coercion |
| `references/04-context.md` | Full context API: params, query, body, headers, cookies, state |
| `references/05-hooks-lifecycle.md` | All lifecycle events with execution order and patterns |
| `references/06-cookies-headers.md` | Cookie management, signing, attributes, header manipulation |
| `references/07-status-errors.md` | HTTP status codes, error handling, exception mapping |
| `references/08-websocket.md` | WebSocket API, events, broadcasting, binary frames |
| `references/09-file-upload.md` | Single/multi-file uploads, validation, streaming |
| `references/10-plugins.md` | Plugin system, plugin composition, deduplication, creation |
| `references/11-plugins-builtin.md` | All official plugins: bearer, cors, cron, apollo, yoga, openapi |
| `references/12-macro-decorator.md` | Macro system, resolve function, decorator pattern |
| `references/13-performance.md` | AOT/JIT compilation, static response, normalization, optimization |
| `references/14-configuration.md` | All config options: instance, server, serve, TLS, WebSocket |
| `references/15-eden-client.md` | Treaty, Fetch, Test; type inference, headers, error handling |
| `references/16-best-practices.md` | MVC pattern, folder structure, testing, error handling |
| `references/17-deployment.md` | Binary, Docker, clustering, Vercel, Railway, monorepo |
| `references/18-integrations.md` | Auth frameworks, databases, BetterAuth, OpenTelemetry |
| `references/19-examples.md` | Complete code examples for common patterns |

---

## Core Features at a Glance

### Automatic Type Inference

```typescript
import { Elysia } from 'elysia'

new Elysia()
    .get('/user/:id', ({ params: { id } }) => id)
    //                           ^?  inferred as string
    .listen(3000)
```

### Single Source of Truth (Schema)

```typescript
import { Elysia, t } from 'elysia'

const userSchema = t.Object({
    id: t.Number(),
    name: t.String()
})

new Elysia()
    .post('/user', ({ body }) => body, {
        body: userSchema,
        response: userSchema  // same schema, both validated + typed
    })
    .listen(3000)
```

### End-to-End Type Safety (Eden)

```typescript
// server.ts
const app = new Elysia()
    .get('/user/:id', ({ params: { id } }) => ({ id, name: 'Elysia' }))
    .listen(3000)

export type App = typeof app

// client.ts
import { treaty } from '@elysiajs/eden'
import type { App } from './server'

const client = treaty<App>('localhost:3000')
const { data } = await client.user({ id: 123 }).get()
// data:  { id: 123, name: 'Elysia' } — fully typed!
```

### Plugin Composition

```typescript
const auth = new Elysia({ name: 'auth' })
    .macro({ isAuth: { resolve: async ({ status, request }) => {
        if (!request.headers.get('authorization')) return status(401)
        return {}
    }}})

new Elysia()
    .use(auth)
    .get('/admin', () => 'admin', { isAuth: true })
    .listen(3000)
```

---

## How to Use This Skill

### Scenario 1: Building a New REST API

1. Read `references/01-essentials.md` for core patterns
2. Consult `references/02-routing.md` for path/parameter design
3. Use `references/03-validation.md` for request validation
4. Reference `references/15-eden-client.md` for client setup

### Scenario 2: Adding Authentication

1. Check `references/11-plugins-builtin.md` for Bearer plugin
2. Read `references/04-context.md` for accessing headers/cookies
3. Use `references/06-cookies-headers.md` for cookie/session patterns
4. See `references/18-integrations.md` for BetterAuth setup

### Scenario 3: WebSocket Application

1. Study `references/08-websocket.md` for all WebSocket APIs
2. Review `references/19-examples.md` for real-world patterns
3. Consult `references/05-hooks-lifecycle.md` for lifecycle events

### Scenario 4: Deploying to Production

1. Read `references/17-deployment.md` for all deployment options
2. Check `references/14-configuration.md` for server tuning
3. Use `references/13-performance.md` for optimization strategies

### Scenario 5: Troubleshooting

1. Reference `references/16-best-practices.md` for common gotchas
2. Check `references/04-context.md` if types don't infer correctly
3. See `references/15-eden-client.md` for Eden type inference issues

---

## Key Concepts Explained

### Elysia.t (Validation + Types)

Elysia provides **Elysia.t**, a built-in schema builder that creates both runtime validation and TypeScript types from a single definition:

```typescript
import { t } from 'elysia'

const schema = t.Object({
    name: t.String({ minLength: 1 }),
    age: t.Number({ minimum: 0 }),
    email: t.Optional(t.String({ format: 'email' }))
})

// This is BOTH:
// 1. A runtime validator (checks input at request time)
// 2. A TypeScript type (inferred automatically)
```

### Standard Schema Support

Elysia supports **Standard Schema**, allowing you to use your favorite validation library (Zod, Valibot, ArkType, Effect Schema, Yup, Joi) while maintaining type inference:

```typescript
import { z } from 'zod'

const schema = z.object({
    name: z.string(),
    age: z.number()
})

new Elysia()
    .post('/user', ({ body }) => body, {
        body: schema  // Works with any Standard Schema library!
    })
```

### Context Object

Every route handler receives a **Context** object containing everything about the request:

```typescript
new Elysia()
    .post('/user', ({
        params,           // Path parameters from :id
        query,            // Query string parameters
        body,             // Request body (validated if schema provided)
        headers,          // HTTP headers
        cookie,           // Parsed cookies (reactive)
        request,          // Raw Request object
        set,              // Modify response (headers, cookies, status)
        status,           // Helper to set HTTP status code
        store,            // Global state object
        path,             // Full path
        redirect          // Helper to redirect
    }) => {
        // Handle request...
    })
```

### Lifecycle Hooks

Elysia provides fine-grained control over request/response lifecycle:

```
[Request] → onRequest → parse → onParse → beforeHandle → handler → afterHandle → response → error (if any) → stop
```

Each hook can intercept, modify, or short-circuit the request flow.

### Macros

**Macros** are reusable handler configurations that combine validation + business logic:

```typescript
const auth = new Elysia()
    .macro({
        requireAuth: {
            resolve: async ({ status, request }) => {
                const token = request.headers.get('authorization')
                if (!token) return status(401)
                return { userId: extractUserId(token) }
            }
        }
    })

new Elysia()
    .use(auth)
    .get('/profile', ({ userId }) => ({ userId }), { 
        requireAuth: true  // Use the macro
    })
```

### Plugin Deduplication

Named plugins are automatically deduplicated (singleton pattern):

```typescript
const db = new Elysia({ name: 'db' })  // Named!
    .decorate('db', connectToDatabase())

// This plugin will only initialize ONCE even if used multiple times
new Elysia()
    .use(db)
    .use(db)  // Same instance, no duplicate initialization
    .use(db)  // ✅ Singleton behavior
```

---

## Performance Characteristics

| Metric | Elysia on Bun | Fastify on Node |
|--------|---------------|-----------------|
| Average req/sec | 255,574 | 60,322 |
| Plain text | 313,073 | 71,150 |
| Path parameters | 241,891 | 62,060 |
| JSON body | 211,758 | 47,756 |

*Benchmark: Debian 11, Intel i7-13700K, TechEmpower Round 22*

Elysia's performance benefits come from:
- **JIT compilation** (Ahead of Time mode available)
- **Static analysis** for route optimization
- **Native Bun integration** (fastest JavaScript runtime)
- **Minimal middleware overhead**

---

## Common Patterns

### REST API with Validation

```typescript
import { Elysia, t } from 'elysia'

new Elysia()
    .get('/users/:id', 
        ({ params: { id } }) => ({ id, name: 'User' }),
        { params: t.Object({ id: t.Numeric() }) }
    )
    .post('/users',
        ({ body }) => ({ created: true, ...body }),
        { body: t.Object({ name: t.String(), email: t.String() }) }
    )
    .listen(3000)
```

### Authentication with Macros

```typescript
const auth = new Elysia()
    .macro({
        auth: {
            resolve: async ({ request, status }) => {
                const token = request.headers.get('authorization')?.replace('Bearer ', '')
                if (!token) return status(401)
                const user = await verifyToken(token)
                return { user }
            }
        }
    })

new Elysia()
    .use(auth)
    .get('/me', ({ user }) => user, { auth: true })
    .listen(3000)
```

### WebSocket Chat

```typescript
const messages = []

new Elysia()
    .ws('/chat', {
        message: (ws, message) => {
            messages.push(message)
            ws.send({ type: 'message', data: message })
            ws.publish('chat', { type: 'message', data: message })
        }
    })
    .listen(3000)
```

### File Upload with Validation

```typescript
new Elysia()
    .post('/upload',
        ({ body: { file, name } }) => ({ 
            name: file.name,
            size: file.size,
            type: file.type
        }),
        {
            body: t.Object({
                file: t.File({ format: 'image/*' }),
                name: t.String()
            })
        }
    )
    .listen(3000)
```

---

## What's in the Bundled References?

Each reference document is **exhaustive and feature-complete**:

- **01-essentials.md**: Routes, handlers, responses, status codes
- **02-routing.md**: Every path format, grouping, guard patterns
- **03-validation.md**: Every t.* type, Standard Schema, transformations
- **04-context.md**: Every context property with examples
- **05-hooks-lifecycle.md**: Every lifecycle event with order + patterns
- **06-cookies-headers.md**: Cookie signing, rotation, attributes, header manipulation
- **07-status-errors.md**: Error handling strategies, status code mapping
- **08-websocket.md**: WebSocket API, events, compression, binary
- **09-file-upload.md**: File handling, streaming, validation
- **10-plugins.md**: Plugin system, composition, deduplication
- **11-plugins-builtin.md**: Every official plugin with full API
- **12-macro-decorator.md**: Macro system, resolve functions
- **13-performance.md**: JIT/AOT, optimization techniques
- **14-configuration.md**: Every config option explained
- **15-eden-client.md**: Treaty, Fetch, Test with all options
- **16-best-practices.md**: Patterns, MVC, testing, troubleshooting
- **17-deployment.md**: Binary, Docker, cluster, Vercel, Railway
- **18-integrations.md**: Auth, databases, BetterAuth, OpenTelemetry
- **19-examples.md**: 50+ complete working examples

---

## Next Steps

1. **Read this document** — You're doing it! ✓
2. **Pick a reference** from the map above based on your task
3. **Search within reference** for specific API or pattern
4. **Use code snippets** as templates for your implementation
5. **Cross-reference** multiple documents if combining features
6. **Consult examples** in 19-examples.md for real-world patterns

---

## Quick Reference: All HTTP Methods

```typescript
new Elysia()
    .get('/path', handler)        // GET
    .post('/path', handler)       // POST
    .put('/path', handler)        // PUT
    .delete('/path', handler)     // DELETE
    .patch('/path', handler)      // PATCH
    .head('/path', handler)       // HEAD
    .options('/path', handler)    // OPTIONS
    .route('M-SEARCH', '/path', handler)  // Custom method
    .ws('/path', handler)         // WebSocket
```

---

## Quick Reference: Status Code Helper

```typescript
new Elysia()
    .get('/ok', ({ status }) => status(200, 'OK'))
    .get('/created', ({ status }) => status(201, { id: 1 }))
    .get('/redirect', ({ redirect }) => redirect('/new-path'))
    .get('/error', ({ status }) => status(400, 'Bad Request'))
```

---

**This skill is exhaustive** — no Elysia feature is excluded. For any question about Elysia, consult the appropriate reference document or use the examples in document 19.

---

## Elysia Ecosystem

- **Official Plugins**: Bearer, CORS, Cron, Apollo, Yoga, OpenAPI, OpenTelemetry, Swagger, HTML, HTMX, TRPC
- **Official Client**: Eden (Treaty + Fetch + Test)
- **Integration**: BetterAuth, Drizzle, Prisma, TypeORM, Mongoose
- **Deployment**: Bun, Node.js, Deno, Cloudflare, Vercel, Railway, AWS Lambda
- **Testing**: Bun Test, Eden Test, Vitest
- **Community**: 10,000+ GitHub dependent projects, used by X, Bank for Agriculture, Cluely, CS.Money

---

**Ready?** Pick a reference document and start building! 🚀
