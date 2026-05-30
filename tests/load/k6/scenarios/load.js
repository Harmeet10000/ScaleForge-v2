// Load scenario: 100 VUs × 5 minutes.
// SLO: p95 < 500ms, error rate < 1%.
// Run: k6 run tests/load/k6/scenarios/load.js -e BASE_URL=https://staging.scaleforge.dev

import http from "k6/http"
import { check, sleep } from "k6"
import { thresholds } from "../helpers/thresholds.js"

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3000"

export const options = {
  stages: [
    { duration: "30s", target: 50 },   // ramp up
    { duration: "4m",  target: 100 },  // sustained load
    { duration: "30s", target: 0 },    // ramp down
  ],
  thresholds: thresholds.load,
}

export default function () {
  const health = http.get(`${BASE_URL}/api/v1/health`)
  check(health, { "health 200": (r) => r.status === 200 })

  sleep(Math.random() * 2 + 0.5)  // 0.5–2.5s think time
}
