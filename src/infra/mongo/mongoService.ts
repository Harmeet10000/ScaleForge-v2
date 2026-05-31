import { Context, Effect, Layer } from "effect"
import mongoose from "mongoose"
import { AppConfig } from "../../core/config/configService.ts"
import { MongoConnectionError } from "../../core/errors/infraErrors.ts"

export interface MongoService {
  readonly connection: mongoose.Connection
  readonly isConnected: () => boolean
  readonly ping: () => Effect.Effect<"PONG", MongoConnectionError>
}

export const MongoService = Context.Service<MongoService>("@infra/MongoService")

const make = Effect.gen(function* () {
  const config = yield* AppConfig

  const conn = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        mongoose.connect(config.mongo.uri, {
          maxPoolSize: config.mongo.poolSize,
          minPoolSize: 2,
          maxIdleTimeMS: 30_000,
          serverSelectionTimeoutMS: 5_000,
          socketTimeoutMS: 45_000,
          readPreference: "secondaryPreferred",
          writeConcern: { w: "majority", j: true, wtimeoutMS: 5_000 },
          retryReads: true,
          retryWrites: true,
        }),
      catch: (error) => new MongoConnectionError({ cause: error }),
    }),
    () =>
      Effect.tryPromise({
        try: () => mongoose.disconnect(),
        catch: () => void 0,
      }).pipe(Effect.ignore)
  )

  return MongoService.of({
    connection: conn.connection,
    isConnected: () => mongoose.connection.readyState === 1,
    ping: () =>
      Effect.tryPromise({
        try: () => mongoose.connection.db!.command({ ping: 1 }),
        catch: (error) => new MongoConnectionError({ cause: error }),
      }).pipe(Effect.as("PONG" as const)),
  })
})

export const MongoServiceLive = Layer.effect(MongoService, make)
