// Spike scenario: 0 → 1000 VUs in 30 seconds, then drop.
// Goal: verify recovery time < 60 seconds after spike.
// No hard SLO thresholds — this is exploratory.
// Run: k6 run tests/load/k6/scenarios/spike.js -e BASE_URL=https://staging.scaleforge.dev

import http from "k6/http"
import { check, sleep } from "k6"
import { Trend } from "k6/metrics"

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3000"
const recoveryTime = new Trend("recovery_time_ms")

export const options = {
  stages: [
    { duration: "10s", target: 0    },  // baseline
    { duration: "30s", target: 1000 },  // spike
    { duration: "30s", target: 1000 },  // hold at peak
    { duration: "60s", target: 0    },  // drain — watch recovery
  ],
  thresholds: {
    // Soft threshold — spike is expected to breach; we measure recovery
    http_req_failed: ["rate<0.5"],
  },
}

export default function () {
  const start = Date.now()
  const res = http.get(`${BASE_URL}/api/v1/health`)
  const ok = check(res, { "health 200": (r) => r.status === 200 })
  if (ok) recoveryTime.add(Date.now() - start)
  sleep(0.1)
}
