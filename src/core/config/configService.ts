import { Config, Context, Effect, Layer, Redacted } from "effect"

export interface AppConfig {
  readonly port: number
  readonly nodeEnv: string
  readonly hostname: string
  readonly serverId: string
  readonly logLevel: string
  readonly isProduction: boolean
  readonly isDevelopment: boolean
  readonly urls: { readonly frontend: string; readonly server: string }
  readonly mongo: { readonly uri: string; readonly poolSize: number }
  readonly postgres: { readonly url: string }
  readonly redis: {
    readonly host: string
    readonly port: number
    readonly username: string
    readonly password: Redacted.Redacted<string>
  }
  readonly auth: {
    readonly accessTokenSecret: Redacted.Redacted<string>
    readonly refreshTokenSecret: Redacted.Redacted<string>
    readonly accessTokenExpiry: string
    readonly refreshTokenExpiry: string
  }
  readonly rabbitmq: { readonly url: string }
  readonly s3: {
    readonly accessKey: Redacted.Redacted<string>
    readonly secretAccessKey: Redacted.Redacted<string>
    readonly bucketName: string
    readonly bucketRegion: string
  }
  readonly elasticsearch: {
    readonly host: string
    readonly apiKey: Redacted.Redacted<string>
  }
  readonly gemini: { readonly apiKey: Redacted.Redacted<string> }
  readonly kafka: {
    readonly broker: string
    readonly clientId: string
    readonly groupId: string
    readonly topic: string
    readonly username: string
    readonly password: Redacted.Redacted<string>
    readonly saslMechanism: string
    readonly ssl: boolean
  }
  readonly email: { readonly resendKey: Redacted.Redacted<string> }
  readonly novu: { readonly apiKey: Redacted.Redacted<string> }
  readonly observability: { readonly lokiHost: string }
  readonly openfga: {
    readonly apiUrl: string
    readonly storeId: string
    readonly modelId: string
    /** "none" | "api_token" | "client_credentials" */
    readonly credentialsMethod: string
    readonly apiToken: Redacted.Redacted<string>
    readonly tokenIssuer: string
    readonly apiAudience: string
    readonly clientId: string
    readonly clientSecret: Redacted.Redacted<string>
  }
  readonly google: {
    readonly clientId: string
    readonly clientSecret: Redacted.Redacted<string>
    readonly redirectUri: string
  }
  readonly knock: {
    readonly webhookSecret: Redacted.Redacted<string>
  }
}

export const AppConfig = Context.Service<AppConfig>("@config/AppConfig")

const make = Effect.gen(function* () {
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

  // Novu
  const novuApiKey = yield* Config.redacted("NOVU_API_KEY").pipe(
    Config.withDefault(Redacted.make(""))
  )

  // Observability
  const lokiHost = yield* Config.string("LOKI_HOST").pipe(Config.withDefault(""))

  // OpenFGA
  const openfgaApiUrl = yield* Config.string("OPENFGA_API_URL").pipe(Config.withDefault("http://localhost:8080"))
  const openfgaStoreId = yield* Config.string("OPENFGA_STORE_ID").pipe(Config.withDefault(""))
  const openfgaModelId = yield* Config.string("OPENFGA_MODEL_ID").pipe(Config.withDefault(""))
  const openfgaCredentialsMethod = yield* Config.string("OPENFGA_CREDENTIALS_METHOD").pipe(
    Config.withDefault("none")
  )
  const openfgaApiToken = yield* Config.redacted("OPENFGA_API_TOKEN").pipe(
    Config.withDefault(Redacted.make(""))
  )
  const openfgaTokenIssuer = yield* Config.string("OPENFGA_API_TOKEN_ISSUER").pipe(
    Config.withDefault("")
  )
  const openfgaApiAudience = yield* Config.string("OPENFGA_API_AUDIENCE").pipe(
    Config.withDefault("")
  )
  const openfgaClientId = yield* Config.string("OPENFGA_CLIENT_ID").pipe(Config.withDefault(""))
  const openfgaClientSecret = yield* Config.redacted("OPENFGA_CLIENT_SECRET").pipe(
    Config.withDefault(Redacted.make(""))
  )

  // Google OAuth
  const googleClientId = yield* Config.string("GOOGLE_CLIENT_ID").pipe(Config.withDefault(""))
  const googleClientSecret = yield* Config.redacted("GOOGLE_CLIENT_SECRET").pipe(
    Config.withDefault(Redacted.make(""))
  )
  const googleRedirectUri = yield* Config.string("GOOGLE_REDIRECT_URI").pipe(
    Config.withDefault("http://localhost:3000/api/v1/auth/oauth/google/callback")
  )

  // Knock
  const knockWebhookSecret = yield* Config.redacted("KNOCK_WEBHOOK_SECRET").pipe(
    Config.withDefault(Redacted.make(""))
  )

  return AppConfig.of({
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
    auth: { accessTokenSecret, refreshTokenSecret, accessTokenExpiry, refreshTokenExpiry },
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
    openfga: {
      apiUrl: openfgaApiUrl,
      storeId: openfgaStoreId,
      modelId: openfgaModelId,
      credentialsMethod: openfgaCredentialsMethod,
      apiToken: openfgaApiToken,
      tokenIssuer: openfgaTokenIssuer,
      apiAudience: openfgaApiAudience,
      clientId: openfgaClientId,
      clientSecret: openfgaClientSecret,
    },
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      redirectUri: googleRedirectUri,
    },
    knock: {
      webhookSecret: knockWebhookSecret,
    },
  })
})

export const AppConfigLive = Layer.effect(AppConfig, make)
