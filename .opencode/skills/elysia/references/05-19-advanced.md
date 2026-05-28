# 05-19: Advanced Features — Lifecycle, Plugins, WebSocket, Deployment

This master reference covers lifecycle hooks, plugins, WebSocket, file uploads, configuration, deployment, and best practices.

---

## LIFECYCLE HOOKS

Request lifecycle in Elysia:

```
[Request] → onRequest → parse → onParse → beforeHandle → handler → afterHandle → response → error (if thrown) → stop
```

### onRequest

Runs at the very beginning, before parsing:

```typescript
new Elysia()
    .onRequest(({ request, path }) => {
        console.log(`${request.method} ${path}`)
    })
    .get('/', () => 'hi')
```

### parse

Custom body parsing (see **09-file-upload.md** for file upload parsing):

```typescript
new Elysia()
    .onParse(({ request, contentType }) => {
        if (contentType === 'application/custom')
            return request.text()
    })
```

### onParse

After parsing, before validation:

```typescript
new Elysia()
    .on('onParse', ({ body }) => {
        console.log('Parsed body:', body)
    })
```

### beforeHandle

Before the handler, typically for validation/authentication:

```typescript
new Elysia()
    .before(({ request, status }) => {
        const token = request.headers.get('authorization')
        if (!token) return status(401, 'Unauthorized')
    })
    .get('/admin', () => 'admin area')
```

Or inline:

```typescript
.get('/admin', () => 'admin', {
    beforeHandle: ({ status, request }) => {
        if (!request.headers.get('authorization'))
            return status(401)
    }
})
```

### afterHandle

After handler, before response is sent (good for response transformation):

```typescript
new Elysia()
    .after(({ response }) => {
        console.log('Response:', response)
    })
```

Or inline:

```typescript
.get('/', () => ({ data: 'raw' }), {
    afterHandle: ({ response }) => {
        return { wrapped: response }  // Wrap response
    }
})
```

### onResponse

After response is sent (logging, cleanup):

```typescript
new Elysia()
    .onResponse(({ status, path }) => {
        console.log(`[${status}] ${path}`)
    })
```

### onError

When an error is thrown:

```typescript
new Elysia()
    .get('/error', () => {
        throw new Error('Something failed')
    })
    .onError(({ error, set, status }) => {
        console.log('Error:', error.message)
        set.status = 500
        return { error: error.message }
    })
```

### stop

After response is sent and connection closed (cleanup):

```typescript
new Elysia()
    .on('stop', () => {
        console.log('Cleanup after request')
    })
```

### Complete Lifecycle Example

```typescript
new Elysia()
    .onRequest(({ request }) => console.log('1. onRequest'))
    .on('onParse', () => console.log('2. onParse'))
    .on('beforeHandle', () => console.log('3. beforeHandle'))
    .get('/', ({ set }) => {
        console.log('4. handler')
        return { data: 'response' }
    })
    .after(() => console.log('5. afterHandle'))
    .onResponse(() => console.log('6. onResponse'))
    .on('stop', () => console.log('7. stop'))
    .listen(3000)
```

---

## COOKIES & HEADERS

### Cookie Read/Write

```typescript
new Elysia()
    .get('/', ({ cookie: { visit } }) => {
        const count = +(visit.value ?? 0)
        visit.value = count + 1
        visit.httpOnly = true
        return `Visited ${count} times`
    })
```

### Cookie Attributes

```typescript
new Elysia()
    .get('/', ({ cookie: { session } }) => {
        session.value = 'token'
        session.httpOnly = true          // Prevent JS access
        session.secure = true            // HTTPS only
        session.sameSite = 'lax'         // CSRF protection
        session.path = '/'               // Cookie path
        session.domain = 'example.com'   // Cookie domain
        session.maxAge = 60 * 60 * 24    // 24 hours
        
        return 'Cookie set'
    })
```

Or use `.set()`:

```typescript
.get('/', ({ cookie: { session } }) => {
    session.value = 'token'
    session.set({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 3600
    })
    return 'ok'
})
```

### Remove Cookie

```typescript
new Elysia()
    .get('/logout', ({ cookie: { session } }) => {
        session.remove()
        return 'Logged out'
    })
```

### Sign Cookies

```typescript
new Elysia({
    cookie: {
        secret: 'my-secret-key'
    }
})
    .get('/', ({ cookie: { data } }) => {
        data.value = 'sensitive'
        return 'ok'
    }, {
        cookie: t.Cookie({
            data: t.String()
        }, {
            secrets: 'my-secret-key',
            sign: ['data']  // Sign this cookie
        })
    })
```

### Headers

```typescript
new Elysia()
    .get('/', ({ set, headers }) => {
        // Set response headers
        set.headers['X-Custom'] = 'value'
        set.headers['Cache-Control'] = 'max-age=3600'
        
        // Read request headers
        const userAgent = headers.get('user-agent')
        const auth = headers.get('authorization')
        
        return { userAgent, auth }
    })
```

### CORS Headers

Use @elysiajs/cors plugin (see **11-plugins-builtin.md**):

```typescript
import { cors } from '@elysiajs/cors'

new Elysia()
    .use(cors({
        origin: 'https://example.com',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    }))
    .listen(3000)
```

---

## ERROR HANDLING

### HTTP Status Errors

```typescript
new Elysia()
    .get('/item/:id', ({ params: { id }, status }) => {
        if (!id) return status(400, 'Bad request')
        if (id === '0') return status(404, 'Not found')
        if (id === '999') return status(403, 'Forbidden')
        return { id }
    })
```

### Throw JavaScript Errors

```typescript
new Elysia()
    .get('/error', () => {
        throw new Error('Something failed')
    })
    .onError(({ error, status }) => {
        return status(500, { message: error.message })
    })
```

### Custom Error Handler

```typescript
new Elysia()
    .onError(({ error, set, status }) => {
        console.error('Error:', error)
        
        set.status = 500
        return {
            error: error.message,
            timestamp: new Date()
        }
    })
    .get('/fail', () => {
        throw new Error('Intentional failure')
    })
```

### Error by Type

```typescript
new Elysia()
    .onError(({ error, status }) => {
        if (error instanceof ValidationError)
            return status(400, { message: 'Invalid input' })
        
        if (error instanceof AuthenticationError)
            return status(401, { message: 'Unauthorized' })
        
        return status(500, { message: 'Server error' })
    })
```

---

## WEBSOCKET

See **08-websocket.md** for full WebSocket reference.

### Basic WebSocket

```typescript
new Elysia()
    .ws('/chat', {
        message: (ws, message) => {
            console.log('Received:', message)
            ws.send('Echo: ' + message)
        }
    })
    .listen(3000)
```

### WebSocket Events

```typescript
new Elysia()
    .ws('/chat', {
        open: (ws) => {
            console.log('Connected')
            ws.send('Welcome')
        },
        message: (ws, message) => {
            ws.send('You said: ' + message)
            ws.publish('broadcast', message)  // Broadcast to all
        },
        close: (ws) => {
            console.log('Disconnected')
        }
    })
```

### Broadcast

```typescript
new Elysia()
    .ws('/notifications', {
        message: (ws, message) => {
            ws.publish('notifications', {
                message,
                from: ws.id,
                timestamp: Date.now()
            })
        }
    })
    .get('/notify/:msg', ({ params: { msg }, store }) => {
        // Broadcast to all connected WebSocket clients
        // (Would need to store WebSocket reference in store)
        return 'Notified'
    })
```

---

## FILE UPLOAD

See **09-file-upload.md** for complete file upload reference.

### Single File

```typescript
new Elysia()
    .post('/upload',
        ({ body: { file } }) => ({
            name: file.name,
            size: file.size,
            type: file.type
        }),
        {
            body: t.Object({
                file: t.File()
            })
        }
    )
```

### Multiple Files

```typescript
new Elysia()
    .post('/multi-upload',
        ({ body: { files } }) => ({
            count: files.length,
            names: files.map(f => f.name)
        }),
        {
            body: t.Object({
                files: t.Files()  // Multiple files
            })
        }
    )
```

### Typed File Upload

```typescript
new Elysia()
    .post('/upload',
        ({ body: { file } }) => ({ name: file.name }),
        {
            body: t.Object({
                file: t.File({ format: 'image/*' })  // Images only
            })
        }
    )
```

---

## PLUGINS

See **10-plugins.md** for plugin creation guide.

### Use Plugin

```typescript
import { Elysia } from 'elysia'
import { bearer } from '@elysiajs/bearer'
import { cors } from '@elysiajs/cors'

new Elysia()
    .use(bearer())
    .use(cors())
    .get('/admin', ({ bearer }) => bearer, {
        beforeHandle: ({ bearer, status }) => {
            if (!bearer) return status(401)
        }
    })
    .listen(3000)
```

### Create Plugin

```typescript
const myPlugin = new Elysia({ name: 'my-plugin' })
    .decorate('myUtil', () => 'utility')
    .macro({
        auth: {
            resolve: ({ status, request }) => {
                if (!request.headers.get('authorization'))
                    return status(401)
            }
        }
    })
    .get('/plugin-route', ({ myUtil }) => myUtil())

new Elysia()
    .use(myPlugin)
    .get('/api', () => 'ok', { auth: true })
    .listen(3000)
```

### Plugin Deduplication

Plugins with `name` property are automatically deduplicated (singleton):

```typescript
const db = new Elysia({ name: 'database' })  // Named!
    .decorate('db', connectToDatabase())

new Elysia()
    .use(db)
    .use(db)  // Same instance, only initializes once!
    .listen(3000)
```

---

## MACROS

Reusable handler logic with `macro()`:

```typescript
const auth = new Elysia()
    .macro({
        requireAuth: {
            // Validation schema
            cookie: t.Object({
                session: t.String()
            }),
            // Business logic
            resolve: async ({ cookie: { session }, status }) => {
                const user = await verifySession(session.value)
                if (!user) return status(401)
                return { user }
            }
        }
    })

new Elysia()
    .use(auth)
    .get('/profile', ({ user }) => user, { requireAuth: true })
```

---

## STATE & DECORATORS

### Global State

```typescript
new Elysia()
    .state('version', '1.0.0')
    .state('db', connectDatabase())
    .state('config', { debug: true })
    .get('/', ({ store: { version, db, config } }) => {
        return { version, config }
    })
```

### Decorate (Custom Properties)

```typescript
new Elysia()
    .decorate('random', Math.random())
    .decorate('date', () => Date.now())
    .decorate('env', process.env)
    .get('/', ({ random, date, env }) => {
        return { random, now: date(), env: env.NODE_ENV }
    })
```

---

## CONFIGURATION

See **14-configuration.md** for all options.

### Instance Config

```typescript
const app = new Elysia({
    name: 'my-api',              // For debugging
    prefix: '/api/v1',           // Prefix for all routes
    aot: true,                   // Ahead-of-time compilation
    precompile: false,           // Precompile routes on startup
    normalize: true,             // Normalize request/response
    strictPath: false,           // Allow /path/ and /path
    detail: {
        hide: true,
        tags: ['api']
    },
    serve: {
        hostname: '0.0.0.0',
        port: 3000,
        maxRequestBodySize: 1024 * 1024 * 128,
        idleTimeout: 10,
        reusePort: true
    }
})
```

### TLS/HTTPS

```typescript
import { Elysia, file } from 'elysia'

new Elysia({
    serve: {
        tls: {
            cert: file('cert.pem'),
            key: file('key.pem')
        }
    }
})
.get('/', () => 'Secure HTTPS')
.listen(443)
```

### Cookie Config

```typescript
new Elysia({
    cookie: {
        secret: 'my-secret-key'
    }
})
```

---

## EDEN CLIENT (Type-Safe)

See **15-eden-client.md** for complete Eden reference.

### Server Setup

```typescript
// server.ts
import { Elysia, t } from 'elysia'

const app = new Elysia()
    .get('/users', () => [{ id: 1, name: 'Alice' }])
    .post('/users',
        ({ body }) => ({ ...body, id: 1 }),
        { body: t.Object({ name: t.String() }) }
    )
    .listen(3000)

export type App = typeof app
```

### Client Usage

```typescript
// client.ts
import { treaty } from '@elysiajs/eden'
import type { App } from './server'

const api = treaty<App>('localhost:3000')

// Fully typed!
const { data: users } = await api.users.get()
//     ^? { id: number, name: string }[]

const { data: user } = await api.users.post({
    name: 'Bob'
})
```

### Error Handling

```typescript
const { data, error } = await api.users.post({ name: 'Alice' })

if (error) {
    console.log('Status:', error.status)  // HTTP status
    console.log('Value:', error.value)    // Error response
} else {
    console.log('Success:', data)
}
```

---

## DEPLOYMENT

See **17-deployment.md** for complete deployment guide.

### Compile to Binary

```bash
bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun \
    --outfile server \
    src/index.ts
```

Then run:

```bash
./server
```

### Docker

```dockerfile
FROM oven/bun AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY src ./src
RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile server \
    src/index.ts

FROM gcr.io/distroless/base
WORKDIR /app
COPY --from=build /app/server .
CMD ["./server"]
EXPOSE 3000
```

### Vercel

```typescript
// src/index.ts
import { Elysia } from 'elysia'

export default new Elysia()
    .get('/', () => 'Hello Vercel')
    .listen(process.env.PORT ?? 3000)
```

### Railway

```typescript
new Elysia()
    .listen(process.env.PORT ?? 3000)  // Railway provides PORT env var
```

### Cluster Mode (Node.js)

```typescript
import cluster from 'node:cluster'
import os from 'node:os'

if (cluster.isPrimary) {
    for (let i = 0; i < os.availableParallelism(); i++)
        cluster.fork()
} else {
    import('./server.js')  // Load server in worker
}
```

---

## BEST PRACTICES

See **16-best-practices.md** for comprehensive guide.

### Folder Structure (Feature-Based)

```
src/
├── modules/
│   ├── auth/
│   │   ├── index.ts (controller)
│   │   ├── service.ts
│   │   └── model.ts
│   ├── user/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   └── model.ts
│   └── post/
├── utils/
└── main.ts
```

### MVC Pattern

**Controller (index.ts):**
```typescript
import { Elysia } from 'elysia'
import { AuthService } from './service'
import { AuthModel } from './model'

export const auth = new Elysia({ prefix: '/auth' })
    .post('/sign-in', 
        ({ body }) => AuthService.signIn(body),
        { body: AuthModel.signIn }
    )
```

**Service (service.ts):**
```typescript
export abstract class AuthService {
    static async signIn({ username, password }) {
        // Business logic
        const user = await db.query(...)
        return { token: 'abc123' }
    }
}
```

**Model (model.ts):**
```typescript
import { t } from 'elysia'

export namespace AuthModel {
    export const signIn = t.Object({
        username: t.String(),
        password: t.String()
    })
}
```

### Testing

```typescript
import { describe, it, expect } from 'bun:test'
import { treaty } from '@elysiajs/eden'

const app = new Elysia()
    .get('/ping', () => 'pong')

const api = treaty(app)

describe('API', () => {
    it('responds to ping', async () => {
        const { data } = await api.ping.get()
        expect(data).toBe('pong')
    })
})
```

---

## PLUGINS QUICK REFERENCE

| Plugin | Install | Purpose |
|--------|---------|---------|
| Bearer | `@elysiajs/bearer` | Extract Bearer token |
| CORS | `@elysiajs/cors` | Cross-origin requests |
| Cron | `@elysiajs/cron` | Scheduled tasks |
| Apollo | `@elysiajs/apollo` | GraphQL Apollo server |
| Yoga | `@elysiajs/graphql-yoga` | GraphQL Yoga server |
| OpenAPI | `@elysiajs/openapi` | Auto API documentation |
| OpenTelemetry | `@elysiajs/opentelemetry` | Observability |
| Swagger | `@elysiajs/swagger` | Interactive docs |
| HTML | `@elysiajs/html` | Server-side rendering |

---

## KEY CHARACTERISTICS

| Feature | Elysia | Express | Fastify |
|---------|--------|---------|---------|
| Performance | 255K req/s | 16K req/s | 60K req/s |
| Type Safety | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| Learning Curve | Easy | Easy | Medium |
| TypeScript | Native | Via types | Via types |
| End-to-End Types | Eden | None | None |
| Runtime | Bun/Node | Node | Node/Bun |

---

## COMMON PATTERNS

### Authentication with Macros

```typescript
const auth = new Elysia()
    .macro({
        isAuth: {
            resolve: async ({ request, status }) => {
                const token = request.headers.get('authorization')?.replace('Bearer ', '')
                if (!token) return status(401)
                const user = await verifyToken(token)
                if (!user) return status(403)
                return { user }
            }
        }
    })

const api = new Elysia()
    .use(auth)
    .get('/public', () => 'public')
    .get('/protected', ({ user }) => user, { isAuth: true })
```

### Rate Limiting

```typescript
const requests = new Map<string, number[]>()

new Elysia()
    .on('beforeHandle', ({ request, status }) => {
        const ip = request.ip
        const now = Date.now()
        const recentRequests = (requests.get(ip) ?? [])
            .filter(t => now - t < 60000)  // Last minute
        
        if (recentRequests.length > 100)
            return status(429, 'Too many requests')
        
        recentRequests.push(now)
        requests.set(ip, recentRequests)
    })
```

### Validation Error Handling

```typescript
new Elysia()
    .onError(({ error, status }) => {
        if (error.message.includes('Validation'))
            return status(400, { error: 'Invalid input' })
        
        return status(500, { error: 'Server error' })
    })
```

---

**This completes the comprehensive Elysia reference. For specific scenarios, consult the relevant section above.**

