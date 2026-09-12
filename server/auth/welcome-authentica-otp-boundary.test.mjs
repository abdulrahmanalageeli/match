import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const api = await readFile(new URL("../../api/participant.mjs", import.meta.url), "utf8")

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

test("welcome token recovery uses Authentica and releases the token only after verification", () => {
  const recoveryFlow = between(api, 'if (action === "request-otp")', "// PDPL data-subject rights")
  const requestBranch = between(recoveryFlow, 'if (action === "request-otp")', 'if (action === "verify-otp")')
  const verifyBranch = recoveryFlow.slice(recoveryFlow.indexOf('if (action === "verify-otp")'))

  assert.match(requestBranch, /participantPhoneToE164\(participant\.phone_number\)/)
  assert.match(requestBranch, /sendAuthenticaOtp\(\{ phone: verifiedPhone, method: "sms" \}\)/)
  assert.doesNotMatch(requestBranch, /secure_token|verify\.twilio\.com|TWILIO_(?:ACCOUNT_SID|AUTH_TOKEN|VERIFY_SERVICE_SID)/)
  assert.match(verifyBranch, /participantPhoneToE164\(participant\.phone_number\)/)
  assert.match(verifyBranch, /verifyAuthenticaOtp\(\{ phone: verifiedPhone, otp: normalizedOtp \}\)/)
  assert.match(verifyBranch, /if \(!verification\.verified\)[\s\S]*status\(400\)/)
  assert.ok(
    verifyBranch.indexOf("if (!verification.verified)") < verifyBranch.indexOf("secure_token: participant.secure_token"),
    "the participant token must be returned only after Authentica verifies the OTP",
  )
  assert.doesNotMatch(recoveryFlow, /verify\.twilio\.com|TWILIO_(?:ACCOUNT_SID|AUTH_TOKEN|VERIFY_SERVICE_SID)/)
})
