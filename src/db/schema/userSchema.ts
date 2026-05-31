import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  jsonb,
  varchar,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

// ── JSONB shape types ─────────────────────────────────────────────────────────

export interface AccountConfirmation {
  status: boolean
  token: string | null
  code: string | null
  timestamp: string | null
}

export interface PasswordReset {
  token: string | null
  expiry: number | null
  lastResetAt: string | null
}

export interface UserProfileData {
  avatar: string | null
  bio: string | null
  location: string | null
  website: string | null
}

export interface UserSecurity {
  twoFactorEnabled: boolean
  twoFactorSecret: string | null
  loginAttempts: number
  lockUntil: string | null
  lastLogin: string | null
  ipWhitelist: string[]
}

export interface UserPreferences {
  language: string
  timezone: string
  notifications: { email: boolean; push: boolean; sms: boolean }
}

// ── Table ─────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    name: varchar('name', { length: 255 }).notNull(),
    emailAddress: varchar('email_address', { length: 255 }).notNull().unique(),
    password: text('password').notNull(),
    phoneNumber: varchar('phone_number', { length: 20 }),

    // OAuth provider fields — aligns with Mongoose: provider + oauth_id
    provider: varchar('provider', { length: 20 }).notNull().default('local'),
    oauthId: varchar('oauth_id', { length: 255 }),

    // User consent to terms — required in Mongoose model
    consent: boolean('consent').notNull().default(false),

    // Account confirmation — shape aligns with Mongoose accountConfirmation sub-doc
    accountConfirmation: jsonb('account_confirmation').$type<AccountConfirmation>().default({
      status: false,
      token: null,
      code: null,
      timestamp: null,
    }),

    // Password reset — aligns with Mongoose: expiry (ms timestamp) + lastResetAt (ISO string)
    passwordReset: jsonb('password_reset').$type<PasswordReset>().default({
      token: null,
      expiry: null,
      lastResetAt: null,
    }),

    // Profile information
    profile: jsonb('profile').$type<UserProfileData>().default({
      avatar: null,
      bio: null,
      location: null,
      website: null,
    }),

    // Security settings
    security: jsonb('security').$type<UserSecurity>().default({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      loginAttempts: 0,
      lockUntil: null,
      lastLogin: null,
      ipWhitelist: [],
    }),

    // Preferences — timezone lives here (aligns with Mongoose preferences.timezone)
    preferences: jsonb('preferences').$type<UserPreferences>().default({
      language: 'en',
      timezone: 'UTC',
      notifications: { email: true, push: true, sms: false },
    }),

    isActive: boolean('is_active').default(true),
    isVerified: boolean('is_verified').default(false),
    role: varchar('role', { length: 50 }).default('user'),
    organizationId: uuid('organization_id'),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    emailIdx: index('users_email_idx').on(table.emailAddress),
    organizationIdx: index('users_organization_idx').on(table.organizationId),
    roleIdx: index('users_role_idx').on(table.role),
    activeIdx: index('users_active_idx').on(table.isActive),
    createdAtIdx: index('users_created_at_idx').on(table.createdAt),
    providerIdx: index('users_provider_idx').on(table.provider),
  })
);
