/**
 * src/db/seeders/auditSeeder.ts
 *
 * Seeds initial audit entries into the database using a direct Neon connection.
 */
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { eq } from "drizzle-orm"
import { auditEntries } from "../schema/auditSchema.ts"
import { users } from "../schema/userSchema.ts"

const getDatabaseUrl = (): string => {
  const url = process.env["POSTGRES_DATABASE_URL"]
  if (!url) throw new Error("POSTGRES_DATABASE_URL env var is not set")
  return url
}

export const seedAuditEntries = async (): Promise<void> => {
  const db = drizzle(neon(getDatabaseUrl()))

  console.log("[seeder] Seeding audit entries...")

  // Get admin user for audit entries
  const [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.emailAddress, "admin@example.com"))
    .limit(1)

  if (!adminUser) {
    console.warn("[seeder] Admin user not found, skipping audit seeding")
    return
  }

  const userId = adminUser.id

  // Sample audit entries
  const entries = await db
    .insert(auditEntries)
    .values([
      {
        entityType: "user",
        entityId: userId,
        operation: "CREATE",
        status: "success",
        userId,
        ipAddress: "127.0.0.1",
        userAgent: "Seeder Script",
        requestId: "seed-001",
        newData: { action: "User account created", details: "Admin user account created during seeding" },
        metadata: { source: "seeder", version: "1.0.0" },
        tags: ["seeding", "user-creation"],
      },
      {
        entityType: "system",
        entityId: userId,
        operation: "SEED",
        status: "success",
        userId,
        ipAddress: "127.0.0.1",
        userAgent: "Seeder Script",
        requestId: "seed-002",
        newData: { action: "Database seeding completed", details: "Initial data seeding completed" },
        metadata: { source: "seeder", version: "1.0.0", timestamp: new Date().toISOString() },
        tags: ["seeding", "system-initialization"],
      },
    ])
    .returning()

  console.log(`[seeder] Audit entries created: ${entries.length}`)
  console.log("[seeder] Audit seeding completed")
}
