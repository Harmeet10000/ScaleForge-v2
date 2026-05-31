/**
 * src/runtime/appLayer.ts
 *
 * The single composed Layer that provides ALL services to the app.
 * Dependency rule: core → infra → features → here
 */

import { Layer } from "effect"
import { AppConfigLive } from "../core/config/configService.ts"
import { MongoServiceLive } from "../infra/mongo/mongoService.ts"
import { PostgresServiceLive } from "../infra/postgres/postgresService.ts"
import { RedisServiceLive } from "../infra/redis/redisService.ts"
import { RabbitMQServiceLive } from "../infra/rabbitmq/rabbitmqService.ts"
import { EmailServiceLive } from "../infra/email/emailService.ts"
import { PinoLoggerLayer } from "../infra/logger/pinoLogger.ts"
import { TracingServiceLive } from "../infra/telemetry/tracingService.ts"
import { MetricsServiceLive } from "../infra/telemetry/metricsService.ts"
import { SentryServiceLive } from "../infra/telemetry/sentryService.ts"
import { FeatureFlagServiceLive } from "../infra/featureFlags/featureFlagService.ts"
import { TokenServiceLive } from "../app/features/auth2/tokenService.ts"
import { PasswordServiceLive } from "../app/features/auth2/passwordService.ts"
import { AuthServiceLive } from "../app/features/auth2/authService.ts"
import { ApiKeyServiceLive } from "../app/features/auth2/apiKeyService.ts"
import { LeaderboardServiceLive } from "../app/features/leaderboard/leaderboardService.ts"

// ── Infra layer ───────────────────────────────────────────────────────────────
// All infra services get AppConfig provided once at this boundary.
const InfraLayer = Layer.mergeAll(
  MongoServiceLive,
  PostgresServiceLive,
  RedisServiceLive,
  RabbitMQServiceLive,
  EmailServiceLive,
  TracingServiceLive,
  MetricsServiceLive,
  SentryServiceLive,
  FeatureFlagServiceLive,
).pipe(Layer.provide(AppConfigLive))

// ── Auth layer ────────────────────────────────────────────────────────────────
// TokenService needs AppConfig. PasswordService is self-contained.
// AuthService needs Postgres + Token + Password.
const TokenLayer = TokenServiceLive.pipe(Layer.provide(AppConfigLive))
const PwLayer = PasswordServiceLive

const AuthLayer = AuthServiceLive.pipe(
  Layer.provide(Layer.mergeAll(
    PostgresServiceLive.pipe(Layer.provide(AppConfigLive)),
    TokenLayer,
    PwLayer,
  ))
)

// ApiKeyService needs Postgres + AppConfig
const ApiKeyLayer = ApiKeyServiceLive.pipe(
  Layer.provide(Layer.mergeAll(
    PostgresServiceLive.pipe(Layer.provide(AppConfigLive)),
    AppConfigLive,
  ))
)

// LeaderboardService needs Postgres + Redis
const LeaderboardLayer = LeaderboardServiceLive.pipe(
  Layer.provide(Layer.mergeAll(
    PostgresServiceLive.pipe(Layer.provide(AppConfigLive)),
    RedisServiceLive.pipe(Layer.provide(AppConfigLive)),
  ))
)

// ── Logger layer ──────────────────────────────────────────────────────────────
const LoggerLayer = PinoLoggerLayer.pipe(Layer.provide(AppConfigLive))

// ── Root layer ────────────────────────────────────────────────────────────────
export const AppLayer = Layer.mergeAll(
  InfraLayer,
  TokenLayer,
  PwLayer,
  AuthLayer,
  ApiKeyLayer,
  LeaderboardLayer,
  LoggerLayer,
)
