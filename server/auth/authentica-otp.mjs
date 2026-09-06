const DEFAULT_BASE_URL = "https://api.authentica.sa"
const REQUEST_TIMEOUT_MS = 10_000

export class AuthenticaOtpError extends Error {
  constructor(message, { code = "AUTHENTICA_UNAVAILABLE", status = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = "AuthenticaOtpError"
    this.code = code
    this.status = status
  }
}

function authenticaConfig({ apiKey, baseUrl } = {}) {
  const resolvedKey = String(apiKey ?? process.env.AUTHENTICA_API_KEY ?? "").trim()
  const resolvedBaseUrl = String(baseUrl ?? process.env.AUTHENTICA_BASE_URL ?? DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "")
  if (!resolvedKey) {
    throw new AuthenticaOtpError("Authentica OTP is not configured", {
      code: "AUTHENTICA_NOT_CONFIGURED",
    })
  }
  return { apiKey: resolvedKey, baseUrl: resolvedBaseUrl || DEFAULT_BASE_URL }
}

async function postAuthentica(path, body, options = {}) {
  const { apiKey, baseUrl } = authenticaConfig(options)
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== "function") {
    throw new AuthenticaOtpError("Authentica OTP transport is unavailable")
  }

  let response
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Authorization": apiKey,
      },
      body: JSON.stringify(body),
      signal: options.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    throw new AuthenticaOtpError("Authentica OTP request failed", { cause: error })
  }

  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

export async function sendAuthenticaOtp({ phone, method = "sms" }, options = {}) {
  if (method !== "sms" && method !== "whatsapp") {
    throw new TypeError("Authentica OTP method must be sms or whatsapp")
  }
  const { response } = await postAuthentica("/api/v2/send-otp", { method, phone }, options)
  if (!response.ok) {
    throw new AuthenticaOtpError("Authentica rejected the OTP send request", {
      code: response.status === 401 ? "AUTHENTICA_NOT_CONFIGURED" : "AUTHENTICA_SEND_FAILED",
      status: response.status,
    })
  }
  return { sent: true }
}

export async function verifyAuthenticaOtp({ phone, otp }, options = {}) {
  const { response, payload } = await postAuthentica("/api/v2/verify-otp", { phone, otp }, options)
  if (!response.ok) {
    if ([400, 404, 409, 422].includes(response.status)) return { verified: false }
    throw new AuthenticaOtpError("Authentica OTP verification failed", {
      code: response.status === 401 ? "AUTHENTICA_NOT_CONFIGURED" : "AUTHENTICA_VERIFY_FAILED",
      status: response.status,
    })
  }

  // Authentica's official Node example treats a successful HTTP response as
  // verified when the response omits both boolean fields. Honour every
  // explicit denial first, then accept the provider's successful 2xx contract.
  const verificationSignals = [
    payload?.verified,
    payload?.data?.verified,
    payload?.success,
    payload?.data?.success,
  ].filter(value => typeof value === "boolean")
  const verified = verificationSignals.includes(false)
    ? false
    : verificationSignals.includes(true) || response.ok
  return { verified }
}
