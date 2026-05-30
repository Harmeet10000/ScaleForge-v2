import { Context, Effect, Layer } from "effect"
import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"
import { AppConfig } from "../../core/config/configService.ts"
import { PostgresConnectionError, PostgresQueryError } from "../../core/errors/infraErrors.ts"

export interface PostgresService {
  readonly db: NeonHttpDatabase
  readonly query: <T>(queryFn: (db: NeonHttpDatabase) => Promise<T>) => Effect.Effect<T, PostgresQueryError>
}

export const PostgresService = Context.GenericTag<PostgresService>("@infra/PostgresService")

const make = Effect.gen(function* () {
  const config = yield* AppConfig

  const sql = neon(config.postgres.url)
  const db = drizzle(sql, { logger: config.isDevelopment })

  yield* Effect.tryPromise({
    try: () => sql`SELECT 1`,
    catch: (error) => new PostgresConnectionError({ cause: error }),
  })

  return PostgresService.of({
    db,
    query: <T>(queryFn: (db: NeonHttpDatabase) => Promise<T>) =>
      Effect.tryPromise({
        try: () => queryFn(db),
        catch: (error) => new PostgresQueryError({ message: String(error), cause: error }),
      }),
  })
})

export const PostgresServiceLive = Layer.effect(PostgresService, make)
