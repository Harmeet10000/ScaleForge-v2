/**
 * src/db/seeders/userSeeder.ts
 *
 * Seeds initial users into the database using a direct Neon connection.
 */
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { users } from "../schema/userSchema.ts"
import { PinoLoggerLayer } from "../../infra/logger/pinoLogger.ts"

const getDatabaseUrl = (): string => {
  const url = process.env["POSTGRES_DATABASE_URL"]
  if (!url) throw new Error("POSTGRES_DATABASE_URL env var is not set")
  return url
}

export const seedUsers = async (): Promise<void> => {
  const program = Effect.gen(function* () {
    const db = drizzle(neon(getDatabaseUrl()))

    yield* Effect.log("[seeder] Seeding users...")

    // Check if admin user already exists
    const existingAdmin = yield* Effect.tryPromise(() =>
      db
        .select()
        .from(users)
        .where(eq(users.emailAddress, "admin@example.com"))
        .limit(1),
    )

    if (existingAdmin.length > 0) {
      yield* Effect.log("[seeder] Admin user already exists, skipping user seeding")
      return
    }

    // Hash passwords
    const hashedPassword = yield* Effect.tryPromise(() => bcrypt.hash("Admin@123", 12))

    // Create admin user
    const insertedUsers = yield* Effect.tryPromise(() =>
      db
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
        .returning(),
    )
    const insertedUser = insertedUsers[0]

    yield* Effect.log(
      `[seeder] Admin user created: ${insertedUser!.id} (${insertedUser!.emailAddress})`,
    )

    // Create test user
    const testUserPassword = yield* Effect.tryPromise(() => bcrypt.hash("Test@123", 12))
    const insertedTestUsers = yield* Effect.tryPromise(() =>
      db
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
        .returning(),
    )
    const insertedTestUser = insertedTestUsers[0]

    yield* Effect.log(
      `[seeder] Test user created: ${insertedTestUser!.id} (${insertedTestUser!.emailAddress})`,
    )
    yield* Effect.log("[seeder] User seeding completed")
  }).pipe(Effect.provide(PinoLoggerLayer))

  await Effect.runPromise(program)
}
