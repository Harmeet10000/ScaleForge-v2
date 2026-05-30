// Baseline scenario: 10 VUs × 1 minute.
// SLO: p95 < 200ms, error rate < 0.1%.
// Run: k6 run tests/load/k6/scenarios/baseline.js -e BASE_URL=https://staging.scaleforge.dev

import http from "k6/http"
import { check, sleep } from "k6"
import { thresholds } from "../helpers/thresholds.js"

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3000"

export const options = {
  vus: 10,
  duration: "1m",
  thresholds: thresholds.baseline,
}

export default function () {
  // Health check
  const health = http.get(`${BASE_URL}/api/v1/health`)
  check(health, {
    "health status 200": (r) => r.status === 200,
    "health response time < 100ms": (r) => r.timings.duration < 100,
  })

  sleep(1)
}
