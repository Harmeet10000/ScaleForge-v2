/**
 * src/core/utils/userAgentUtils.ts
 *
 * User-agent parsing for session tracking using ua-parser-js.
 *
 * Used in:
 *   - Auth service: record device info at login (Phase 7 session management)
 *   - Session listing: show user "iPhone 15 · Safari · iOS 17.2"
 *   - Security alerts: "New login from Windows 11 · Chrome on a new device"
 *
 * Usage in auth service:
 *   const device = parseUA(request.headers['user-agent'] ?? '')
 *   await sessionRepo.create({ userId, device, ipAddress: request.ip })
 */

import { UAParser } from "ua-parser-js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeviceInfo {
  /** Browser name and major version: "Chrome 120", "Safari 17" */
  readonly browser: string
  /** OS name and version: "Windows 11", "iOS 17.2", "macOS 14.2" */
  readonly os: string
  /** Device type and model: "mobile · iPhone 15", "tablet · iPad Pro", "desktop" */
  readonly device: string
  /** Raw device type: "mobile" | "tablet" | "console" | "smarttv" | "wearable" | "embedded" | "desktop" */
  readonly deviceType: string
  /** Engine name: "Blink", "WebKit", "Gecko" */
  readonly engine: string
  /** True if this looks like a mobile device */
  readonly isMobile: boolean
  /** True if this looks like a bot/crawler */
  readonly isBot: boolean
}

// Known bot user-agent patterns
const BOT_PATTERN = /bot|crawler|spider|scraper|curl|wget|python|java|go-http|postman/i

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a User-Agent header string into a structured DeviceInfo.
 * Safe to call with empty/undefined UA strings.
 */
export const parseUA = (userAgent: string = ""): DeviceInfo => {
  const parser = new UAParser(userAgent)
  const result = parser.getResult()

  const browserName = result.browser.name ?? "Unknown"
  const browserMajor = result.browser.major ?? ""
  const browser = browserMajor ? `${browserName} ${browserMajor}` : browserName

  const osName = result.os.name ?? "Unknown"
  const osVersion = result.os.version ?? ""
  const os = osVersion ? `${osName} ${osVersion}` : osName

  const deviceModel = result.device.model ?? ""
  const rawType = result.device.type ?? "desktop"
  const device = deviceModel
    ? `${rawType} · ${deviceModel}`
    : rawType

  return {
    browser,
    os,
    device,
    deviceType: rawType,
    engine: result.engine.name ?? "Unknown",
    isMobile: rawType === "mobile",
    isBot: BOT_PATTERN.test(userAgent),
  }
}

/**
 * Format DeviceInfo as a single human-readable string.
 * Example: "Chrome 120 · macOS 14.2 · desktop"
 */
export const formatDeviceInfo = (info: DeviceInfo): string =>
  `${info.browser} · ${info.os} · ${info.device}`

/**
 * Extract minimal device fingerprint for session deduplication.
 * Two sessions with the same fingerprint likely come from the same device.
 * NOTE: This is NOT cryptographically secure — use IP + UA + fingerprint together.
 */
export const deviceFingerprint = (info: DeviceInfo): string => {
  const normalized = `${info.browser}|${info.os}|${info.deviceType}`.toLowerCase()
  // Simple deterministic hash (not cryptographic — for dedup only)
  let hash = 0
  for (const char of normalized) {
    hash = (hash << 5) - hash + char.charCodeAt(0)
    hash |= 0  // Convert to 32-bit int
  }
  return Math.abs(hash).toString(36)
}
