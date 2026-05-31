import { Data } from "effect"

export class FgaCheckError extends Data.TaggedError("FgaCheckError")<{
  readonly user: string
  readonly relation: string
  readonly object: string
  readonly cause: unknown
}> {}

export class FgaBatchCheckError extends Data.TaggedError("FgaBatchCheckError")<{
  readonly cause: unknown
}> {}

export class FgaWriteError extends Data.TaggedError("FgaWriteError")<{
  readonly operation: "write" | "delete"
  readonly cause: unknown
}> {}

export class FgaListObjectsError extends Data.TaggedError("FgaListObjectsError")<{
  readonly user: string
  readonly relation: string
  readonly type: string
  readonly cause: unknown
}> {}

export class FgaConfigError extends Data.TaggedError("FgaConfigError")<{
  readonly reason: string
}> {}
