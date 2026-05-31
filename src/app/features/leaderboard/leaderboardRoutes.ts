/**
 * src/app/features/leaderboard/leaderboardRoutes.ts
 *
 * REST + WebSocket routes for the leaderboard feature.
 *
 * Endpoints:
 *   GET  /leaderboard                  — top N for window (public)
 *   GET  /leaderboard/rank/:userId     — single user rank (auth required)
 *   POST /leaderboard/event            — record a score event (internal/admin)
 *   GET  /leaderboard/ws               — WebSocket stream of live score deltas
 *
 * WS fan-out design:
 *   - A single dedicated ioredis subscriber is created when the plugin loads.
 *   - It subscribes to the `lb:updates` Redis pub/sub channel.
 *   - Incoming updates are debounced (200ms) and broadcast as a JSON batch
 *     to all connected WebSocket clients.
 *   - Full snapshot is sent to each client on connect.
 *
 * @fastify/websocket v11: `{ websocket: true }` route option.
 * fastify.websocketServer.clients = all connected WebSocket clients.
 */

import type { FastifyInstance } from "fastify"
import { Effect } from "effect"
import Redis from "ioredis"
import { LeaderboardService } from "./leaderboardService.ts"
import type { LeaderboardDelta, LeaderboardWindow } from "./leaderboardService.ts"
import { requireAuth } from "../auth2/authMiddleware.ts"
import { AppConfig } from "../../../core/config/configService.ts"
import { Redacted } from "effect"
import { effectHandler } from "../../../runtime/fastifyBridge.ts"
import { makeMessage } from "../../../infra/ws/wsCodec.ts"

// ── WS fan-out state ──────────────────────────────────────────────────────────

/** Buffer of deltas waiting to be flushed to WS clients. */
let pendingDeltas: LeaderboardDelta[] = []
let debounceHandle: ReturnType<typeof setTimeout> | null = null
let subscriber: Redis | null = null

const DEBOUNCE_MS = 200
const WS_CHANNEL = "lb:updates"

// ── Plugin ────────────────────────────────────────────────────────────────────

export const leaderboardRoutes = async (fastify: FastifyInstance): Promise<void> => {

  // ── Subscribe to Redis on ready ─────────────────────────────────────────────

  fastify.addHook("onReady", async () => {
    // Get Redis config from the Effect runtime
    const config = await fastify.effectRuntime.runPromise(
      Effect.flatMap(AppConfig, (c) => Effect.succeed(c))
    )

    subscriber = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      username: config.redis.username,
      password: Redacted.value(config.redis.password),
      lazyConnect: false,
      family: 4,
      db: 0,
      // Pub/sub clients do NOT use command pipelining or reconnect strategies
      // that would interfere with SUBSCRIBE mode.
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })

    await subscriber.subscribe(WS_CHANNEL)

    subscriber.on("message", (_channel: string, message: string) => {
      try {
        const delta = JSON.parse(message) as LeaderboardDelta
        pendingDeltas.push(delta)

        if (debounceHandle) clearTimeout(debounceHandle)
        debounceHandle = setTimeout(() => {
          if (pendingDeltas.length === 0) return
          const batch = pendingDeltas
          pendingDeltas = []
          debounceHandle = null

          const payload = makeMessage("lb:delta", batch)
          const encoded = JSON.stringify(payload)

          fastify.websocketServer.clients.forEach((client) => {
            if (client.readyState === client.OPEN) {
              client.send(encoded)
            }
          })
        }, DEBOUNCE_MS)
      } catch {
        // Malformed message — ignore
      }
    })

    subscriber.on("error", (err: Error) => {
      fastify.log.error({ err }, "[leaderboard-ws] Redis subscriber error")
    })
  })

  fastify.addHook("onClose", async () => {
    if (debounceHandle) clearTimeout(debounceHandle)
    if (subscriber) {
      await subscriber.quit().catch(() => undefined)
      subscriber = null
    }
  })

  // ── GET /leaderboard ─────────────────────────────────────────────────────────

  fastify.get<{
    Querystring: { window?: string; limit?: string }
  }>("/leaderboard", {
    schema: {
      tags: ["Leaderboard"],
      summary: "Get top N leaderboard entries",
      querystring: {
        type: "object",
        properties: {
          window: { type: "string", enum: ["alltime", "7d", "24h"], default: "alltime" },
          limit: { type: "string", pattern: "^[0-9]+$" },
        },
      },
    },
  }, async (request, reply) => {
    const window = (request.query.window ?? "alltime") as LeaderboardWindow
    const limit = Math.min(parseInt(request.query.limit ?? "100", 10), 500)
    return effectHandler(request, reply,
      Effect.flatMap(LeaderboardService, (s) => s.getLeaderboard(window, limit)),
      {
        transform: (entries, reply) => {
          void reply.send({
            success: true,
            data: { window, entries, count: (entries as Array<unknown>).length },
          })
        },
      },
    )
  })

  // ── GET /leaderboard/rank/:userId ────────────────────────────────────────────

  fastify.get<{
    Params: { userId: string }
    Querystring: { window?: string }
  }>("/leaderboard/rank/:userId", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Leaderboard"],
      summary: "Get a user's rank and score",
      params: {
        type: "object",
        properties: { userId: { type: "string" } },
        required: ["userId"],
      },
      querystring: {
        type: "object",
        properties: {
          window: { type: "string", enum: ["alltime", "7d", "24h"], default: "alltime" },
        },
      },
    },
  }, async (request, reply) => {
    const { userId } = request.params
    const window = (request.query.window ?? "alltime") as LeaderboardWindow
    return effectHandler(request, reply,
      Effect.flatMap(LeaderboardService, (s) => s.getUserRank(window, userId)),
    )
  })

  // ── POST /leaderboard/event ───────────────────────────────────────────────────
  // Internal endpoint — in production this should be called only by trusted services.
  // TODO: add admin role check or internal-service API key check in Phase 7.

  fastify.post<{
    Body: {
      userId: string
      delta: number
      entityType: string
      entityId?: string
      metadata?: Record<string, unknown>
    }
  }>("/leaderboard/event", {
    schema: {
      tags: ["Leaderboard"],
      summary: "Record a score event (internal)",
      body: {
        type: "object",
        required: ["userId", "delta", "entityType"],
        properties: {
          userId: { type: "string" },
          delta: { type: "number" },
          entityType: { type: "string" },
          entityId: { type: "string" },
          metadata: { type: "object" },
        },
      },
    },
  }, async (request, reply) => {
    const { userId, delta, entityType, entityId, metadata } = request.body
    return effectHandler(request, reply,
      Effect.flatMap(LeaderboardService, (s) =>
        s.recordEvent({
          userId,
          delta,
          entityType,
          ...(entityId !== undefined ? { entityId } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
        })
      ),
      { statusCode: 201 },
    )
  })

  // ── WS /leaderboard/ws ────────────────────────────────────────────────────────

  fastify.get("/leaderboard/ws", { websocket: true }, (socket, request) => {
    // Send full snapshot to the newly connected client
    void request.server.effectRuntime.runPromise(
      Effect.gen(function* () {
        const svc = yield* LeaderboardService
        const [alltime, sevenDay, twentyFourHour] = yield* Effect.all([
          svc.getLeaderboard("alltime", 100),
          svc.getLeaderboard("7d", 100),
          svc.getLeaderboard("24h", 100),
        ])
        return { alltime, "7d": sevenDay, "24h": twentyFourHour }
      })
    ).then((snapshot) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(makeMessage("lb:snapshot", snapshot)))
      }
    }).catch(() => {
      // Snapshot failed — client will receive deltas from stream
    })

    socket.on("error", (err: Error) => {
      fastify.log.warn({ err }, "[leaderboard-ws] client socket error")
    })
  })
}
