import { Data } from "effect"

export class MongoConnectionError extends Data.TaggedError("MongoConnectionError")<{
  readonly cause: unknown
}> {}

export class PostgresConnectionError extends Data.TaggedError("PostgresConnectionError")<{
  readonly cause: unknown
}> {}

export class PostgresQueryError extends Data.TaggedError("PostgresQueryError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export class RedisConnectionError extends Data.TaggedError("RedisConnectionError")<{
  readonly cause: unknown
}> {}

export class RedisCommandError extends Data.TaggedError("RedisCommandError")<{
  readonly command: string
  readonly cause: unknown
}> {}

export class RabbitMQConnectionError extends Data.TaggedError("RabbitMQConnectionError")<{
  readonly cause: unknown
}> {}

export class RabbitMQPublishError extends Data.TaggedError("RabbitMQPublishError")<{
  readonly exchange: string
  readonly routingKey: string
  readonly cause: unknown
}> {}

export class EmailSendError extends Data.TaggedError("EmailSendError")<{
  readonly to: readonly string[]
  readonly subject: string
  readonly cause: unknown
}> {}

export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

export class HealthCheckError extends Data.TaggedError("HealthCheckError")<{
  readonly component: string
  readonly cause: unknown
}> {}
