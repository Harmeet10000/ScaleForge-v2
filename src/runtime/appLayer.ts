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
import { OpenFgaServiceLive } from "../app/features/authz/openFgaService.ts"
import { GeminiServiceLive } from "../infra/gemini/geminiService.ts"
import { SearchServiceLive } from "../app/features/search2/searchService.ts"
import { OAuthServiceLive } from "../app/features/auth2/oauthService.ts"
import { WebhookPublisherLive } from "../infra/webhooks/webhookPublisher.ts"
import { S3ServiceLive } from "../infra/s3/s3Service.ts"

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

// WebhookPublisher depends on RabbitMQ
const WebhookLayer = WebhookPublisherLive.pipe(
  Layer.provide(RabbitMQServiceLive.pipe(Layer.provide(AppConfigLive)))
)

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
    EmailServiceLive.pipe(Layer.provide(AppConfigLive)),
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

// OpenFgaService needs AppConfig only (HTTP client, no DB)
const FgaLayer = OpenFgaServiceLive.pipe(Layer.provide(AppConfigLive))

// GeminiService needs AppConfig only (HTTP client, no DB)
const GeminiLayer = GeminiServiceLive.pipe(Layer.provide(AppConfigLive))

// OAuthService needs AppConfig only (HTTP client, no DB)
const OAuthLayer = OAuthServiceLive.pipe(Layer.provide(AppConfigLive))

// SearchService needs Postgres + Redis + Gemini + RabbitMQ
const SearchLayer = SearchServiceLive.pipe(
  Layer.provide(Layer.mergeAll(
    PostgresServiceLive.pipe(Layer.provide(AppConfigLive)),
    RedisServiceLive.pipe(Layer.provide(AppConfigLive)),
    GeminiServiceLive.pipe(Layer.provide(AppConfigLive)),
    RabbitMQServiceLive.pipe(Layer.provide(AppConfigLive)),
  ))
)

// S3Service needs AppConfig only (AWS credentials from config)
const S3Layer = S3ServiceLive.pipe(Layer.provide(AppConfigLive))

// ── Logger layer ──────────────────────────────────────────────────────────────
// PinoLoggerLayer reads from process.env — no AppConfig dependency needed.
const LoggerLayer = PinoLoggerLayer

// ── Root layer ────────────────────────────────────────────────────────────────
export const AppLayer = Layer.mergeAll(
  InfraLayer,
  WebhookLayer,
  S3Layer,
  TokenLayer,
  PwLayer,
  AuthLayer,
  ApiKeyLayer,
  LeaderboardLayer,
  FgaLayer,
  GeminiLayer,
  SearchLayer,
  OAuthLayer,
  LoggerLayer,
)
