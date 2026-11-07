export const verificationLimit = 5 * 1024 * 1024;
export const verificationBucket = 'nisfayn-verification-evidence';
export const verificationSubmissionUnavailable = 'إرسال مستندات التوثيق متوقف مؤقتًا إلى حين اعتماد طريقة تحقق مناسبة.';
export function assertVerificationActionAllowed(action: unknown) {
  if (action === 'prepare' || action === 'upload' || action === 'submit') {
    throw Object.assign(verificationError(verificationSubmissionUnavailable, 403), { code: 'verification_submission_restricted' });
  }
}
export function verificationError(message: string, status = 400) { return Object.assign(new Error(message), { status }); }
export async function readVerificationBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > limit) throw verificationError('الملف أكبر من الحد المسموح.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw verificationError('الطلب فارغ.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > limit) { await reader.cancel(); throw verificationError('الملف أكبر من الحد المسموح.', 413); }
    chunks.push(value);
  }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export function validateVerificationFile(bytes: Uint8Array, mime: string, expectedSize: number) {
  if (!bytes.length || bytes.length > verificationLimit || bytes.length !== expectedSize) throw verificationError('حجم المستند غير مطابق.');
  const matches = mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    : mime === 'application/pdf' ? new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-' : false;
  if (!matches) throw verificationError('نوع المستند غير مطابق. استخدم JPEG أو PNG أو PDF.');
}
export function validVerificationPath(path: unknown): path is string {
  return typeof path === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|pdf)$/.test(path);
}
