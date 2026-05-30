/**
 * src/infra/s3/s3Service.ts
 *
 * AWS S3 Effect service — upload buffers and generate presigned URLs.
 * Uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
 *
 * All operations return typed Effect errors; no raw throws escape the boundary.
 */

import { Context, Effect, Layer, Redacted } from "effect"
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { AppConfig } from "../../core/config/configService.ts"
import { Data } from "effect"

// ── Errors ────────────────────────────────────────────────────────────────────

export class S3UploadError extends Data.TaggedError("S3UploadError")<{
  readonly key: string
  readonly cause: unknown
}> {}

export class S3PresignError extends Data.TaggedError("S3PresignError")<{
  readonly key: string
  readonly cause: unknown
}> {}

export class S3DeleteError extends Data.TaggedError("S3DeleteError")<{
  readonly key: string
  readonly cause: unknown
}> {}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UploadParams {
  readonly key: string
  readonly body: Buffer | Uint8Array | string
  readonly contentType: string
  /** Optional server-side metadata tags */
  readonly metadata?: Record<string, string>
}

export interface PresignParams {
  readonly key: string
  /** Expiry in seconds. Default: 3600 (1 hour) */
  readonly expiresIn?: number
}

export interface S3Service {
  readonly upload: (params: UploadParams) => Effect.Effect<string, S3UploadError>
  readonly presignGet: (params: PresignParams) => Effect.Effect<string, S3PresignError>
  readonly presignPut: (params: PresignParams & { contentType: string }) => Effect.Effect<string, S3PresignError>
  readonly delete: (key: string) => Effect.Effect<void, S3DeleteError>
  readonly exists: (key: string) => Effect.Effect<boolean, S3UploadError>
  /** Convenience: returns the public HTTPS URL (only for public buckets) */
  readonly publicUrl: (key: string) => string
}

export const S3Service = Context.Service<S3Service>("@infra/S3Service")

// ── Implementation ────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const config = yield* AppConfig

  const client = new S3Client({
    region: config.s3.bucketRegion,
    credentials: {
      accessKeyId: Redacted.value(config.s3.accessKey),
      secretAccessKey: Redacted.value(config.s3.secretAccessKey),
    },
  })

  const bucket = config.s3.bucketName

  return S3Service.of({
    upload: ({ key, body, contentType, metadata }) =>
      Effect.tryPromise({
        try: () =>
          client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: body,
              ContentType: contentType,
              Metadata: metadata,
            }),
          ),
        catch: (error) => new S3UploadError({ key, cause: error }),
      }).pipe(
        Effect.map(() => key),
        Effect.tap((k) => Effect.log(`[S3] uploaded ${k}`)),
      ),

    presignGet: ({ key, expiresIn = 3600 }) =>
      Effect.tryPromise({
        try: () =>
          getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
            expiresIn,
          }),
        catch: (error) => new S3PresignError({ key, cause: error }),
      }),

    presignPut: ({ key, expiresIn = 3600, contentType }) =>
      Effect.tryPromise({
        try: () =>
          getSignedUrl(
            client,
            new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
            { expiresIn },
          ),
        catch: (error) => new S3PresignError({ key, cause: error }),
      }),

    delete: (key) =>
      Effect.tryPromise({
        try: () => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
        catch: (error) => new S3DeleteError({ key, cause: error }),
      }).pipe(Effect.asVoid),

    exists: (key) =>
      Effect.tryPromise({
        try: async () => {
          await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
          return true
        },
        catch: (error: unknown) => {
          // HeadObject throws a 404 NotFound — treat as false, re-wrap others
          if (typeof error === "object" && error !== null && "$metadata" in error) {
            const meta = (error as { $metadata: { httpStatusCode?: number } }).$metadata
            if (meta.httpStatusCode === 404) return new S3UploadError({ key, cause: error })
          }
          return new S3UploadError({ key, cause: error })
        },
      }).pipe(
        Effect.catchAll(() => Effect.succeed(false)),
      ),

    publicUrl: (key) =>
      `https://${bucket}.s3.${config.s3.bucketRegion}.amazonaws.com/${key}`,
  })
})

export const S3ServiceLive = Layer.effect(S3Service, make)
