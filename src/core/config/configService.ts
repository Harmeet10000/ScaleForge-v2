import { Config, Context, Effect, Redacted } from "effect"

export class AppConfig extends Context.Service<AppConfig>()("AppConfig", {
  effect: Effect.gen(function* () {
    // Server
    const port = yield* Config.integer("PORT").pipe(Config.withDefault(3000))
    const nodeEnv = yield* Config.string("NODE_ENV").pipe(Config.withDefault("development"))
    const hostname = yield* Config.string("HOSTNAME").pipe(Config.withDefault("0.0.0.0"))
    const serverId = yield* Config.string("SERVER_ID").pipe(Config.withDefault("unknown"))
    const logLevel = yield* Config.string("LOG_LEVEL").pipe(Config.withDefault("info"))

    // URLs
    const frontendUrl = yield* Config.string("FRONTEND_URL")
    const serverUrl = yield* Config.string("SERVER_URL")

    // MongoDB
    const mongoUri = yield* Config.string("DATABASE")
    const dbPoolSize = yield* Config.integer("DB_POOL_SIZE").pipe(Config.withDefault(10))

    // PostgreSQL (Neon)
    const postgresUrl = yield* Config.string("POSTGRES_DATABASE_URL")

    // Redis
    const redisHost = yield* Config.string("REDIS_HOST")
    const redisPort = yield* Config.integer("REDIS_PORT").pipe(Config.withDefault(6379))
    const redisUsername = yield* Config.string("REDIS_USERNAME").pipe(Config.withDefault(""))
    const redisPassword = yield* Config.redacted("REDIS_PASSWORD")

    // Auth tokens
    const accessTokenSecret = yield* Config.redacted("ACCESS_TOKEN_SECRET")
    const refreshTokenSecret = yield* Config.redacted("REFRESH_TOKEN_SECRET")
    const accessTokenExpiry = yield* Config.string("ACCESS_TOKEN_EXPIRY").pipe(
      Config.withDefault("15m")
    )
    const refreshTokenExpiry = yield* Config.string("REFRESH_TOKEN_EXPIRY").pipe(
      Config.withDefault("7d")
    )

    // RabbitMQ
    const rabbitmqUrl = yield* Config.string("RABBITMQ_URL").pipe(
      Config.withDefault("amqp://localhost")
    )

    // S3 / Storage
    const s3AccessKey = yield* Config.redacted("ACCESS_KEY").pipe(
      Config.withDefault(Redacted.make(""))
    )
    const s3SecretAccessKey = yield* Config.redacted("SECRET_ACCESS_KEY").pipe(
      Config.withDefault(Redacted.make(""))
    )
    const s3BucketName = yield* Config.string("BUCKET_NAME").pipe(Config.withDefault(""))
    const s3BucketRegion = yield* Config.string("BUCKET_REGION").pipe(
      Config.withDefault("us-east-1")
    )

    // Elasticsearch
    const elasticsearchHost = yield* Config.string("ELASTICSEARCH_HOST").pipe(
      Config.withDefault("")
    )
    const elasticsearchApiKey = yield* Config.redacted("ELASTICSEARCH_API_KEY").pipe(
      Config.withDefault(Redacted.make(""))
    )

    // Gemini AI
    const geminiApiKey = yield* Config.redacted("GEMINI_API_KEY").pipe(
      Config.withDefault(Redacted.make(""))
    )

    // Kafka
    const kafkaBroker = yield* Config.string("KAFKA_BROKER").pipe(Config.withDefault(""))
    const kafkaClientId = yield* Config.string("KAFKA_CLIENT_ID").pipe(Config.withDefault(""))
    const kafkaGroupId = yield* Config.string("KAFKA_GROUP_ID").pipe(Config.withDefault(""))
    const kafkaTopic = yield* Config.string("KAFKA_TOPIC").pipe(Config.withDefault(""))
    const kafkaUsername = yield* Config.string("KAFKA_USERNAME").pipe(Config.withDefault(""))
    const kafkaPassword = yield* Config.redacted("KAFKA_PASSWORD").pipe(
      Config.withDefault(Redacted.make(""))
    )
    const kafkaSaslMechanism = yield* Config.string("KAFKA_SASL_MECHANISM").pipe(
      Config.withDefault("plain")
    )
    const kafkaSsl = yield* Config.boolean("KAFKA_SSL").pipe(Config.withDefault(false))

    // Email (Resend)
    const resendKey = yield* Config.redacted("RESEND_KEY").pipe(
      Config.withDefault(Redacted.make(""))
    )

    // Novu (push/in-app notifications)
    const novuApiKey = yield* Config.redacted("NOVU_API_KEY").pipe(
      Config.withDefault(Redacted.make(""))
    )

    // Observability
    const lokiHost = yield* Config.string("LOKI_HOST").pipe(Config.withDefault(""))

    return {
      port,
      nodeEnv,
      hostname,
      serverId,
      logLevel,
      isProduction: nodeEnv === "production",
      isDevelopment: nodeEnv === "development",
      urls: { frontend: frontendUrl, server: serverUrl },
      mongo: { uri: mongoUri, poolSize: dbPoolSize },
      postgres: { url: postgresUrl },
      redis: { host: redisHost, port: redisPort, username: redisUsername, password: redisPassword },
      auth: {
        accessTokenSecret,
        refreshTokenSecret,
        accessTokenExpiry,
        refreshTokenExpiry,
      },
      rabbitmq: { url: rabbitmqUrl },
      s3: {
        accessKey: s3AccessKey,
        secretAccessKey: s3SecretAccessKey,
        bucketName: s3BucketName,
        bucketRegion: s3BucketRegion,
      },
      elasticsearch: { host: elasticsearchHost, apiKey: elasticsearchApiKey },
      gemini: { apiKey: geminiApiKey },
      kafka: {
        broker: kafkaBroker,
        clientId: kafkaClientId,
        groupId: kafkaGroupId,
        topic: kafkaTopic,
        username: kafkaUsername,
        password: kafkaPassword,
        saslMechanism: kafkaSaslMechanism,
        ssl: kafkaSsl,
      },
      email: { resendKey },
      novu: { apiKey: novuApiKey },
      observability: { lokiHost },
    } as const
  }),
}) {}
