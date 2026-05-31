/**
 * src/db/migrate.ts
 *
 * Runs Drizzle ORM migrations against the Neon HTTP serverless driver.
 * Can be imported as a helper (runMigrations) or executed directly as a script.
 */
import { migrate } from "drizzle-orm/neon-http/migrator"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"

const getDatabaseUrl = (): string => {
  const url = process.env["POSTGRES_DATABASE_URL"]
  if (!url) throw new Error("POSTGRES_DATABASE_URL env var is not set")
  return url
}

export const runMigrations = async (): Promise<void> => {
  const sql = neon(getDatabaseUrl())
  const db = drizzle(sql)

  await migrate(db, {
    migrationsFolder: "./src/db/migrations",
    migrationsTable: "drizzle_migrations",
  })

  console.log("[migrate] Database migrations completed successfully")
}

// Run migrations if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runMigrations()
    .then(() => {
      console.log("[migrate] Migration script completed")
      process.exit(0)
    })
    .catch((error: unknown) => {
      console.error("[migrate] Migration script failed:", error)
      process.exit(1)
    })
}
