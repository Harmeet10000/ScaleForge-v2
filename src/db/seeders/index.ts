/**
 * src/db/seeders/index.ts
 *
 * Runs all database seeders in order.
 * Can be executed directly: `node --experimental-strip-types src/db/seeders/index.ts`
 */
import { Effect } from "effect"
import { PinoLoggerLayer } from "../../infra/logger/pinoLogger.ts"
import { seedUsers } from "./userSeeder.ts"
import { seedAuditEntries } from "./auditSeeder.ts"

export const runSeeders = async (): Promise<void> => {
  const program = Effect.gen(function* () {
    yield* Effect.log("[seeder] Starting database seeding...")

    yield* Effect.tryPromise(() => seedUsers())
    yield* Effect.tryPromise(() => seedAuditEntries())

    yield* Effect.log("[seeder] Database seeding completed successfully")
  }).pipe(Effect.provide(PinoLoggerLayer))

  await Effect.runPromise(program)
}

// Run seeders if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runSeeders()
    .then(() => {
      void Effect.runFork(Effect.log("[seeder] Seeding script completed").pipe(Effect.provide(PinoLoggerLayer)))
      process.exit(0)
    })
    .catch((error: unknown) => {
      void Effect.runFork(
        Effect.logError("[seeder] Seeding script failed", error).pipe(Effect.provide(PinoLoggerLayer)),
      )
      process.exit(1)
    })
}
