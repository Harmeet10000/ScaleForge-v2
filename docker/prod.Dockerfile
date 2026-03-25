# Production Dockerfile using Bun
FROM oven/bun:1.3.8-alpine AS builder

WORKDIR /usr/src/backend-app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

# Production runtime
FROM oven/bun:1.3.8-alpine AS runtime

LABEL org.opencontainers.image.source="https://github.com/harmeet10000/production-grade-auth-template"
LABEL org.opencontainers.image.description="Production-ready authentication service"
LABEL org.opencontainers.image.licenses="ISC"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="Harmeet Singh"

WORKDIR /usr/src/backend-app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p /usr/src/backend-app/logs /usr/src/backend-app/backups && chown -R appuser:appgroup /usr/src/backend-app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --production

COPY --from=builder --chown=appuser:appgroup /usr/src/backend-app/dist ./dist

COPY --chown=appuser:appgroup ./scripts ./scripts
COPY --chown=appuser:appgroup ./swagger.json ./swagger.json

EXPOSE 8000

USER appuser

CMD ["bun", "dist/index.js"]
#----------------------------------------------------------
# below is example taken from BUn documentation
# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# [optional] tests & build
ENV NODE_ENV=production
RUN bun test
RUN bun run build

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/index.ts .
COPY --from=prerelease /usr/src/app/package.json .

# run the app
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "index.ts" ]
