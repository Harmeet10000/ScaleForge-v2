-- Migration: 0004_user_schema_alignment
-- Aligns users table with legacy Mongoose model:
--   + provider column (local | google)
--   + oauth_id column (unique, nullable — partial index)
--   + consent column
--   ~ password_reset JSONB: rename timestamp→expiry, remove attempts, add lastResetAt

-- 1. Add provider column
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'local';

-- 2. Add oauth_id column (partial unique index: only enforced when non-null)
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_id_idx
  ON users(oauth_id)
  WHERE oauth_id IS NOT NULL;

-- 3. Add consent column
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Fix password_reset JSONB default: align keys with Mongoose (expiry + lastResetAt)
ALTER TABLE users
  ALTER COLUMN password_reset
  SET DEFAULT '{"token": null, "expiry": null, "lastResetAt": null}';

-- Migrate existing rows with old shape (timestamp/attempts keys → expiry/lastResetAt)
UPDATE users
SET password_reset = jsonb_build_object(
  'token',       password_reset->>'token',
  'expiry',      password_reset->>'timestamp',
  'lastResetAt', NULL
)
WHERE (password_reset ? 'timestamp') AND NOT (password_reset ? 'expiry');

-- 5. Ensure account_confirmation has timestamp key in all rows
UPDATE users
SET account_confirmation = account_confirmation || '{"timestamp": null}'::jsonb
WHERE account_confirmation IS NOT NULL AND NOT (account_confirmation ? 'timestamp');
