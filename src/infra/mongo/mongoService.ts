import { Context, Effect, Layer } from "effect"
import mongoose from "mongoose"
import { AppConfig } from "../../core/config/configService.ts"
import { MongoConnectionError } from "../../core/errors/infraErrors.ts"

export interface MongoService {
  readonly connection: mongoose.Connection
  readonly isConnected: () => boolean
}

export const MongoService = Context.GenericTag<MongoService>("@infra/MongoService")

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
      }).pipe(Effect.ignoreLogged)
  )

  return MongoService.of({
    connection: conn.connection,
    isConnected: () => mongoose.connection.readyState === 1,
  })
})

export const MongoServiceLive = Layer.scoped(MongoService, make)
