import { readFile } from "node:fs/promises"
import { runInNewContext } from "node:vm"
import * as scheduler from "./scheduler.mjs"
import * as incremental from "./incremental-scheduler.mjs"
import * as moves from "./manual-move.mjs"
import * as live from "./live-state.mjs"
import * as badges from "./badge-claim.mjs"
import * as roster from "./numbered-roster.mjs"
import * as setup from "./setup.mjs"
import * as fixed from "../../app/lib/the-room-fixed-routes.mjs"

// Only transport/auth are substituted; tests run the actual handler and SQL.
export async function createTestApi(client, { authenticated = true } = {}) {
  const source = (await readFile(new URL("../../api/the-room.mjs", import.meta.url), "utf8"))
    .replace(/import[\s\S]*?from "[^"]+"\r?\n/g, "")
    .replace("export default async function handler", "async function handler")
  const handler = runInNewContext(source + "\nhandler", {
    ...scheduler, ...incremental, ...moves, ...live, ...badges, ...roster, ...setup, ...fixed,
    supabaseAdmin: client, hasTheRoomSession: () => authenticated, enforceTheRoomRateLimit: () => true, console,
  })
  return async (action, payload = {}) => {
    const response = { setHeader() {}, status(status) { this.statusCode = status; return this }, json(body) { this.body = body; return this } }
    await handler({ method: "POST", body: { action, ...payload } }, response)
    return { status: response.statusCode, body: response.body }
  }
}
