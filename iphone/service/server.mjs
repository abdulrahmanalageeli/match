import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { ApiError, openStore } from "./domain.mjs";
import { verifyTransaction, verifyNotification } from "./apple.mjs";

async function bodyOf(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new ApiError(415, "يلزم إرسال بيانات JSON.");
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 70_000) throw new ApiError(413, "الطلب أكبر من الحجم المسموح.");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return body;
  } catch {
    throw new ApiError(400, "بيانات الطلب غير صالحة.");
  }
}

// Separate HTTP frontends can also use the API by explicitly allowing their origin.
export function createService(store = openStore()) {
  const allowed = new Set([
    "capacitor://localhost",
    "https://localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...(process.env.MARRIAGE_WEB_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ]);
  const attempts = new Map();
  function throttle(req) {
    const now = Date.now(),
      key = req.socket.remoteAddress;
    for (const [address, limit] of attempts)
      if (limit.until <= now) attempts.delete(address);
    const limit = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
    if (++limit.count > 40)
      throw new ApiError(429, "محاولات كثيرة. حاول لاحقًا.");
    attempts.set(key, limit);
  }
  return createServer(async (req, res) => {
    let status = 200;
    try {
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin))
        throw new ApiError(403, "مصدر الاتصال غير مسموح.");
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization,Content-Type",
        );
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        );
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const path = new URL(req.url, "http://localhost").pathname;
      const key = req.method + " " + path;
      let payload;
      if (key === "GET /health") payload = { ok: true };
      else if (key === "POST /api/register" || key === "POST /api/login") {
        throttle(req);
        const body = await bodyOf(req);
        if (path.endsWith("/register")) {
          payload = await store.register(body);
          status = 201;
        } else payload = await store.login(body);
      } else if (key === "POST /api/storekit/notifications") {
        const receipt = await verifyNotification(
          (await bodyOf(req)).signedPayload,
        );
        if (receipt) store.recordNotification(receipt);
        payload = { ok: true };
      } else {
        const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(
          req.headers.authorization || "",
        )?.[1];
        const id = store.authenticate(token);
        switch (key) {
          case "GET /api/me":
            payload = store.state(id);
            break;
          case "PUT /api/application":
            payload = store.apply(id, await bodyOf(req));
            break;
          case "POST /api/membership": {
            const transaction = await verifyTransaction(
              (await bodyOf(req)).signedTransaction,
            );
            payload = store.recordReceipt(transaction, id);
            break;
          }
          case "POST /api/introduction/respond":
            payload = store.respond(id, await bodyOf(req));
            break;
          case "PATCH /api/settings":
            payload = store.pause(id, (await bodyOf(req)).paused);
            break;
          case "DELETE /api/me":
            store.remove(id);
            payload = { ok: true };
            break;
          case "POST /api/logout":
            store.logout(token);
            payload = { ok: true };
            break;
          default:
            throw new ApiError(404, "المسار غير موجود.");
        }
      }
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(payload));
    } catch (error) {
      if (!(error instanceof ApiError))
        console.error("Request failed:", error.name);
      res.writeHead(error instanceof ApiError ? error.status : 500, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(
        JSON.stringify({
          error:
            error instanceof ApiError ? error.message : "حدث خطأ في الخدمة.",
        }),
      );
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const host = process.env.MARRIAGE_HOST || "127.0.0.1",
    port = Number(process.env.PORT || 8787);
  createService().listen(port, host, () =>
    console.log("Marriage service listening on " + host + ":" + port),
  );
}
