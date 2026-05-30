# Multi-stage Bun build
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY . .
RUN bun build src/app/index.ts --target bun --outfile dist/server.js

FROM oven/bun:1-slim AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
EXPOSE 3000
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/v1/health').then(r=>r.ok||process.exit(1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "dist/server.js"]
