import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const read = path => readFile(new URL(`../../${path}`, import.meta.url), "utf8")

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

test("Event3 never releases a participant token before Authentica verifies the SMS OTP", async () => {
  const api = await read("api/participant.mjs")
  const otpFlow = between(api, '// Cached clients must not retain', 'if (!participant) return res.status(401)')
  const requestBranch = between(otpFlow, 'if (action === "e3-request-login-otp")', 'const otp =')
  const verifyBranch = otpFlow.slice(otpFlow.indexOf('const otp ='))

  assert.match(requestBranch, /sendAuthenticaOtp\(\{ phone: verifiedPhone, method: "sms" \}\)/)
  assert.doesNotMatch(requestBranch, /secure_token|token: matchedParticipant/)
  assert.match(verifyBranch, /verifyAuthenticaOtp\(\{ phone: verifiedPhone, otp \}\)/)
  assert.match(verifyBranch, /if \(!verification\.verified\)[\s\S]*status\(400\)/)
  assert.ok(
    verifyBranch.indexOf("if (!verification.verified)") < verifyBranch.indexOf("token: matchedParticipant.secure_token"),
    "the participant token must be returned only after the verified guard",
  )
  assert.match(otpFlow, /action === "e3-login-by-phone"[\s\S]*EVENT3_OTP_REQUIRED/)
  assert.match(otpFlow, /PAID_DONE,payment_completed_event_id/)
  assert.match(otpFlow, /isEvent3JoinEligible\([\s\S]*enrolledNumbers\.has\(candidate\.assigned_number\)/)
})

test("Event3 persists a verified OTP login as the normal website participant session", async () => {
  const route = await read("app/routes/event3.tsx")
  const phoneEntry = between(route, "function PhoneEntry", "// ─── Waiting / Setup Screen")

  assert.match(phoneEntry, /call\("e3-request-login-otp", null/)
  assert.match(phoneEntry, /call\("e3-verify-login-otp", null/)
  assert.match(phoneEntry, /if \(d\.error \|\| !d\.success \|\| !d\.token\)/)
  assert.match(phoneEntry, /localStorage\.setItem\("blindmatch_result_token", d\.token\)/)
  assert.match(phoneEntry, /localStorage\.setItem\("blindmatch_returning_token", d\.token\)/)
})
