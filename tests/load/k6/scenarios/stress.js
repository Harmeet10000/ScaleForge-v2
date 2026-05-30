// Stress scenario: ramp to 500 VUs to find the breaking point.
// SLO: p95 < 2s, error rate < 5%.
// Run: k6 run tests/load/k6/scenarios/stress.js -e BASE_URL=https://staging.scaleforge.dev

import http from "k6/http"
import { check, sleep } from "k6"
import { thresholds } from "../helpers/thresholds.js"

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3000"

export const options = {
  stages: [
    { duration: "2m",  target: 50  },  // warm up
    { duration: "5m",  target: 200 },  // sustained load
    { duration: "2m",  target: 500 },  // stress
    { duration: "1m",  target: 0   },  // ramp down
  ],
  thresholds: thresholds.stress,
}

export default function () {
  const health = http.get(`${BASE_URL}/api/v1/health`)
  check(health, { "health 200": (r) => r.status === 200 })
  sleep(1)
}
