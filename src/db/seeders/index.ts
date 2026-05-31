/**
 * src/db/seeders/index.ts
 *
 * Runs all database seeders in order.
 * Can be executed directly: `node --experimental-strip-types src/db/seeders/index.ts`
 */
import { seedUsers } from "./userSeeder.ts"
import { seedAuditEntries } from "./auditSeeder.ts"

export const runSeeders = async (): Promise<void> => {
  console.log("[seeder] Starting database seeding...")

  await seedUsers()
  await seedAuditEntries()

  console.log("[seeder] Database seeding completed successfully")
}

// Run seeders if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runSeeders()
    .then(() => {
      console.log("[seeder] Seeding script completed")
      process.exit(0)
    })
    .catch((error: unknown) => {
      console.error("[seeder] Seeding script failed:", error)
      process.exit(1)
    })
}
