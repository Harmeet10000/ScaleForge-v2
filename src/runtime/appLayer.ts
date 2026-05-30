/**
 * src/runtime/appLayer.ts
 *
 * The single composed Layer that provides ALL services to the app.
 * Dependency rule: core → infra → features → here
 *
 * Nothing in this file imports from features or app/; it only composes
 * infra-layer exports and config.
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

// All infra services need AppConfig → provide it to the group.
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

// Logger layer also needs AppConfig.
const LoggerLayer = PinoLoggerLayer.pipe(Layer.provide(AppConfigLive))

export const AppLayer = Layer.mergeAll(InfraLayer, LoggerLayer)
