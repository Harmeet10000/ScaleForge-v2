/**
 * src/workers/shared/workerLayer.ts
 *
 * Lightweight Effect layer for background workers.
 * Intentionally excludes: Mongo, HTTP server, Swagger, Auth, Sentry.
 * Keeps startup fast and memory small for process-per-worker deployment.
 *
 * Dependency order (LIFO finalizer order):
 *   AppConfig → Postgres → Redis → RabbitMQ → Email → Metrics → Tracing → Logger → WebhookPublisher
 */

import { Layer } from "effect"
import { AppConfigLive } from "../../core/config/configService.ts"
import { PostgresServiceLive } from "../../infra/postgres/postgresService.ts"
import { RedisServiceLive } from "../../infra/redis/redisService.ts"
import { RabbitMQServiceLive } from "../../infra/rabbitmq/rabbitmqService.ts"
import { EmailServiceLive } from "../../infra/email/emailService.ts"
import { PinoLoggerLayer } from "../../infra/logger/pinoLogger.ts"
import { MetricsServiceLive } from "../../infra/telemetry/metricsService.ts"
import { TracingServiceLive } from "../../infra/telemetry/tracingService.ts"
import { WebhookPublisherLive } from "../../infra/webhooks/webhookPublisher.ts"

// Each service needs AppConfig provided at its layer boundary.
const PostgresLayer = PostgresServiceLive.pipe(Layer.provide(AppConfigLive))
const RedisLayer = RedisServiceLive.pipe(Layer.provide(AppConfigLive))
const RabbitMQLayer = RabbitMQServiceLive.pipe(Layer.provide(AppConfigLive))
const EmailLayer = EmailServiceLive.pipe(Layer.provide(AppConfigLive))
const MetricsLayer = MetricsServiceLive
const TracingLayer = TracingServiceLive.pipe(Layer.provide(AppConfigLive))
// PinoLoggerLayer reads LOG_LEVEL/NODE_ENV from process.env — no AppConfig needed
const LoggerLayer = PinoLoggerLayer

// WebhookPublisher needs both Postgres and RabbitMQ (already provided via AppConfig)
const WebhookPublisherLayer = WebhookPublisherLive.pipe(
  Layer.provide(Layer.merge(PostgresLayer, RabbitMQLayer)),
)

/**
 * WorkerLayer — the single composed layer for all worker processes.
 *
 * Logger is rightmost so its finalizer runs last (LIFO), ensuring log
 * flushing outlives all other service teardowns.
 */
export const WorkerLayer = Layer.mergeAll(
  PostgresLayer,
  RedisLayer,
  RabbitMQLayer,
  EmailLayer,
  MetricsLayer,
  TracingLayer,
  LoggerLayer,
  WebhookPublisherLayer,
)
