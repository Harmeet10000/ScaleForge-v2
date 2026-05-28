# 01: Essentials — Routes, Handlers, Responses

This is the foundation. Master these concepts first before moving to advanced features.

## Hello World

```typescript
import { Elysia } from 'elysia'

new Elysia()
    .get('/', () => 'Hello Elysia')
    .listen(3000)
```

Navigate to `http://localhost:3000` and you'll see `Hello Elysia`.

---

## HTTP Methods

Elysia supports all standard HTTP methods:

### Standard Methods

```typescript
import { Elysia } from 'elysia'

new Elysia()
    // Read operations
    .get('/items', () => ({ items: [] }))
    .head('/items', () => {})  // Same as GET but no body
    
    // Write operations
    .post('/items', ({ body }) => ({ created: true, ...body }))
    .put('/items/:id', ({ params: { id }, body }) => ({ updated: id, ...body }))
    .patch('/items/:id', ({ params: { id }, body }) => ({ patched: id, ...body }))
    .delete('/items/:id', ({ params: { id } }) => ({ deleted: id }))
    
    // Metadata
    .options('/items', () => {})  // CORS preflight
    
    .listen(3000)
```

### Custom HTTP Methods

```typescript
new Elysia()
    .route('M-SEARCH', '/search', () => 'M-SEARCH response')
    .route('PURGE', '/cache', () => 'Cache purged')
    .listen(3000)
```

---

## Handler Function

Every route has a handler function that processes the request and returns a response.

### Simple Handler (No Input)

```typescript
new Elysia()
    .get('/', () => 'plain text')
    .get('/json', () => ({ hello: 'world' }))
    .get('/number', () => 42)
    .get('/boolean', () => true)
    .get('/array', () => [1, 2, 3])
```

Elysia automatically JSON-encodes responses except plain text.

### Handler with Context

```typescript
new Elysia()
    .get('/request-info', ({ request, set, status }) => {
        return {
            method: request.method,
            url: request.url,
            contentType: request.headers.get('content-type')
        }
    })
```

The first parameter to the handler is the **Context** object containing:
- `params`, `query`, `body` — parsed request data
- `request` — raw Request object
- `headers` — request headers
- `cookie` — parsed cookies
- `set` — modify response
- `status` — return HTTP status
- `store` — global state
- `path` — current path

### Destructuring Context

```typescript
new Elysia()
    .post('/user', ({ body }) => {
        // Only extract what you need
        return { received: body }
    })
    
    .get('/article/:id', ({ params: { id } }) => {
        // Automatic type inference
        return { id }
    })
    
    .get('/search', ({ query: { q, limit } }) => {
        return { query: q, limit }
    })
```

---

## Response Types

Elysia accepts various response types:

### String Response

```typescript
.get('/text', () => 'Hello World')
```

### JSON Response

```typescript
.get('/json', () => ({
    name: 'Elysia',
    type: 'framework'
}))
```

### Array Response

```typescript
.get('/array', () => [1, 2, 3, 4, 5])
```

### File Response

```typescript
import { Elysia, file } from 'elysia'

new Elysia()
    .get('/image', () => ({
        file: file('public/image.png')
    }))
    .get('/download', () => ({
        fileName: file('public/doc.pdf'),
        data: { metadata: 'value' }
    }))
```

### Promise/Async Response

```typescript
new Elysia()
    .get('/async', async () => {
        const data = await fetchData()
        return data
    })
```

### Redirect

```typescript
new Elysia()
    .get('/old-path', ({ redirect }) => {
        return redirect('/new-path')
    })
```

### Status Code

```typescript
new Elysia()
    .post('/create', ({ status }) => {
        return status(201, {
            id: 1,
            created: true
        })
    })
    
    .get('/not-found', ({ status }) => {
        return status(404, 'Not found')
    })
    
    .get('/error', ({ status }) => {
        return status(500, 'Internal server error')
    })
```

### Set Custom Headers

```typescript
new Elysia()
    .get('/headers', ({ set }) => {
        set.headers['X-Custom'] = 'value'
        set.headers['X-Powered-By'] = 'Elysia'
        
        return 'Check headers!'
    })
```

### Combine Headers + Status + Body

```typescript
new Elysia()
    .post('/full', ({ set, status }) => {
        set.headers['X-Custom'] = 'value'
        set.headers['cache-control'] = 'no-cache'
        
        return status(201, {
            id: 1,
            message: 'Created'
        })
    })
```

---

## Path Basics

### Static Path

```typescript
new Elysia()
    .get('/', () => 'home')
    .get('/about', () => 'about')
    .get('/contact', () => 'contact')
```

### Dynamic Path Parameter

```typescript
new Elysia()
    .get('/user/:id', ({ params: { id } }) => {
        return { userId: id }  // id is inferred as string
    })
    
    .get('/post/:id/:slug', ({ params: { id, slug } }) => {
        return { id, slug }
    })
```

### Wildcard (Catch-All)

```typescript
new Elysia()
    .get('/files/*', ({ params }) => {
        // Matches /files/any/deep/path
        return { path: params['*'] }
    })
```

### Optional Path Parameter

```typescript
new Elysia()
    .get('/blog/:id?', ({ params: { id } }) => {
        return { id: id ?? 'all' }
    })
```

---

## Query Parameters

Query parameters come after `?` in the URL.

### Reading Query Parameters

```typescript
new Elysia()
    .get('/search', ({ query }) => {
        return { query }
    })
```

Request: `GET /search?q=hello&limit=10`

Response: `{ query: { q: 'hello', limit: '10' } }`

### Typed Query Parameters

```typescript
import { Elysia, t } from 'elysia'

new Elysia()
    .get('/search',
        ({ query: { q, limit } }) => {
            return { q, limit }
        },
        {
            query: t.Object({
                q: t.String(),
                limit: t.Optional(t.Number())
            })
        }
    )
```

Now `limit` is a number (not string), validated automatically.

---

## Request Body

The request body is typically sent with POST, PUT, PATCH requests.

### Reading Body

```typescript
new Elysia()
    .post('/data', ({ body }) => {
        return { received: body }
    })
```

### JSON Body

```typescript
import { Elysia, t } from 'elysia'

new Elysia()
    .post('/user',
        ({ body }) => {
            return { name: body.name, email: body.email }
        },
        {
            body: t.Object({
                name: t.String(),
                email: t.String({ format: 'email' })
            })
        }
    )
```

### Form Data Body

```typescript
new Elysia()
    .post('/form',
        ({ body }) => {
            return { username: body.username }
        },
        {
            body: t.Object({
                username: t.String()
            })
        }
    )
```

---

## Status Codes

Elysia includes a helper to set HTTP status codes:

### Common Status Codes

```typescript
new Elysia()
    // Success
    .get('/ok', ({ status }) => status(200, 'OK'))
    .post('/created', ({ status }) => status(201, { id: 1 }))
    .get('/no-content', ({ status }) => status(204))
    
    // Redirect
    .get('/redirect', ({ status }) => status(301, 'Moved'))
    .get('/temp-redirect', ({ status }) => status(307, 'Temporary'))
    
    // Client error
    .get('/bad-request', ({ status }) => status(400, 'Bad Request'))
    .get('/unauthorized', ({ status }) => status(401, 'Unauthorized'))
    .get('/forbidden', ({ status }) => status(403, 'Forbidden'))
    .get('/not-found', ({ status }) => status(404, 'Not Found'))
    .get('/conflict', ({ status }) => status(409, 'Conflict'))
    .get('/unprocessable', ({ status }) => status(422, 'Unprocessable'))
    
    // Server error
    .get('/error', ({ status }) => status(500, 'Internal Server Error'))
    .get('/unavailable', ({ status }) => status(503, 'Service Unavailable'))
```

### Full Status Reference

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 202 | Accepted |
| 204 | No Content |
| 301 | Moved Permanently |
| 302 | Found |
| 304 | Not Modified |
| 307 | Temporary Redirect |
| 308 | Permanent Redirect |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 405 | Method Not Allowed |
| 409 | Conflict |
| 410 | Gone |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 502 | Bad Gateway |
| 503 | Service Unavailable |
| 504 | Gateway Timeout |

---

## Inline Response Options

Every route can specify validation, response schema, and behavior inline:

```typescript
import { Elysia, t } from 'elysia'

new Elysia()
    .post('/user',
        ({ body }) => ({ id: 1, ...body }),
        {
            body: t.Object({
                name: t.String(),
                email: t.String()
            }),
            response: t.Object({
                id: t.Number(),
                name: t.String(),
                email: t.String()
            }),
            detail: {
                summary: 'Create a user',
                tags: ['users']
            }
        }
    )
```

---

## Elysia Instance

The main Elysia class:

```typescript
import { Elysia } from 'elysia'

const app = new Elysia({
    prefix: '/api',
    name: 'my-api'
})

app.get('/ping', () => 'pong')
   .listen(3000)

export type App = typeof app  // For Eden client
```

### Starting Server

```typescript
new Elysia()
    .get('/', () => 'Hello')
    .listen(3000)  // Start listening

// Or
new Elysia()
    .get('/', () => 'Hello')
    .listen(process.env.PORT ?? 3000)  // Support PORT env var
```

### Chaining

Elysia uses method chaining, so the order matters:

```typescript
new Elysia()
    .state('version', 1)
    .get('/v', ({ store }) => store.version)
    .listen(3000)
```

Without chaining, state won't be available because it returns a new type.

---

## Error Handling Basics

Throw HTTP errors directly in handlers:

```typescript
import { Elysia, status } from 'elysia'

new Elysia()
    .get('/item/:id',
        ({ params: { id }, status }) => {
            if (!id || isNaN(+id))
                return status(400, 'Invalid ID')
            
            if (id === '0')
                return status(404, 'Not found')
            
            return { id }
        }
    )
    .listen(3000)
```

Or throw JavaScript Error:

```typescript
new Elysia()
    .get('/error', () => {
        throw new Error('Something went wrong')
    })
    .onError(({ error }) => {
        return { error: error.message }
    })
```

---

## Next Steps

- **[02-routing.md](#)** — Groups, prefixes, guards, scope
- **[03-validation.md](#)** — All schema types, Standard Schema
- **[04-context.md](#)** — Full context API reference
- **[05-hooks-lifecycle.md](#)** — Request/response lifecycle

