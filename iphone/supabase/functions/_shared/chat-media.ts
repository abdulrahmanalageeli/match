type MediaRequest = { session?: unknown; payload?: { id?: unknown; viewOnce?: unknown } };
type MediaReference = { path?: string; mime?: string };
type MediaRpc = (action: string, session: string, payload: { id: string }) => Promise<MediaReference>;
const sessionPattern = /^[0-9a-f]{64}$/;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const chatObjectPath = /^(?:reham|abdulrahman)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function viewOnceUpload(value: string | null, mime: string): boolean {
  if (value !== null && value !== 'true' && value !== 'false') throw Error('خيار العرض لمرة واحدة غير صالح.');
  const enabled = value === 'true';
  if (enabled && !mime.startsWith('image/')) throw Error('العرض لمرة واحدة متاح للصور فقط.');
  return enabled;
}

// A view-once image is consumed by the database before any bytes are returned.
// No public/signed URL is issued. A failed transfer cannot be replayed.
export async function downloadChatMedia(body: MediaRequest, rpc: MediaRpc, download: (path: string) => Promise<Blob>, headers: Record<string, string>): Promise<Response> {
  const { session, payload } = body;
  if (typeof session !== 'string' || !sessionPattern.test(session) || typeof payload?.id !== 'string' || !idPattern.test(payload.id)
      || (payload.viewOnce !== undefined && typeof payload.viewOnce !== 'boolean')) {
    return Response.json({ error: 'طلب الملف غير صالح.' }, { status: 400, headers });
  }
  const photo = await rpc(payload.viewOnce ? 'media_open' : 'media_url', session, { id: payload.id });
  if (!photo.path || !chatObjectPath.test(photo.path)) throw Error('الملف غير متاح.');
  const blob = await download(photo.path);
  const mime = photo.mime || blob.type;
  if (!/^(image\/(jpeg|png|webp)|audio\/(webm|mp4|ogg|wav))$/.test(mime)
      || (payload.viewOnce && !mime.startsWith('image/'))) throw Error('نوع الملف غير متاح.');
  return new Response(blob, { headers: { ...headers, 'Content-Type': mime, 'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}
