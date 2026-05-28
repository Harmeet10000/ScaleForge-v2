# 02-04: Routing, Validation & Context — Core Trio

This master reference covers routing patterns, validation schemas, and the context object — the three most important concepts in Elysia.

---

## PART 1: ROUTING

### Group (Prefix)

Group multiple routes under a prefix:

```typescript
new Elysia()
    .group('/api', app => app
        .get('/status', () => ({ status: 'ok' }))
        .get('/version', () => ({ version: '1.0' }))
    )
    .listen(3000)
```

Routes: `GET /api/status`, `GET /api/version`

### Guard (Group Validation)

Enforce validation/behavior for all routes in a group:

```typescript
new Elysia()
    .guard({ response: t.String() }, app => app
        .get('/a', () => 'valid')
        .get('/b', () => 'valid')
        // .get('/c', () => 123)  // ERROR! Invalid response type
    )
```

### Prefix (Instance-Level)

Set a prefix for all routes on the instance:

```typescript
const api = new Elysia({ prefix: '/api/v1' })
    .get('/users', () => ({ users: [] }))
    .listen(3000)
```

Route: `GET /api/v1/users`

### Nested Groups

```typescript
new Elysia()
    .group('/admin', app => app
        .group('/users', app => app
            .get('/', () => 'all users')
            .get('/:id', ({ params: { id } }) => `user ${id}`)
        )
    )
    .listen(3000)
```

Routes:
- `GET /admin/users/` → "all users"
- `GET /admin/users/123` → "user 123"

### Scope

Control route visibility for plugins and composition:

```typescript
const auth = new Elysia({ name: 'auth' })
    .macro({ requireAuth: {...} })

const api = new Elysia()
    .use(auth)
    .get('/', () => 'public')
    .guard({
        isAuth: true  // All routes below require auth
    }, app => app
        .get('/admin', () => 'admin only')
        .get('/profile', () => 'profile')
    )
```

### Path Parameter Details

```typescript
new Elysia()
    // Single parameter
    .get('/user/:id', ({ params: { id } }) => id)
    
    // Multiple parameters
    .get('/post/:postId/comment/:commentId', 
        ({ params: { postId, commentId } }) => ({ postId, commentId })
    )
    
    // Optional parameter (must be last)
    .get('/user/:id?', ({ params: { id } }) => id ?? 'all')
    
    // Wildcard (any depth)
    .get('/files/*', ({ params }) => params['*'])
    
    // Mixed
    .get('/blog/:year/:month/*', ({ params }) => params)
```

### Dynamic Routing

```typescript
new Elysia()
    .get('/user/:id', ({ params: { id }, status }) => {
        if (isNaN(+id)) return status(400, 'Must be numeric')
        if (id === '0') return status(404)
        return { id: +id }
    }, {
        params: t.Object({ id: t.String() })
    })
```

---

## PART 2: VALIDATION (Schema)

### Elysia.t Types

`Elysia.t` is the built-in schema builder. Use it for automatic type inference + runtime validation:

```typescript
import { Elysia, t } from 'elysia'

// Primitives
const schema = t.Object({
    string: t.String(),
    number: t.Number(),
    boolean: t.Boolean(),
    null: t.Null(),
})

// Collections
const array = t.Array(t.String())  // string[]
const record = t.Record(t.String(), t.Number())  // Record<string, number>
const tuple = t.Tuple([t.String(), t.Number()])  // [string, number]

// Optional
const optional = t.Optional(t.String())  // string | undefined

// Union
const union = t.Union([t.String(), t.Number()])  // string | number

// Literal
const literal = t.Literal('admin')  // 'admin' only

// Enum
const status = t.Union([
    t.Literal('pending'),
    t.Literal('active'),
    t.Literal('inactive')
])

// Nesting
const nested = t.Object({
    user: t.Object({
        name: t.String(),
        age: t.Number()
    })
})
```

### String Validators

```typescript
const schema = t.Object({
    // Basic
    name: t.String(),
    
    // Length
    short: t.String({ minLength: 1 }),
    long: t.String({ maxLength: 100 }),
    exact: t.String({ minLength: 5, maxLength: 5 }),
    
    // Format (RFC3339, email, url, uuid, etc.)
    email: t.String({ format: 'email' }),
    url: t.String({ format: 'url' }),
    uuid: t.String({ format: 'uuid' }),
    date: t.String({ format: 'date' }),
    time: t.String({ format: 'time' }),
    dateTime: t.String({ format: 'date-time' }),
    
    // Pattern (regex)
    username: t.String({ pattern: '^[a-z0-9_]{3,20}$' }),
    
    // Default value
    country: t.String({ default: 'US' })
})
```

### Number Validators

```typescript
const schema = t.Object({
    // Basic
    count: t.Number(),
    
    // Range
    age: t.Number({ minimum: 0, maximum: 150 }),
    positive: t.Number({ minimum: 1 }),
    percentage: t.Number({ minimum: 0, maximum: 100 }),
    
    // Exclusive
    lessThan: t.Number({ exclusiveMinimum: 0 }),
    greaterThan: t.Number({ exclusiveMaximum: 100 }),
    
    // Floating point
    decimal: t.Number({ multipleOf: 0.1 }),
    
    // Type coercion
    coerced: t.Numeric(),  // Accepts "123" and converts to 123
    
    // Default
    port: t.Number({ default: 3000 })
})
```

### Common Validators

```typescript
const schema = t.Object({
    // Boolean
    active: t.Boolean(),
    enabled: t.Boolean({ default: true }),
    
    // Array
    tags: t.Array(t.String()),
    numbers: t.Array(t.Number()),
    items: t.Array(t.Object({
        id: t.Number(),
        name: t.String()
    })),
    
    // Record (key-value)
    settings: t.Record(t.String(), t.Any()),
    
    // Union
    value: t.Union([t.String(), t.Number()]),
    
    // Literal
    role: t.Union([
        t.Literal('admin'),
        t.Literal('user'),
        t.Literal('guest')
    ]),
    
    // Optional
    nickname: t.Optional(t.String()),
    
    // Nullable
    middleName: t.Nullable(t.String()),
    
    // Date
    createdAt: t.Date(),
    
    // File
    avatar: t.File()
})
```

### Constraint Shortcuts

```typescript
// Instead of t.Union([t.Literal('a'), t.Literal('b')])
t.Enum({
    ACTIVE: 'active',
    INACTIVE: 'inactive'
})

// Instead of t.Union([...])
t.UnionEnum(['pending', 'active', 'done'])

// Numeric only
t.Numeric()  // Accepts "123" and converts

// Integer only
t.Integer()

// Date constructor
t.Date()
```

### Transform Values

Transform input to output during validation:

```typescript
const schema = t.Object({
    email: t.String()
        .transform(value => value.toLowerCase()),
    
    age: t.Number()
        .transform(value => Math.abs(value)),  // Ensure positive
    
    timestamp: t.String()
        .transform(value => new Date(value))  // Parse date
})
```

### Custom Validation

```typescript
const schema = t.Object({
    password: t.String({
        minLength: 8
    }).transform(value => {
        // Custom validation
        if (!/[A-Z]/.test(value))
            throw new Error('Password needs uppercase')
        if (!/[0-9]/.test(value))
            throw new Error('Password needs number')
        return value
    })
})
```

### Route Validation

```typescript
new Elysia()
    .post('/user',
        ({ body }) => ({ created: body }),
        {
            // Validate different parts of request
            params: t.Object({ id: t.Number() }),
            query: t.Object({ limit: t.Optional(t.Number()) }),
            body: t.Object({
                name: t.String(),
                email: t.String({ format: 'email' })
            }),
            
            // Validate response
            response: t.Object({
                created: t.Object({
                    name: t.String(),
                    email: t.String()
                })
            }),
            
            // Validate cookies
            cookie: t.Object({
                session: t.Optional(t.String())
            }),
            
            // Validate headers
            headers: t.Object({
                'x-api-key': t.Optional(t.String())
            })
        }
    )
```

### Standard Schema

Use your favorite validation library (Zod, Valibot, ArkType, Effect Schema, Yup, Joi):

```typescript
import { z } from 'zod'
import * as v from 'valibot'

new Elysia()
    .post('/zod', ({ body }) => body, {
        body: z.object({
            name: z.string(),
            email: z.string().email()
        })
    })
    .post('/valibot', ({ body }) => body, {
        body: v.object({
            name: v.string(),
            email: v.string([v.email()])
        })
    })
```

Elysia will infer types automatically!

---

## PART 3: CONTEXT

The context object contains everything about the request. Destructure what you need:

```typescript
new Elysia()
    .post('/example', ({
        params,        // Path parameters
        query,         // Query string
        body,          // Request body
        headers,       // HTTP headers
        cookie,        // Parsed cookies (reactive)
        request,       // Raw Request object
        store,         // Global state
        set,           // Modify response
        status,        // Helper for HTTP status
        path,          // Full path
        redirect,      // Helper to redirect
        error          // (In error handler) Error object
    }) => {
        // Handle request
        return { success: true }
    })
```

### Params (Path Parameters)

```typescript
new Elysia()
    .get('/user/:id', ({ params: { id } }) => {
        // id is inferred as string
        return { id }
    })
    
    .get('/post/:postId/comment/:commentId', ({ params }) => {
        // Access all params
        return params  // { postId: '123', commentId: '456' }
    })
```

With validation:

```typescript
.get('/user/:id', ({ params: { id } }) => ({ id: +id }), {
    params: t.Object({
        id: t.Numeric()  // Coerced to number
    })
})
```

### Query (Query String)

URL: `GET /search?q=hello&limit=10`

```typescript
new Elysia()
    .get('/search', ({ query }) => {
        return query  // { q: 'hello', limit: '10' }
    })
```

With validation and optional:

```typescript
.get('/search', ({ query: { q, limit } }) => {
    return { query: q, limit: limit ?? 10 }
}, {
    query: t.Object({
        q: t.String(),
        limit: t.Optional(t.Number())
    })
})
```

### Body (Request Body)

```typescript
new Elysia()
    .post('/data', ({ body }) => {
        return { received: body }
    }, {
        body: t.Object({
            name: t.String(),
            email: t.String()
        })
    })
```

### Headers (HTTP Headers)

```typescript
new Elysia()
    .get('/headers', ({ headers }) => {
        return {
            contentType: headers.get('content-type'),
            auth: headers.get('authorization'),
            userAgent: headers.get('user-agent')
        }
    })
```

### Request (Raw Request Object)

```typescript
new Elysia()
    .get('/request', ({ request }) => {
        return {
            method: request.method,
            url: request.url,
            headers: Object.fromEntries(request.headers),
            ip: request.ip
        }
    })
```

### Cookie (Cookies)

See **06-cookies-headers.md** for comprehensive cookie documentation.

```typescript
new Elysia()
    .get('/cookie', ({ cookie: { visit } }) => {
        const count = +(visit.value ?? 0)
        visit.value = count + 1
        return { count }
    })
```

### Store (Global State)

```typescript
new Elysia()
    .state('version', '1.0.0')
    .state('config', { debug: true })
    .get('/version', ({ store: { version, config } }) => {
        return { version, config }
    })
```

Or decorate for custom properties:

```typescript
new Elysia()
    .decorate('db', connectDatabase())
    .get('/users', ({ db }) => {
        return db.query('SELECT * FROM users')
    })
```

### Set (Modify Response)

```typescript
new Elysia()
    .get('/response', ({ set }) => {
        // Set headers
        set.headers['X-Custom'] = 'value'
        set.headers['Cache-Control'] = 'max-age=3600'
        
        // Set cookies
        set.cookie.session.value = 'abc123'
        
        return { data: 'response' }
    })
```

### Status (HTTP Status Code)

```typescript
new Elysia()
    .post('/create', ({ status }) => {
        return status(201, { id: 1, created: true })
    })
    
    .get('/not-found', ({ status }) => {
        return status(404, { error: 'Not found' })
    })
```

### Path (Current Path)

```typescript
new Elysia()
    .get('/current', ({ path }) => {
        return { path }  // { path: '/current' }
    })
```

### Redirect (Redirect to Another URL)

```typescript
new Elysia()
    .get('/old', ({ redirect }) => {
        return redirect('/new')
    })
    
    .get('/external', ({ redirect }) => {
        return redirect('https://example.com')
    })
```

### Error (In Error Handlers)

```typescript
new Elysia()
    .onError(({ error, status }) => {
        console.log('Error:', error.message)
        return status(500, { error: error.message })
    })
```

---

## Context Type Inference

Elysia automatically infers context types:

```typescript
new Elysia()
    .get('/user/:id', ({ params: { id }, query: { format } }) => {
        //                                   ^?  id: string
        //                                                ^?  format: string | undefined
        return { id, format }
    })
    
    .post('/data', ({ body }) => {
        //                  ^?  body: unknown (no validation specified)
        return body
    }, {
        body: t.Object({ name: t.String() })
    })
    
    .post('/typed', ({ body }) => {
        //                  ^?  body: { name: string }  (inferred from schema!)
        return body
    }, {
        body: t.Object({ name: t.String() })
    })
```

---

## Combining Path Parameters + Query + Body

```typescript
new Elysia()
    .put('/user/:id',
        ({ params: { id }, query: { updatePassword }, body }) => {
            return {
                userId: id,
                shouldUpdatePassword: updatePassword,
                newData: body
            }
        },
        {
            params: t.Object({ id: t.Numeric() }),
            query: t.Object({ updatePassword: t.Optional(t.Boolean()) }),
            body: t.Object({
                name: t.String(),
                email: t.String()
            })
        }
    )
```

---

## Next Steps

- **[05-hooks-lifecycle.md](#)** — Request/response lifecycle
- **[06-cookies-headers.md](#)** — Cookie management, headers
- **[07-status-errors.md](#)** — Error handling, status codes

