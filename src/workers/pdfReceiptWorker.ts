/**
 * src/workers/pdfReceiptWorker.ts
 *
 * PDF receipt generation worker.
 *
 * Message flow:
 *   RabbitMQ "receipts.generate" queue
 *     → decode & validate job with Effect Schema
 *     → fetch payment record from Postgres
 *     → generate PDF receipt with pdfkit
 *     → upload to S3 at `receipts/{userId}/{paymentId}.pdf`
 *     → store S3 key back on the payment record (metadata.pdfKey)
 *     → ack
 *
 * On failure: nack after MAX_PDF_ATTEMPTS → DLQ
 */

import { Effect, ManagedRuntime, Queue, Schema, Layer, Result } from "effect"
import closeWithGrace from "close-with-grace"
import PDFDocument from "pdfkit"
import { eq } from "drizzle-orm"
import { PostgresService } from "../infra/postgres/postgresService.ts"
import { S3Service, S3ServiceLive } from "../infra/s3/s3Service.ts"
import { WebhookPublisher } from "../infra/webhooks/webhookPublisher.ts"
import { DLQService, DLQServiceLive } from "./shared/dlqService.ts"
import { RabbitConsumerService, RabbitConsumerServiceLive } from "./shared/rabbitConsumer.ts"
import { WorkerLayer } from "./shared/workerLayer.ts"
import { makeWorkerHealth } from "./shared/workerHealth.ts"
import { payments } from "../db/schema/paymentSchema.ts"
import { AppConfigLive } from "../core/config/configService.ts"

// ── Job schema ─────────────────────────────────────────────────────────────────

const PdfReceiptJobSchema = Schema.Struct({
  paymentId: Schema.String,
  userId: Schema.String,
  attempt: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
})

type PdfReceiptJob = Schema.Schema.Type<typeof PdfReceiptJobSchema>

const QUEUE_NAME = "receipts.generate"
const WORKER_NAME = "pdf-receipt"
const MAX_ATTEMPTS = 3
const PREFETCH = 3

// ── PDF generator ─────────────────────────────────────────────────────────────

interface ReceiptData {
  paymentId: string
  userId: string
  amount: string
  currency: string
  status: string
  description: string | null
  paidAt: Date | null
  createdAt: Date | null
  customerDetails: unknown
}

const generatePdfBuffer = (data: ReceiptData): Effect.Effect<Buffer> =>
  Effect.tryPromise({
    try: () =>
      new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: "A4" })
        const chunks: Buffer[] = []

        doc.on("data", (chunk: Buffer) => chunks.push(chunk))
        doc.on("end", () => resolve(Buffer.concat(chunks)))
        doc.on("error", reject)

        // Header
        doc.fontSize(24).font("Helvetica-Bold").text("ScaleForge", 50, 50)
        doc.fontSize(10).font("Helvetica").fillColor("#666666").text("Payment Receipt", 50, 80)
        doc.moveDown(2)

        // Divider
        doc.moveTo(50, 110).lineTo(545, 110).stroke("#e0e0e0")

        // Receipt details
        doc.fontSize(12).fillColor("#000000")
        doc.font("Helvetica-Bold").text("Receipt Details", 50, 130)
        doc.moveDown(0.5)

        const details: Array<[string, string]> = [
          ["Payment ID", data.paymentId],
          ["User ID", data.userId],
          ["Amount", `${data.amount} ${data.currency}`],
          ["Status", data.status.toUpperCase()],
          ["Description", data.description ?? "—"],
          ["Payment Date", data.paidAt ? data.paidAt.toLocaleDateString("en-IN") : "—"],
          ["Receipt Generated", new Date().toLocaleString("en-IN")],
        ]

        for (const [label, value] of details) {
          doc.font("Helvetica-Bold").fontSize(10).text(`${label}:`, 50, undefined, { continued: true, width: 180 })
          doc.font("Helvetica").fontSize(10).text(` ${value}`)
          doc.moveDown(0.3)
        }

        doc.moveDown(2)
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#e0e0e0")
        doc.moveDown(1)

        // Footer
        doc.fontSize(8).fillColor("#999999").text(
          "This is a computer-generated receipt. No signature required.",
          50,
          undefined,
          { align: "center" },
        )

        doc.end()
      }),
    catch: (e) => e,
  })

// ── Message processor ─────────────────────────────────────────────────────────

const processJob = (
  job: PdfReceiptJob,
  ack: () => Effect.Effect<void>,
  nack: () => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const { db } = yield* PostgresService
    const s3 = yield* S3Service
    const dlq = yield* DLQService

    // Fetch payment
    const rows = yield* Effect.tryPromise({
      try: () => db.select().from(payments).where(eq(payments.id, job.paymentId)).limit(1),
      catch: (e) => e,
    }).pipe(
      Effect.matchEffect({
        onSuccess: (r) => Effect.succeed(r),
        onFailure: (e) =>
          Effect.logError(`[pdf-worker] DB fetch failed for ${job.paymentId}`, e).pipe(
            Effect.as([] as Array<typeof payments.$inferSelect>),
          ),
      }),
    )

    if (rows.length === 0) {
      yield* Effect.logWarning(`[pdf-worker] payment ${job.paymentId} not found — nacking`)
      yield* nack()
      return
    }

    const payment = rows[0]!
    const receiptData: ReceiptData = {
      paymentId: payment.id,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency ?? "INR",
      status: payment.status,
      description: payment.description,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      customerDetails: payment.customerDetails,
    }

    // Generate PDF
    const pdfBuffer = yield* generatePdfBuffer(receiptData).pipe(
      Effect.catchCause((cause) =>
        Effect.logError(`[pdf-worker] PDF generation failed`, cause).pipe(
          Effect.flatMap(() => Effect.failCause(cause)),
        ),
      ),
    )

    // Upload to S3
    const s3Key = `receipts/${job.userId}/${job.paymentId}.pdf`
    const uploadResult = yield* s3.upload({
      key: s3Key,
      body: pdfBuffer,
      contentType: "application/pdf",
      metadata: {
        paymentId: job.paymentId,
        userId: job.userId,
        generatedAt: new Date().toISOString(),
      },
    }).pipe(
      Effect.match({
        onSuccess: () => ({ ok: true as const }),
        onFailure: (err) => ({ ok: false as const, error: err }),
      }),
    )

    if (!uploadResult.ok) {
      const nextAttempt = job.attempt + 1
      if (nextAttempt >= MAX_ATTEMPTS) {
        yield* dlq.publish({
          sourceQueue: QUEUE_NAME,
          workerName: WORKER_NAME,
          body: job,
          reason: `S3 upload failed after ${MAX_ATTEMPTS} attempts`,
          attempts: nextAttempt,
          failedAt: new Date().toISOString(),
        })
        yield* ack()
      } else {
        yield* nack()
      }
      return
    }

    // Store S3 key on payment record
    yield* Effect.tryPromise({
      try: () =>
        db
          .update(payments)
          .set({
            metadata: { ...((payment.metadata as object) ?? {}), pdfKey: s3Key },
            updatedAt: new Date(),
          })
          .where(eq(payments.id, job.paymentId)),
      catch: (e) => e,
    }).pipe(Effect.ignore)

    yield* ack()
    yield* Effect.flatMap(WebhookPublisher, (p) =>
      p.emit("receipt.generated", { paymentId: job.paymentId, userId: job.userId, s3Key }),
    ).pipe(Effect.ignore)
    yield* Effect.log(`[pdf-worker] receipt generated for ${job.paymentId} → ${s3Key}`)
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.logError(`[pdf-worker] unhandled failure`, cause)
        yield* nack()
      }),
    ),
  )

// ── Worker loop ───────────────────────────────────────────────────────────────

const workerProgram = Effect.gen(function* () {
  const consumer = yield* RabbitConsumerService
  const health = makeWorkerHealth({
    port: Number(process.env["WORKER_HEALTH_PORT"] ?? 9102),
  })

  yield* Effect.promise(() => health.start())
  yield* Effect.addFinalizer(() => Effect.promise(() => health.stop()).pipe(Effect.ignore))

  const msgQueue = yield* consumer.consume({ queue: QUEUE_NAME, prefetch: PREFETCH })
  health.setReady(true)
  yield* Effect.log(`[pdf-worker] consuming from ${QUEUE_NAME}`)

  yield* Effect.forever(
    Effect.gen(function* () {
      const msg = yield* Queue.take(msgQueue)
      const decoded = Schema.decodeUnknownResult(PdfReceiptJobSchema)(msg.body)

      if (Result.isFailure(decoded)) {
        yield* Effect.logWarning(`[pdf-worker] invalid job schema`, decoded.failure)
        yield* msg.nack()
        return
      }

      yield* Effect.forkScoped(processJob(decoded.success, msg.ack, msg.nack))
    }),
  )
})

// ── Entry point ───────────────────────────────────────────────────────────────

const WorkerRootLayer = Layer.mergeAll(
  WorkerLayer,
  S3ServiceLive.pipe(Layer.provide(AppConfigLive)),
  RabbitConsumerServiceLive.pipe(Layer.provide(AppConfigLive)),
  DLQServiceLive.pipe(Layer.provide(AppConfigLive)),
) as unknown as Layer.Layer<S3Service | RabbitConsumerService | DLQService, never, never>

const runtime = ManagedRuntime.make(WorkerRootLayer)

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    console.error("[pdf-worker] unexpected error — shutting down:", err)
  } else {
    console.log(`[pdf-worker] received ${signal ?? "close"}, shutting down…`)
  }
  await runtime.dispose()
})

runtime.runFork(
  workerProgram.pipe(
    Effect.scoped,
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        console.error("[pdf-worker] fatal", cause)
        process.exit(1)
      }),
    ),
  ),
)
