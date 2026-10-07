const EVENT_ID = "the-circle-2026-10-07";
const COOKIE_NAMES = { participant: "circle_participant", host: "circle_host" };
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const MAX_BODY_BYTES = 8192;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Row = Record<string, any>;

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
class DatabaseError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super("Database request failed"); this.status = status; this.code = code; }
}

function json(data: Row, status = 200, cookie?: string) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
  });
  if (cookie) headers.set("Set-Cookie", cookie);
  if (status === 405) headers.set("Allow", "POST");
  return new Response(JSON.stringify(data), { status, headers });
}

async function payload(request: Request): Promise<Row> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new ApiError(413, "الطلب طويل. اختصر البيانات وحاول مرة ثانية.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "الطلب فاضي.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ApiError(413, "الطلب طويل. اختصر البيانات وحاول مرة ثانية.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new ApiError(400, "صيغة الطلب غير صحيحة. حدّث الصفحة وجرب مرة ثانية."); }
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}
function secureEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), n => alphabet[n % alphabet.length]).join("");
}
function normalizeCode(value: unknown) {
  if (typeof value !== "string") throw new ApiError(400, "اكتب رمز الدخول.");
  const code = value.trim().toUpperCase();
  if (Array.from(code).length < 8 || Array.from(code).length > 64 || /[\s\u0000-\u001f\u007f]/.test(code)) throw new ApiError(400, "رمز الدخول من 8 إلى 64 حرفًا، بدون مسافات.");
  return code;
}
function validName(value: unknown) {
  if (typeof value !== "string") throw new ApiError(400, "اكتب اسمك أولًا.");
  const name = value.trim().replace(/\s+/g, " ");
  if (Array.from(name).length < 2 || Array.from(name).length > 40 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ApiError(400, "الاسم يكون من حرفين إلى 40 حرفًا.");
  }
  return name;
}
function participantId(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) throw new ApiError(400, "المشارك غير صحيح.");
  return value;
}
function cookieValue(request: Request, kind: keyof typeof COOKIE_NAMES) {
  const prefix = COOKIE_NAMES[kind] + "=";
  const value = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(prefix))?.slice(prefix.length);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}
function cookie(kind: keyof typeof COOKIE_NAMES, token = "") {
  return `${COOKIE_NAMES[kind]}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}`;
}
function publicParticipant(p: Row) {
  return { id: p.id, name: p.name, active: p.active, createdAt: p.created_at };
}
function publicEvent(e: Row) {
  return {
    title: e.title, subtitle: e.subtitle, date: e.event_date, currentSlide: e.current_slide_id,
    votingOpen: !!e.voting_open && !!e.ends_at && Date.parse(e.ends_at) > Date.now(),
    revealed: !!e.revealed, endsAt: e.ends_at,
  };
}
function currentSlide(e: Row) {
  return (e.slides as Row[]).find(s => s.id === e.current_slide_id) || null;
}
function isVoteSlide(slide: Row | null) { return slide?.kind === "scenario" && slide?.responseMode === "vote"; }

export async function handleEventRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "استخدم صفحة الفعالية." }, 405);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "صيغة الطلب غير صحيحة." }, 415);
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return json({ ok: false, error: "افتح صفحة الفعالية مباشرة." }, 403);
  }
  // JSON-only, no CORS, and same-origin browser requests through the Vercel rewrite.
  const origin = request.headers.get("origin");
  if (origin && fetchSite !== "same-origin") return json({ ok: false, error: "افتح صفحة الفعالية مباشرة." }, 403);
  try {
    const body = await payload(request);
    const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!base || !key) throw new ApiError(503, "الفعالية مو متاحة الحين. جرب بعد شوي.");
    const signal = AbortSignal.timeout(12_000);
    async function db(resource: string, options: RequestInit = {}) {
      const response = await fetch(`${base}/rest/v1/${resource}`, {
        ...options, signal,
        headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) },
      });
      const text = await response.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* Never return upstream content. */ }
      if (!response.ok) throw new DatabaseError(response.status, data?.code || "");
      return data;
    }
    const query = (values: Record<string, string>) => new URLSearchParams(values).toString();
    const eventRows = await db(`circle_events?${query({ id: `eq.${EVENT_ID}`, select: "*", limit: "1" })}`);
    let event = eventRows?.[0];
    if (!event) throw new ApiError(503, "الفعالية لسه ما بدأت.");
    async function getParticipant(id: string) {
      return (await db(`circle_participants?${query({ event_id: `eq.${EVENT_ID}`, id: `eq.${id}`, select: "*", limit: "1" })}`))?.[0];
    }
    async function session(kind: keyof typeof COOKIE_NAMES) {
      const token = cookieValue(request, kind);
      if (!token) throw new ApiError(401, "سجّل دخولك أولًا.");
      const tokenHash = await hash(token);
      const rows = await db(`circle_event_sessions?${query({ token_hash: `eq.${tokenHash}`, event_id: `eq.${EVENT_ID}`, kind: `eq.${kind}`, expires_at: `gt.${new Date().toISOString()}`, select: "participant_id", limit: "1" })}`);
      if (!rows?.[0]) throw new ApiError(401, "انتهت جلسة الدخول. ادخل برمزك مرة ثانية.");
      if (kind === "host") return { tokenHash, participant: null };
      const participant = await getParticipant(rows[0].participant_id);
      if (!participant?.active) throw new ApiError(403, "المشاركة موقوفة. تواصل مع منظّم الفعالية.");
      return { tokenHash, participant };
    }
    async function createSession(kind: keyof typeof COOKIE_NAMES, id?: string) {
      const token = randomToken();
      await db("circle_event_sessions", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ token_hash: await hash(token), event_id: EVENT_ID, kind, participant_id: id || null, expires_at: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString() }),
      });
      return cookie(kind, token);
    }
    async function rateLimit(action: string) {
      const ip = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",", 1)[0].trim().slice(0, 128);
      const subjectHash = await hash(`${key}\u0000${EVENT_ID}\u0000${ip}`);
      const allowed = await db("rpc/circle_event_rate_limit", {
        method: "POST", body: JSON.stringify({ p_event_id: EVENT_ID, p_action: action, p_subject_hash: subjectHash, p_limit: action === "hostLogin" ? 10 : action === "join" ? 120 : 30 }),
      });
      if (!allowed) throw new ApiError(429, "محاولات كثيرة. انتظر دقيقة وجرب مرة ثانية.");
    }
    async function participantState(p: Row) {
      let vote = null;
      if (event.current_slide_id) {
        const rows = await db(`circle_votes?${query({ event_id: `eq.${EVENT_ID}`, participant_id: `eq.${p.id}`, slide_id: `eq.${event.current_slide_id}`, select: "choice", limit: "1" })}`);
        vote = rows?.[0]?.choice ?? null;
      }
      return { participant: { id: p.id, name: p.name }, event: publicEvent(event), slide: currentSlide(event), vote };
    }
    async function addParticipant(name: unknown, customCode?: unknown) {
      const displayName = validName(name);
      const loginCode = customCode === undefined || customCode === "" ? randomCode() : normalizeCode(customCode);
      try {
        const rows = await db("circle_participants", {
          method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ id: crypto.randomUUID(), event_id: EVENT_ID, name: displayName, login_code_hash: await hash(loginCode) }),
        });
        return { participant: rows[0], loginCode };
      } catch (error) {
        if (error instanceof DatabaseError && error.code === "23505") throw new ApiError(409, "الاسم أو الرمز مستخدم. جرّب اسمًا أو رمزًا مختلفًا.");
        throw error;
      }
    }
    async function allRows(table: string, select: string, extra: Record<string, string> = {}) {
      const collected: Row[] = [];
      for (let offset = 0; ; offset += 500) {
        const rows = await db(`${table}?${query({ select, ...extra, limit: "500", offset: String(offset) })}`);
        collected.push(...rows);
        if (rows.length < 500) return collected;
      }
    }
    async function hostState(includeHistory = false) {
      const [participants, votes, anonymous] = await Promise.all([
        allRows("circle_participants", "id,name,active,created_at", { event_id: `eq.${EVENT_ID}`, order: "created_at.asc,id.asc" }),
        allRows("circle_votes", "participant_id,slide_id,choice,created_at,updated_at", { event_id: `eq.${EVENT_ID}`, ...(includeHistory ? {} : { slide_id: `eq.${event.current_slide_id || "__none__"}` }), order: "participant_id.asc,slide_id.asc" }),
        allRows("circle_dealbreakers", "id,text,created_at", { order: "created_at.asc,id.asc" }),
      ]);
      return {
        event: publicEvent(event), slide: currentSlide(event), slides: event.slides,
        participants: participants.map(publicParticipant),
        votes: votes.map(v => ({ participantId: v.participant_id, slideId: v.slide_id, choice: v.choice, createdAt: v.created_at, updatedAt: v.updated_at })),
        anonymous: anonymous.map(a => ({ id: a.id, text: a.text, createdAt: a.created_at })),
      };
    }
    async function patchEvent(changes: Row, guardSlide = false) {
      const filter: Record<string, string> = { id: `eq.${EVENT_ID}` };
      if (guardSlide) filter.current_slide_id = event.current_slide_id ? `eq.${event.current_slide_id}` : "is.null";
      const rows = await db(`circle_events?${query(filter)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(changes) });
      if (!rows?.[0]) throw new ApiError(409, "الشريحة تغيّرت. حدّث الحالة وجرب مرة ثانية.");
      event = rows[0];
      return { ok: true, event: publicEvent(event), slide: currentSlide(event) };
    }

    if (body.action === "join") {
      await rateLimit("join");
      const { participant, loginCode } = await addParticipant(body.name);
      const sessionCookie = await createSession("participant", participant.id);
      return json({ ...(await participantState(participant)), loginCode }, 201, sessionCookie);
    }
    if (body.action === "login") {
      await rateLimit("login");
      const codeHash = await hash(normalizeCode(body.code));
      const rows = await db(`circle_participants?${query({ event_id: `eq.${EVENT_ID}`, login_code_hash: `eq.${codeHash}`, active: "eq.true", select: "*", limit: "1" })}`);
      if (!rows?.[0]) throw new ApiError(401, "رمز الدخول غير صحيح أو المشاركة موقوفة.");
      return json(await participantState(rows[0]), 200, await createSession("participant", rows[0].id));
    }
    if (body.action === "hostLogin") {
      await rateLimit("hostLogin");
      const provided = await hash(normalizeCode(body.code));
      if (!event.host_code_hash || !secureEqual(provided, event.host_code_hash)) throw new ApiError(401, "رمز المنظّم غير صحيح.");
      return json({ ok: true, event: publicEvent(event), slide: currentSlide(event) }, 200, await createSession("host"));
    }
    if (body.action === "me" || body.action === "state") {
      const { participant } = await session("participant");
      return json(await participantState(participant!));
    }
    if (body.action === "vote") {
      const { participant } = await session("participant");
      if (typeof body.slideId !== "string" || body.slideId.length > 100 || !Number.isInteger(body.choice) || body.choice < 1 || body.choice > 4) {
        throw new ApiError(400, "اختار إجابة صحيحة للسؤال الحالي.");
      }
      const result = await db("rpc/circle_event_vote", { method: "POST", body: JSON.stringify({ p_event_id: EVENT_ID, p_participant_id: participant!.id, p_slide_id: body.slideId, p_choice: body.choice }) });
      if (!result.ok) {
        const message = result.code === "inactive" ? "المشاركة موقوفة. تواصل مع المنظّم." : result.code === "slide_changed" ? "انتقلنا لسؤال جديد. حدّث الصفحة." : "التصويت مقفل أو انتهى الوقت.";
        throw new ApiError(result.code === "inactive" ? 403 : 409, message);
      }
      return json({ ok: true, choice: result.choice });
    }
    if (body.action === "logout") {
      const token = cookieValue(request, "participant");
      if (token) await db(`circle_event_sessions?${query({ token_hash: `eq.${await hash(token)}`, event_id: `eq.${EVENT_ID}`, kind: "eq.participant" })}`, { method: "DELETE" });
      return json({ ok: true }, 200, cookie("participant"));
    }

    const host = await session("host");
    if (body.action === "hostState" || body.action === "hostReport") return json(await hostState(body.action === "hostReport"));
    if (body.action === "hostAdd") {
      const { participant, loginCode } = await addParticipant(body.name, body.code);
      return json({ ok: true, participant: publicParticipant(participant), loginCode }, 201);
    }
    if (body.action === "hostRemove") {
      const id = participantId(body.participantId);
      const removed = await db("rpc/circle_event_remove", { method: "POST", body: JSON.stringify({ p_event_id: EVENT_ID, p_participant_id: id }) });
      if (!removed) throw new ApiError(404, "المشارك مو موجود.");
      return json({ ok: true });
    }
    if (body.action === "hostRestore") {
      const id = participantId(body.participantId);
      const rows = await db(`circle_participants?${query({ event_id: `eq.${EVENT_ID}`, id: `eq.${id}` })}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ active: true }) });
      if (!rows?.[0]) throw new ApiError(404, "المشارك مو موجود.");
      return json({ ok: true, participant: publicParticipant(rows[0]) });
    }
    if (body.action === "hostResetCode") {
      const id = participantId(body.participantId);
      const loginCode = body.code === undefined || body.code === "" ? randomCode() : normalizeCode(body.code);
      const reset = await db("rpc/circle_event_reset_code", { method: "POST", body: JSON.stringify({ p_event_id: EVENT_ID, p_participant_id: id, p_code_hash: await hash(loginCode) }) });
      if (!reset) throw new ApiError(404, "المشارك مو موجود.");
      return json({ ok: true, participant: publicParticipant(await getParticipant(id)), loginCode });
    }
    if (body.action === "hostSlide") {
      const slide = (event.slides as Row[]).find(s => s.id === body.slideId);
      if (!slide) throw new ApiError(400, "الشريحة مو موجودة.");
      const voting = isVoteSlide(slide);
      return json(await patchEvent({ current_slide_id: slide.id, revealed: true, voting_open: voting, ends_at: voting ? new Date(Date.now() + 180_000).toISOString() : null }));
    }
    if (body.action === "hostControl") {
      const changes: Row = {};
      for (const [input, column] of [["votingOpen", "voting_open"], ["revealed", "revealed"]]) {
        if (body[input] !== undefined) {
          if (typeof body[input] !== "boolean") throw new ApiError(400, "إعدادات العرض غير صحيحة.");
          changes[column] = body[input];
        }
      }
      if (body.endsAt !== undefined) {
        if (body.endsAt !== null && (typeof body.endsAt !== "string" || !Number.isFinite(Date.parse(body.endsAt)))) throw new ApiError(400, "وقت النهاية غير صحيح.");
        changes.ends_at = body.endsAt === null ? null : new Date(body.endsAt).toISOString();
      }
      const voting = changes.voting_open ?? event.voting_open;
      if (voting) {
        if (!isVoteSlide(currentSlide(event))) throw new ApiError(400, "هذي الشريحة ما فيها تصويت.");
        if (changes.voting_open === true && changes.ends_at === undefined && (!event.ends_at || Date.parse(event.ends_at) <= Date.now())) changes.ends_at = new Date(Date.now() + 180_000).toISOString();
        const endsAt = changes.ends_at === undefined ? event.ends_at : changes.ends_at;
        if ((changes.voting_open === true || changes.ends_at !== undefined) && (!endsAt || Date.parse(endsAt) <= Date.now())) throw new ApiError(400, "حدّد وقت نهاية قادم للتصويت.");
      }
      if (!Object.keys(changes).length) throw new ApiError(400, "ما فيه تغيير لإرساله.");
      return json(await patchEvent(changes, true));
    }
    if (body.action === "hostLogout") {
      await db(`circle_event_sessions?${query({ token_hash: `eq.${host.tokenHash}`, event_id: `eq.${EVENT_ID}`, kind: "eq.host" })}`, { method: "DELETE" });
      return json({ ok: true }, 200, cookie("host"));
    }
    throw new ApiError(400, "الطلب غير معروف.");
  } catch (error) {
    if (error instanceof ApiError) return json({ ok: false, error: error.message }, error.status);
    if (error instanceof DatabaseError && error.code === "23505") return json({ ok: false, error: "الاسم أو الرمز مستخدم. جرّب قيمة مختلفة." }, 409);
    return json({ ok: false, error: "ما قدرنا نكمل الطلب. جرب مرة ثانية بعد شوي." }, 503);
  }
}

Deno.serve(handleEventRequest);
