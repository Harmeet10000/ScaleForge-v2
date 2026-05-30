import { Brand } from "effect"

export type UserId = string & Brand.Brand<"UserId">
export const UserId = Brand.nominal<UserId>()

export type Email = string & Brand.Brand<"Email">
export const Email = Brand.nominal<Email>()

export type AccessToken = string & Brand.Brand<"AccessToken">
export const AccessToken = Brand.nominal<AccessToken>()

export type RefreshToken = string & Brand.Brand<"RefreshToken">
export const RefreshToken = Brand.nominal<RefreshToken>()

export type CorrelationId = string & Brand.Brand<"CorrelationId">
export const CorrelationId = Brand.nominal<CorrelationId>()
