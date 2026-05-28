# Graph Report - .  (2026-05-28)

## Corpus Check
- 109 files · ~114,775 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 739 nodes · 1141 edges · 48 communities (43 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Search Constants|Search Constants]]
- [[_COMMUNITY_Error Handling & Elasticsearch|Error Handling & Elasticsearch]]
- [[_COMMUNITY_Notification Constants & Validation|Notification Constants & Validation]]
- [[_COMMUNITY_S3 Storage Module|S3 Storage Module]]
- [[_COMMUNITY_Auth Controller|Auth Controller]]
- [[_COMMUNITY_Search & Embeddings|Search & Embeddings]]
- [[_COMMUNITY_Audit Data Model|Audit Data Model]]
- [[_COMMUNITY_Notification Service|Notification Service]]
- [[_COMMUNITY_Audit Controller|Audit Controller]]
- [[_COMMUNITY_Auth Service|Auth Service]]
- [[_COMMUNITY_Health Module|Health Module]]
- [[_COMMUNITY_Payment Constants|Payment Constants]]
- [[_COMMUNITY_Gemini AI Controller|Gemini AI Controller]]
- [[_COMMUNITY_Redis Cache Functions|Redis Cache Functions]]
- [[_COMMUNITY_App Bootstrap & Connections|App Bootstrap & Connections]]
- [[_COMMUNITY_K8s Observability Stack|K8s Observability Stack]]
- [[_COMMUNITY_Notification Repository|Notification Repository]]
- [[_COMMUNITY_Search Index Config|Search Index Config]]
- [[_COMMUNITY_Audit Utilities|Audit Utilities]]
- [[_COMMUNITY_Express Middleware|Express Middleware]]
- [[_COMMUNITY_Postgres & Drizzle|Postgres & Drizzle]]
- [[_COMMUNITY_RabbitMQ Consumer|RabbitMQ Consumer]]
- [[_COMMUNITY_OpenFGA Examples|OpenFGA Examples]]
- [[_COMMUNITY_Auth Middleware & Constants|Auth Middleware & Constants]]
- [[_COMMUNITY_Health E2E Tests|Health E2E Tests]]
- [[_COMMUNITY_RabbitMQ & Kafka Examples|RabbitMQ & Kafka Examples]]
- [[_COMMUNITY_RabbitMQ Producer|RabbitMQ Producer]]
- [[_COMMUNITY_Winston Logger|Winston Logger]]
- [[_COMMUNITY_Redis Advanced Examples|Redis Advanced Examples]]
- [[_COMMUNITY_Transaction Manager|Transaction Manager]]
- [[_COMMUNITY_Audit Constants|Audit Constants]]
- [[_COMMUNITY_API Features Utility|API Features Utility]]
- [[_COMMUNITY_Email Templates|Email Templates]]
- [[_COMMUNITY_Auth Refresh Tokens|Auth Refresh Tokens]]
- [[_COMMUNITY_Billing Integration Tests|Billing Integration Tests]]
- [[_COMMUNITY_Kafka Connection|Kafka Connection]]
- [[_COMMUNITY_Health Unit Tests|Health Unit Tests]]
- [[_COMMUNITY_Async Local Storage|Async Local Storage]]
- [[_COMMUNITY_Device Model|Device Model]]
- [[_COMMUNITY_OpenFGA Connection|OpenFGA Connection]]
- [[_COMMUNITY_Health Integration Tests|Health Integration Tests]]
- [[_COMMUNITY_Notification Preferences|Notification Preferences]]
- [[_COMMUNITY_Novu Connection|Novu Connection]]
- [[_COMMUNITY_Cache Key Helpers|Cache Key Helpers]]
- [[_COMMUNITY_Payment Schema (Drizzle)|Payment Schema (Drizzle)]]

## God Nodes (most connected - your core abstractions)
1. `Logger` - 39 edges
2. `httpError()` - 19 edges
3. `ScaleForge Production-Grade Monolith Template` - 13 edges
4. `httpResponse()` - 11 edges
5. `globalErrorHandler()` - 8 edges
6. `runAllExamples()` - 8 edges
7. `Resendmail()` - 7 edges
8. `APIFeatures` - 7 edges
9. `calculatePagination()` - 6 edges
10. `protect` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Health Feature Testing Strategy` --references--> `ScaleForge Production-Grade Monolith Template`  [INFERRED]
  tests/testing-plan.md → README.md
- `prom-client Metrics Library` --shares_data_with--> `Prometheus K8s Deployment`  [INFERRED]
  README.md → infra/aws/k8s/observability/prometheus.yaml
- `ScaleForge Production-Grade Monolith Template` --references--> `Loki Log Aggregation K8s Deployment`  [EXTRACTED]
  README.md → infra/aws/k8s/observability/loki.yaml
- `ScaleForge Production-Grade Monolith Template` --references--> `Prometheus K8s Deployment`  [EXTRACTED]
  README.md → infra/aws/k8s/observability/prometheus.yaml
- `rateLimitHandler()` --calls--> `httpResponse()`  [EXTRACTED]
  src/app/middlewares/serverMiddleware.js → src/app/utils/httpResponse.js

## Hyperedges (group relationships)
- **K8s Observability Stack** — prometheus_k8s, loki_k8s, grafana_k8s, fluentbit_k8s, alertmanager_k8s [EXTRACTED 1.00]
- **Event-Driven Architecture** — readme_rabbitmq, readme_kafka, readme_novu [INFERRED 0.75]
- **Data & Storage Layer** — readme_mongodb, readme_redis, readme_elasticsearch, readme_aws_s3 [INFERRED 0.80]

## Communities (48 total, 5 thin omitted)

### Community 0 - "Search Constants"
Cohesion: 0.06
Nodes (51): AGGREGATION_TYPES, ANALYZER_NAMES, CACHE_TYPES, FIELD_NAMES, INDEX_NAMES, PAGINATION_TYPES, PIPELINE_PROCESSORS, SEARCH_CONFIG (+43 more)

### Community 1 - "Error Handling & Elasticsearch"
Cohesion: 0.07
Nodes (38): client, connectElasticsearch, disconnectElasticsearch, globalErrorHandler(), handleCastErrorDB(), handleDuplicateFieldsDB(), handleJWTError(), handleJWTExpiredError() (+30 more)

### Community 2 - "Notification Constants & Validation"
Cohesion: 0.07
Nodes (39): validateJoiSchema(), DEVICE_TYPES, NOTIFICATION_CHANNELS, NOTIFICATION_ERROR_CODES, NOTIFICATION_MESSAGES, NOTIFICATION_PRIORITIES, NOTIFICATION_STATUS, addSubscribersToTopic (+31 more)

### Community 3 - "S3 Storage Module"
Cohesion: 0.09
Nodes (38): abortMultipart, checkObjectExists, completeMultipart, copyObject, deleteObject, generateBatchUploadUrls, generateMultipartParts, generateUploadUrl (+30 more)

### Community 4 - "Auth Controller"
Cohesion: 0.08
Nodes (30): changePassword, confirmation, forgotPassword, genNewAccessToken, googleOAuthLoginHandler, googleOAuthSignupHandler, login, logout (+22 more)

### Community 5 - "Search & Embeddings"
Cohesion: 0.06
Nodes (27): ai, generateBatchEmbeddings, generateEmbedding, bulkIndexDocuments, calculatePagination(), checkSearchHealth, createIngestPipeline, createSearchIndex (+19 more)

### Community 6 - "Audit Data Model"
Cohesion: 0.07
Nodes (29): Audit, auditSchema, now, query, aggregateAuditEntries, bulkCreateAuditEntries, countAuditEntries, createAuditEntry (+21 more)

### Community 7 - "Notification Service"
Cohesion: 0.06
Nodes (28): addSubscribersToTopic, cancelScheduledNotification, createNotificationTopic, createSubscriber, deleteNotification, deleteSubscriber, getDeliveryMetrics, getNotificationHistory (+20 more)

### Community 8 - "Audit Controller"
Cohesion: 0.14
Nodes (22): createAuditEntry, getAuditByCorrelationId, getAuditDashboard, getAuditTrailByCorrelationId, getEntityAuditTrail, getOperationStats, getOrganizationAuditTrail, getUserAuditTrail (+14 more)

### Community 9 - "Auth Service"
Cohesion: 0.11
Nodes (23): changeUserPassword, confirmAccount, googleOAuthLogin, googleOAuthSignup, loginUser, logoutUser, refreshUserToken, registerUser (+15 more)

### Community 10 - "Health Module"
Cohesion: 0.14
Nodes (18): health, self(), router, rateLimitHandler(), cpuPercent, freeMemory, health, heapTotal (+10 more)

### Community 11 - "Payment Constants"
Cohesion: 0.10
Nodes (18): DEFAULT_VALUES, EAuditOperationType, EAuditStatus, EBillingCycle, ECurrency, EInvoiceDelivery, EPaymentMethodType, EPaymentStatus (+10 more)

### Community 12 - "Gemini AI Controller"
Cohesion: 0.18
Nodes (18): createChatHandler, embedTextHandler, generateImageHandler, generateJsonHandler, generateMultimodalHandler, generateTextHandler, generateTextStreamHandler, generateVideoHandler (+10 more)

### Community 13 - "Redis Cache Functions"
Cohesion: 0.10
Nodes (20): addToBloomFilter, checkBloomFilter, createBloomFilter, createSearchIndex, deleteCache, deleteHashField, deleteList, deleteSearchIndex (+12 more)

### Community 14 - "App Bootstrap & Connections"
Cohesion: 0.16
Nodes (11): server, connectDB, disconnectMongo, disconnectPostgres, createConnection(), disconnectRabbitMQ, retryWithBackoff(), connectRedis (+3 more)

### Community 15 - "K8s Observability Stack"
Cohesion: 0.13
Nodes (19): Alertmanager, Fluent Bit Log Forwarder, Grafana Dashboards, Loki Log Aggregation K8s Deployment, Prometheus K8s Deployment, JWT Authentication System, AWS S3 Cloud Storage, Elasticsearch Search & Analytics (+11 more)

### Community 16 - "Notification Repository"
Cohesion: 0.12
Nodes (16): NotificationLog, notificationLogSchema, createBroadcastLog, deactivateDevice, getDeliveryMetricsAggregation, getDevicesByType, getNotificationHistory, getNotificationStatsAggregation (+8 more)

### Community 17 - "Search Index Config"
Cohesion: 0.12
Nodes (15): defaultIndexSettings, defaultPipelineConfigurations, documentMapping, edgeNgramAnalyzer, edgeNgramFilter, fuzzyAnalyzer, indexConfigurations, logMapping (+7 more)

### Community 18 - "Audit Utilities"
Cohesion: 0.14
Nodes (12): auditApiKeyOperation, auditEntityChange, auditFailedOperation, auditPaymentOperation, auditPlugin(), auditSubscriptionOperation, auditUserOperation, auditWebhookOperation (+4 more)

### Community 19 - "Express Middleware"
Cohesion: 0.23
Nodes (11): app, correlationIdMiddleware(), corsOptions, __dirname, extLimiter, __filename, limiter, metricsMiddleware (+3 more)

### Community 20 - "Postgres & Drizzle"
Cohesion: 0.30
Nodes (7): connectPostgres, getDB(), auditEntries, users, seedAuditEntries(), runSeeders, seedUsers()

### Community 21 - "RabbitMQ Consumer"
Cohesion: 0.18
Nodes (9): bindQueue, closeConsumer, consumeQueue, createBoundConsumer, createConsumer, initializeConsumer, setupPriorityQueue, setupRetryQueue (+1 more)

### Community 22 - "OpenFGA Examples"
Cohesion: 0.36
Nodes (8): advancedQueriesExample(), bulkOperationsExample(), documentExample(), lowLevelExample(), organizationExample(), ownershipTransferExample(), projectExample(), runAllExamples()

### Community 23 - "Auth Middleware & Constants"
Cohesion: 0.22
Nodes (6): ALREADY_EXIST(), NOT_FOUND(), protect, getHash, setHash, router

### Community 24 - "Health E2E Tests"
Cohesion: 0.20
Nodes (9): healthCheckRequests, invalidEndpoints, methods, requests, responseTime, responseTimeHeader, results, startTime (+1 more)

### Community 25 - "RabbitMQ & Kafka Examples"
Cohesion: 0.22
Nodes (5): deadLetterExchangeExample, runTaskQueueExample, setupConsumers, setupProducer, Logger

### Community 26 - "RabbitMQ Producer"
Cohesion: 0.22
Nodes (7): closeProducer, createProducer, ExchangeTypes, initializeProducer, publishMessage, publishWithRetry, scheduleMessage

### Community 27 - "Winston Logger"
Cohesion: 0.22
Nodes (5): consoleLogFormat, __dirname, fileLogFormat, __filename, levels

### Community 28 - "Redis Advanced Examples"
Cohesion: 0.25
Nodes (7): checkRateLimit, cleanupRedisResources, getRateLimiterStatus, searchUsers, searchUsersWithRateLimit, setupRateLimiter, setupUserSearchIndex

### Community 29 - "Transaction Manager"
Cohesion: 0.25
Nodes (3): executeInTransaction, RETRY_CONFIG, TRANSACTION_TIMEOUTS

### Community 30 - "Audit Constants"
Cohesion: 0.25
Nodes (7): AUDIT_CONFIG, AUDIT_EVENTS, AUDIT_STATUS, ENTITY_TYPES, OPERATION_TYPES, RETENTION_POLICIES, SENSITIVE_FIELDS

### Community 32 - "Email Templates"
Cohesion: 0.61
Nodes (6): Resendmail(), getAccountConfirmationTemplate(), getChangeUserPasswordTemplate(), getConfirmationSuccessTemplate(), getRequestPasswordResetTemplate(), getResetUserPasswordTemplate()

### Community 33 - "Auth Refresh Tokens"
Cohesion: 0.33
Nodes (5): RefreshToken, refreshTokenSchema, createRefreshToken, deleteRefreshToken, findRefreshToken

### Community 34 - "Billing Integration Tests"
Cohesion: 0.29
Nodes (6): billingProfileData, invalidPaymentMethodData, invoiceData, paymentMethodData, prorationData, recurringData

### Community 35 - "Kafka Connection"
Cohesion: 0.29
Nodes (6): connectKafkaConsumer, connectKafkaProducer, consumer, disconnectKafka, kafka, producer

### Community 36 - "Health Unit Tests"
Cohesion: 0.33
Nodes (5): afterTime, beforeTime, expectedHealthResponse, expectedSelfResponse, testTime

### Community 37 - "Async Local Storage"
Cohesion: 0.47
Nodes (4): asyncLocalStorage, getContext(), getCorrelationId(), getUser()

### Community 38 - "Device Model"
Cohesion: 0.40
Nodes (4): cutoffDate, Device, deviceSchema, query

### Community 39 - "OpenFGA Connection"
Cohesion: 0.67
Nodes (3): createConfig(), fgaClient, getFgaClient()

### Community 40 - "Health Integration Tests"
Cohesion: 0.50
Nodes (3): requests, startTime, timestamp

## Knowledge Gaps
- **344 isolated node(s):** `runSeeders`, `payments`, `app`, `server`, `scheduleNotification` (+339 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Logger` connect `RabbitMQ & Kafka Examples` to `Error Handling & Elasticsearch`, `S3 Storage Module`, `Auth Controller`, `Search & Embeddings`, `Audit Data Model`, `Notification Service`, `Auth Service`, `Gemini AI Controller`, `Redis Cache Functions`, `App Bootstrap & Connections`, `Audit Utilities`, `Express Middleware`, `Postgres & Drizzle`, `RabbitMQ Consumer`, `OpenFGA Examples`, `Auth Middleware & Constants`, `RabbitMQ Producer`, `Winston Logger`, `Redis Advanced Examples`, `Transaction Manager`, `Email Templates`, `Kafka Connection`?**
  _High betweenness centrality (0.212) - this node is a cross-community bridge._
- **Why does `httpError()` connect `Error Handling & Elasticsearch` to `Search Constants`, `Notification Constants & Validation`, `S3 Storage Module`, `Auth Controller`, `Notification Service`, `Audit Controller`, `Auth Service`, `Express Middleware`, `Auth Middleware & Constants`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `httpResponse()` connect `Health Module` to `Search Constants`, `Notification Constants & Validation`, `S3 Storage Module`, `Auth Controller`, `Audit Controller`, `Gemini AI Controller`, `Express Middleware`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `runSeeders`, `payments`, `app` to the rest of the system?**
  _344 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Search Constants` be split into smaller, more focused modules?**
  _Cohesion score 0.06103896103896104 - nodes in this community are weakly interconnected._
- **Should `Error Handling & Elasticsearch` be split into smaller, more focused modules?**
  _Cohesion score 0.06553911205073996 - nodes in this community are weakly interconnected._
- **Should `Notification Constants & Validation` be split into smaller, more focused modules?**
  _Cohesion score 0.06755260243632337 - nodes in this community are weakly interconnected._