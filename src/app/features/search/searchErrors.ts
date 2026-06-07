import { Data } from "effect"

export class SearchExtensionUnavailableError extends Data.TaggedError("SearchExtensionUnavailableError")<{
  readonly extension: string
}> {}

export class SearchEmbeddingError extends Data.TaggedError("SearchEmbeddingError")<{
  readonly cause: unknown
}> {}

export class SearchDocumentNotFoundError extends Data.TaggedError("SearchDocumentNotFoundError")<{
  readonly documentId: string
}> {}

export class SearchQueryTooLongError extends Data.TaggedError("SearchQueryTooLongError")<{
  readonly length: number
  readonly maxLength: number
}> {}

export class SearchTenantRequiredError extends Data.TaggedError("SearchTenantRequiredError")<{}> {}

export class SearchIngestError extends Data.TaggedError("SearchIngestError")<{
  readonly cause: unknown
}> {}

export class SearchJobNotFoundError extends Data.TaggedError("SearchJobNotFoundError")<{
  readonly jobId: string
}> {}
