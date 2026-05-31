/**
 * src/db/seeders/userSeeder.ts
 *
 * Seeds initial users into the database using a direct Neon connection.
 */
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { users } from "../schema/userSchema.ts"

const getDatabaseUrl = (): string => {
  const url = process.env["POSTGRES_DATABASE_URL"]
  if (!url) throw new Error("POSTGRES_DATABASE_URL env var is not set")
  return url
}

export const seedUsers = async (): Promise<void> => {
  const db = drizzle(neon(getDatabaseUrl()))

  console.log("[seeder] Seeding users...")

  // Check if admin user already exists
  const existingAdmin = await db
    .select()
    .from(users)
    .where(eq(users.emailAddress, "admin@example.com"))
    .limit(1)

  if (existingAdmin.length > 0) {
    console.log("[seeder] Admin user already exists, skipping user seeding")
    return
  }

  // Hash passwords
  const hashedPassword = await bcrypt.hash("Admin@123", 12)

  // Create admin user
  const [insertedUser] = await db
    .insert(users)
    .values({
      name: "System Administrator",
      emailAddress: "admin@example.com",
      password: hashedPassword,
      role: "admin",
      isActive: true,
      isVerified: true,
      accountConfirmation: {
        status: true,
        code: null,
        token: null,
        timestamp: new Date().toISOString(),
      },
      profile: {
        avatar: null,
        bio: "System Administrator",
        location: "System",
        website: null,
      },
      security: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        loginAttempts: 0,
        lockUntil: null,
        lastLogin: null,
        ipWhitelist: [],
      },
      preferences: {
        language: "en",
        timezone: "UTC",
        notifications: { email: true, push: true, sms: false },
      },
    })
    .returning()

  console.log(`[seeder] Admin user created: ${insertedUser!.id} (${insertedUser!.emailAddress})`)

  // Create test user
  const testUserPassword = await bcrypt.hash("Test@123", 12)
  const [insertedTestUser] = await db
    .insert(users)
    .values({
      name: "Test User",
      emailAddress: "test@example.com",
      password: testUserPassword,
      role: "user",
      isActive: true,
      isVerified: true,
      accountConfirmation: { status: true, code: null, token: null, timestamp: new Date().toISOString() },
    })
    .returning()

  console.log(`[seeder] Test user created: ${insertedTestUser!.id} (${insertedTestUser!.emailAddress})`)
  console.log("[seeder] User seeding completed")
}
