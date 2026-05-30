import { createHmac, timingSafeEqual } from "node:crypto"
import { Effect } from "effect"
import { UnauthorizedError } from "../../../core/errors/commonErrors.ts"

// Verifies a Razorpay webhook signature.
// Razorpay signs with HMAC-SHA256 of the raw body using the webhook secret.
export const verifyRazorpaySignature = (
  rawBody: Buffer,
  signature: string,
  secret: string
): Effect.Effect<void, UnauthorizedError> =>
  Effect.sync(() => {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
    const expectedBuf = Buffer.from(expected)
    const actualBuf = Buffer.from(signature)
    if (expectedBuf.length !== actualBuf.length) return false
    return timingSafeEqual(expectedBuf, actualBuf)
  }).pipe(
    Effect.flatMap((valid) =>
      valid
        ? Effect.void
        : Effect.fail(new UnauthorizedError({ reason: "Invalid Razorpay webhook signature" }))
    )
  )

// Generic HMAC verifier — reusable for any provider (Resend, Novu, etc.)
// signature is expected as a hex string.
export const verifyHmacSignature = (
  payload: Buffer,
  signature: string,
  secret: string,
  algorithm: "sha256" | "sha512" = "sha256"
): Effect.Effect<void, UnauthorizedError> =>
  Effect.sync(() => {
    const expected = createHmac(algorithm, secret).update(payload).digest("hex")
    const expectedBuf = Buffer.from(expected)
    const actualBuf = Buffer.from(signature)
    if (expectedBuf.length !== actualBuf.length) return false
    return timingSafeEqual(expectedBuf, actualBuf)
  }).pipe(
    Effect.flatMap((valid) =>
      valid
        ? Effect.void
        : Effect.fail(new UnauthorizedError({ reason: "Invalid webhook signature" }))
    )
  )
