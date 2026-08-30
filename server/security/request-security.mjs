import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { isIP } from "node:net"
import { supabaseAdmin } from "./supabase-admin.mjs"

const ADMIN_COOKIE = "blindmatch_admin_session"
const ADMIN_SESSION_SECONDS = 4 * 60 * 60
const ADMIN_SESSION_REFRESH_WINDOW_SECONDS = 60 * 60
const buckets = new Map()

function secretEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ""))
  const right = Buffer.from(String(rightValue || ""))
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right)
}

function adminPassword() {
  return process.env.EVENT3_PASSWORD || process.env.ADMIN_PASSWORD || ""
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET
    || process.env.EVENT3_COHOST_TOKEN_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || ""
}

function parseCookies(req) {
  return String(req?.headers?.cookie || "").split(";").reduce((out, part) => {
    const index = part.indexOf("=")
    if (index > 0) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
    return out
  }, {})
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

function verifySession(token) {
  try {
    if (!sessionSecret()) return null
    const [encoded, supplied, extra] = String(token || "").split(".")
    if (!encoded || !supplied || extra) return null
    const expected = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url")
    if (!secretEqual(supplied, expected)) return null
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    if (payload?.role !== "admin" || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function getAdminSession(req) {
  return verifySession(parseCookies(req)[ADMIN_COOKIE])
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader?.("Set-Cookie")
  const values = existing ? (Array.isArray(existing) ? existing : [existing]) : []
  res.setHeader("Set-Cookie", [...values, cookie])
}

function issueAdminSession(res, sessionId = randomUUID()) {
  if (!sessionSecret()) throw new Error("ADMIN_SESSION_SECRET or EVENT3_COHOST_TOKEN_SECRET must be configured")
  const now = Math.floor(Date.now() / 1000)
  const token = signSession({ role: "admin", sid: sessionId, iat: now, exp: now + ADMIN_SESSION_SECONDS })
  appendSetCookie(res, `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_SESSION_SECONDS}`)
  return token
}

export function clearAdminSession(res) {
  appendSetCookie(res, `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)
}

export function getClientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim()
  if (isIP(forwarded)) return forwarded
  const candidates = [req?.headers?.["x-real-ip"], req?.socket?.remoteAddress]
  for (const candidate of candidates) {
    const value = String(candidate || "").replace(/^::ffff:/, "")
    if (isIP(value)) return value
  }
  return null
}

export function enforceRateLimit(req, res, { key = "request", identity, limit = 30, windowMs = 60_000 } = {}) {
  const ip = getClientIp(req) || "unknown"
  // identity must come from a verified server-side lookup, not request claims.
  const bucketKey = identity == null ? `${key}:ip:${ip}` : `${key}:identity:${identity}`
  const now = Date.now()
  const current = buckets.get(bucketKey)
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
  entry.count += 1
  buckets.set(bucketKey, entry)
  res.setHeader?.("X-RateLimit-Limit", String(limit))
  res.setHeader?.("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)))
  if (entry.count <= limit) return true
  res.setHeader?.("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))))
  res.status(429).json({ error: "Too many requests. Please try again later." })
  return false
}

export async function recordSecurityEvent(req, {
  actorType = "anonymous", actorId = null, action, targetType = null,
  targetId = null, outcome = "success", requestId = null, metadata = {},
} = {}) {
  try {
    const safeMetadata = Object.fromEntries(Object.entries(metadata || {}).filter(([key]) =>
      !/token|password|phone|name|survey|message|receipt|body|header/i.test(key)
    ))
    await supabaseAdmin.from("security_audit_logs").insert({
      actor_type: actorType,
      actor_id: actorId,
      action: String(action || "unknown").slice(0, 120),
      target_type: targetType,
      target_id: targetId == null ? null : String(targetId).slice(0, 160),
      outcome,
      request_id: requestId || req?.headers?.["x-vercel-id"] || randomUUID(),
      ip_address: getClientIp(req),
      user_agent: String(req?.headers?.["user-agent"] || "").slice(0, 500),
      metadata: safeMetadata,
    })
  } catch (error) {
    // Audit logging must never disclose request data or take down the primary operation.
    console.error("Security audit write failed:", error?.message || "unknown error")
  }
}

export async function requireAdmin(req, res, { action = "admin-request", allowPassword = true } = {}) {
  const cookieSession = verifySession(parseCookies(req)[ADMIN_COOKIE])
  if (cookieSession) {
    const secondsRemaining = Number(cookieSession.exp) - Math.floor(Date.now() / 1000)
    if (secondsRemaining <= ADMIN_SESSION_REFRESH_WINDOW_SECONDS) {
      issueAdminSession(res, cookieSession.sid)
    }
    req.adminAuth = { method: "session", sessionId: cookieSession.sid }
    await recordSecurityEvent(req, { actorType: "admin", actorId: cookieSession.sid, action, outcome: "success" })
    return req.adminAuth
  }

  const configuredPassword = adminPassword()
  const supplied = req?.headers?.["x-admin-password"] || req?.body?.password || ""
  if (allowPassword && configuredPassword && secretEqual(supplied, configuredPassword)) {
    issueAdminSession(res)
    req.adminAuth = { method: "password", sessionId: null }
    await recordSecurityEvent(req, { actorType: "admin", action: "admin-login", outcome: "success" })
    return req.adminAuth
  }

  await recordSecurityEvent(req, { actorType: "anonymous", action, outcome: "denied" })
  res.status(401).json({ error: configuredPassword ? "Unauthorized" : "Admin authentication is not configured" })
  return null
}

export function hasConfiguredAdminPassword() {
  return Boolean(adminPassword() && sessionSecret())
}
