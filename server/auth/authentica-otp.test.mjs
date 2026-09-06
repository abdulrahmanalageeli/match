import assert from "node:assert/strict"
import test from "node:test"

import {
  AuthenticaOtpError,
  sendAuthenticaOtp,
  verifyAuthenticaOtp,
} from "./authentica-otp.mjs"

const apiKey = "test-server-only-key"

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload },
  }
}

test("sends an SMS OTP with the API key only in the authorization header", async () => {
  let request
  const result = await sendAuthenticaOtp({ phone: "+966500000000", method: "sms" }, {
    apiKey,
    fetchImpl: async (url, init) => {
      request = { url, init }
      return jsonResponse(200, { success: true })
    },
  })

  assert.deepEqual(result, { sent: true })
  assert.equal(request.url, "https://api.authentica.sa/api/v2/send-otp")
  assert.equal(request.url.includes(apiKey), false)
  assert.equal(request.init.headers["X-Authorization"], apiKey)
  assert.deepEqual(JSON.parse(request.init.body), { method: "sms", phone: "+966500000000" })
})

test("accepts Authentica's successful 2xx contract while honoring explicit denials", async () => {
  let body
  const verified = await verifyAuthenticaOtp({ phone: "+966500000000", otp: "123456" }, {
    apiKey,
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body)
      return jsonResponse(200, { verified: true })
    },
  })
  assert.deepEqual(body, { phone: "+966500000000", otp: "123456" })
  assert.deepEqual(verified, { verified: true })

  const providerVerified = await verifyAuthenticaOtp({ phone: "+966500000000", otp: "123456" }, {
    apiKey,
    fetchImpl: async () => jsonResponse(200, { message: "OTP verified successfully" }),
  })
  assert.deepEqual(providerVerified, { verified: true })

  const explicitlyDenied = await verifyAuthenticaOtp({ phone: "+966500000000", otp: "123456" }, {
    apiKey,
    fetchImpl: async () => jsonResponse(200, { success: true, verified: false }),
  })
  assert.deepEqual(explicitlyDenied, { verified: false })

  const nestedDenial = await verifyAuthenticaOtp({ phone: "+966500000000", otp: "123456" }, {
    apiKey,
    fetchImpl: async () => jsonResponse(200, { data: { success: false } }),
  })
  assert.deepEqual(nestedDenial, { verified: false })
})

test("treats invalid codes as denied and provider outages as errors", async () => {
  const invalid = await verifyAuthenticaOtp({ phone: "+966500000000", otp: "000000" }, {
    apiKey,
    fetchImpl: async () => jsonResponse(422, { message: "invalid" }),
  })
  assert.deepEqual(invalid, { verified: false })

  await assert.rejects(
    () => sendAuthenticaOtp({ phone: "+966500000000" }, {
      apiKey,
      fetchImpl: async () => jsonResponse(503, {}),
    }),
    error => error instanceof AuthenticaOtpError && error.code === "AUTHENTICA_SEND_FAILED",
  )
})

test("requires a server-side API key", async () => {
  await assert.rejects(
    () => sendAuthenticaOtp({ phone: "+966500000000" }, { apiKey: "" }),
    error => error instanceof AuthenticaOtpError && error.code === "AUTHENTICA_NOT_CONFIGURED",
  )
})
