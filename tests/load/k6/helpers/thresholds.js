// Shared SLO thresholds for all k6 scenarios.
// Import this in each scenario file.

export const SLO = {
  baseline: {
    p95: 200,   // ms
    p99: 500,
    errorRate: 0.001, // 0.1%
  },
  load: {
    p95: 500,
    p99: 1000,
    errorRate: 0.01,  // 1%
  },
  stress: {
    p95: 2000,
    p99: 5000,
    errorRate: 0.05,  // 5%
  },
}

export const thresholds = {
  baseline: {
    http_req_duration: [`p(95)<${SLO.baseline.p95}`, `p(99)<${SLO.baseline.p99}`],
    http_req_failed: [`rate<${SLO.baseline.errorRate}`],
  },
  load: {
    http_req_duration: [`p(95)<${SLO.load.p95}`, `p(99)<${SLO.load.p99}`],
    http_req_failed: [`rate<${SLO.load.errorRate}`],
  },
  stress: {
    http_req_duration: [`p(95)<${SLO.stress.p95}`, `p(99)<${SLO.stress.p99}`],
    http_req_failed: [`rate<${SLO.stress.errorRate}`],
  },
}
