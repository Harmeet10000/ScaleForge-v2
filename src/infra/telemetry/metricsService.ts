import { Context, Effect, Layer } from "effect"
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client"

export interface MetricsService {
  readonly registry: Registry
  readonly httpRequestDuration: Histogram
  readonly dbQueryDuration: Histogram
  readonly messagesPublished: Counter
}

export const MetricsService = Context.Service<MetricsService>("@infra/MetricsService")

const make = Effect.sync(() => {
  const registry = new Registry()
  collectDefaultMetrics({ register: registry })

  const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  })

  const dbQueryDuration = new Histogram({
    name: "db_query_duration_seconds",
    help: "Database query latency in seconds",
    labelNames: ["db", "operation"] as const,
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [registry],
  })

  const messagesPublished = new Counter({
    name: "rabbitmq_messages_published_total",
    help: "Total RabbitMQ messages published",
    labelNames: ["exchange", "routing_key"] as const,
    registers: [registry],
  })

  return MetricsService.of({ registry, httpRequestDuration, dbQueryDuration, messagesPublished })
})

export const MetricsServiceLive = Layer.effect(MetricsService, make)
