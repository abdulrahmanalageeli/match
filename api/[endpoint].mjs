import handleTwilioConsole from "../server/twilio/console.mjs"
import handleTwilioStatus from "../server/twilio/status.mjs"
import handleTwilioWebhook from "../server/twilio/webhook.mjs"
import handleDbCheck from "../server/api/db-check.mjs"

const handlers = {
  "db-check": handleDbCheck,
  "twilio-console": handleTwilioConsole,
  "twilio-status": handleTwilioStatus,
  "twilio-webhook": handleTwilioWebhook,
}

function requestedRoute(req) {
  const parameter = req.query?.endpoint
  if (Array.isArray(parameter)) return parameter[0]
  if (parameter) return String(parameter)

  // Keep this fallback for local function runners that do not populate the
  // dynamic route parameter in req.query.
  try {
    return new URL(req.url || "", "http://localhost").pathname.split("/").filter(Boolean).at(-1) || ""
  } catch {
    return ""
  }
}

export default async function handler(req, res) {
  const route = requestedRoute(req)
  const routeHandler = handlers[route]

  if (!routeHandler) {
    return res.status(404).json({ error: "API endpoint not found" })
  }

  // Dispatch without rewriting req.url so Twilio signature verification still
  // evaluates the exact public callback URL that Twilio signed.
  return routeHandler(req, res)
}
