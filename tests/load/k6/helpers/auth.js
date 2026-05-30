import http from "k6/http"
import { check } from "k6"

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3000"

// Cache the auth token across VUs by storing it per-VU in a closure.
// In a real suite, use k6's setup() to login once and share the token.
export const login = (email, password) => {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" } }
  )
  check(res, { "login 200": (r) => r.status === 200 })
  return res.json("data.accessToken")
}

export const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
})
