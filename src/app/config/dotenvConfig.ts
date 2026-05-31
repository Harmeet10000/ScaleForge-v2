/**
 * src/app/config/dotenvConfig.ts
 *
 * No-op shim: env loading is handled at runtime.
 *   - Dev (bun): Bun auto-loads .env automatically.
 *   - Production (Node 20.6+): start with `node --env-file=.env dist/main.js`
 *   - Railway / cloud: env vars are injected directly by the platform.
 *
 * dotenv-flow has been removed. Use Effect.Config for all config access.
 */
