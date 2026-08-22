import { createHmac, timingSafeEqual } from "node:crypto"

const COOKIE_NAME = "the_room_admin_session"
const SESSION_SECONDS = 8 * 60 * 60
const rateBuckets = new Map()

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ""))
  const right = Buffer.from(String(rightValue || ""))
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right)
}

function configuredKey() {
  return process.env.THE_ROOM_ADMIN_KEY || ""
}

function sessionSecret() {
  return process.env.THE_ROOM_SESSION_SECRET || ""
}

function parseCookies(req) {
  return String(req?.headers?.cookie || "").split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=")
    if (separator > 0) cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim())
    return cookies
  }, {})
}

function sign(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

function verify(value) {
  try {
    const [encoded, supplied, extra] = String(value || "").split(".")
    if (!encoded || !supplied || extra || !sessionSecret()) return null
    const expected = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url")
    if (!safeEqual(supplied, expected)) return null
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    if (payload?.scope !== "the-room-admin" || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function setCookie(res, value, maxAge, req) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "")
  const secure = process.env.NODE_ENV === "production" || forwardedProto === "https"
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/api/the-room; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`)
}

export function theRoomAuthConfigured() {
  return Boolean(configuredKey() && sessionSecret())
}

export function loginTheRoom(req, res, suppliedKey) {
  if (!theRoomAuthConfigured()) return { ok: false, status: 503, error: "The Room authentication is not configured" }
  if (!safeEqual(suppliedKey, configuredKey())) return { ok: false, status: 401, error: "Invalid access key" }
  const now = Math.floor(Date.now() / 1000)
  setCookie(res, sign({ scope: "the-room-admin", iat: now, exp: now + SESSION_SECONDS }), SESSION_SECONDS, req)
  return { ok: true }
}

export function logoutTheRoom(req, res) {
  setCookie(res, "", 0, req)
}

export function hasTheRoomSession(req) {
  return Boolean(verify(parseCookies(req)[COOKIE_NAME]))
}

export function enforceTheRoomRateLimit(req, res, { limit = 90, windowMs = 60_000, scope = "api" } = {}) {
  const ip = String(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "unknown").split(",")[0].trim()
  const bucketKey = `${scope}:${ip}`
  const now = Date.now()
  const current = rateBuckets.get(bucketKey)
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
  bucket.count += 1
  rateBuckets.set(bucketKey, bucket)
  if (bucket.count <= limit) return true
  res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
  res.status(429).json({ error: "Too many requests. Please wait a moment." })
  return false
}
