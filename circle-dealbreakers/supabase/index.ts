const MAX_BODY_BYTES = 8192;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(status: number, error?: string) {
  return new Response(JSON.stringify(error ? { ok: false, error } : { ok: true }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(status === 405 ? { Allow: "POST" } : {}),
    },
  });
}

async function readBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) {
    throw reply(413, "النص طويل. اكتب مشاركة أقصر وحاول مرة ثانية.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw reply(400, "المشاركة فاضية. اكتب الديل بريكر أولًا.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw reply(413, "النص طويل. اكتب مشاركة أقصر وحاول مرة ثانية.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw reply(400, "ما قدرنا نقرأ المشاركة. حدّث الصفحة وحاول مرة ثانية.");
  }
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return reply(405, "الإرسال متاح من نموذج المشاركة فقط.");
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return reply(415, "صيغة الإرسال غير صحيحة. حدّث الصفحة وحاول مرة ثانية.");
  }
  // The browser submits through the same-origin Vercel rewrite. No CORS access is granted.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return reply(403, "افتح صفحة المشاركة وأرسل منها مباشرة.");
  }
  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply(400, "صيغة المشاركة غير صحيحة.");
    }
    if (body.website !== undefined && (typeof body.website !== "string" || body.website.trim() !== "")) {
      return reply(400, "تعذّر إرسال المشاركة. حدّث الصفحة وحاول مرة ثانية.");
    }
    if (typeof body.submissionId !== "string" || !UUID.test(body.submissionId)) {
      return reply(400, "تعذّر التحقق من الإرسال. حدّث الصفحة وحاول مرة ثانية.");
    }
    if (typeof body.text !== "string") return reply(400, "اكتب الديل بريكر أولًا.");
    const text = body.text.trim();
    const characters = Array.from(text).length;
    if (characters < 3 || characters > 600 || text.includes("\u0000")) {
      return reply(400, "اكتب مشاركة من 3 إلى 600 حرف.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return reply(503, "الإرسال مو متاح الحين. حاول بعد شوي.");
    const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/circle_dealbreakers`;
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    // One deadline covers both the insert and optional idempotency lookup.
    const signal = AbortSignal.timeout(12_000);
    const inserted = await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ id: body.submissionId, text }),
      signal,
    });
    if (inserted.ok) return reply(201);
    if (inserted.status === 409) {
      const query = new URLSearchParams({ id: `eq.${body.submissionId}`, select: "text", limit: "1" });
      const existing = await fetch(`${endpoint}?${query}`, { headers, signal });
      if (!existing.ok) return reply(503, "ما قدرنا نتأكد من الإرسال. حاول مرة ثانية بنفس المشاركة.");
      const rows = await existing.json();
      if (Array.isArray(rows) && rows[0]?.text === text) return reply(200);
      return reply(409, "رقم الإرسال مستخدم لمشاركة ثانية. حدّث الصفحة وحاول من جديد.");
    }
    return reply(503, "تعذّر حفظ المشاركة الحين. حاول مرة ثانية.");
  } catch (error) {
    if (error instanceof Response) return error;
    return reply(503, "ما تأكدنا من الإرسال. حاول مرة ثانية بنفس المشاركة.");
  }
}

Deno.serve(handleRequest);
