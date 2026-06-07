/**
 * src/db/migrate.ts
 *
 * Runs Drizzle ORM migrations against the Neon HTTP serverless driver.
 * Can be imported as a helper (runMigrations) or executed directly as a script.
 */
import { migrate } from "drizzle-orm/neon-http/migrator"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { Effect } from "effect"
import { PinoLoggerLayer } from "../infra/logger/pinoLogger.ts"

const getDatabaseUrl = (): string => {
  const url = process.env["POSTGRES_DATABASE_URL"]
  if (!url) throw new Error("POSTGRES_DATABASE_URL env var is not set")
  return url
}

export const runMigrations = async (): Promise<void> => {
  const program = Effect.gen(function* () {
    const sql = neon(getDatabaseUrl())
    const db = drizzle(sql)

    yield* Effect.tryPromise(() =>
      migrate(db, {
        migrationsFolder: "./src/db/migrations",
        migrationsTable: "drizzle_migrations",
      }),
    )

    yield* Effect.log("[migrate] Database migrations completed successfully")
  }).pipe(Effect.provide(PinoLoggerLayer))

  await Effect.runPromise(program)
}

// Run migrations if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runMigrations()
    .then(() => {
      void Effect.runFork(Effect.log("[migrate] Migration script completed").pipe(Effect.provide(PinoLoggerLayer)))
      process.exit(0)
    })
    .catch((error: unknown) => {
      void Effect.runFork(
        Effect.logError("[migrate] Migration script failed", error).pipe(Effect.provide(PinoLoggerLayer)),
      )
      process.exit(1)
    })
}
