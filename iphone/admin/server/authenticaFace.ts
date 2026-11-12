// Server-only adapter. Face similarity is NOT evidence of liveness or legal identity.
// Do not expose this directly as a public API or use it alone to approve a portrait.
export type FaceComparison = { matched: boolean; liveness: 'not_verified' };
export type FaceComparisonInput = {
  // Must come from the authenticated server session, never a request body's user_id.
  memberId: string;
  referenceJpeg: Buffer;
  cameraJpeg: Buffer;
};

const endpoint = 'https://api.authentica.sa/api/v2/verify-by-face';
const maxImageBytes = 3 * 1024 * 1024;

function validJpeg(value: Buffer): boolean {
  return Buffer.isBuffer(value) && value.length >= 4 && value.length <= maxImageBytes
    && value[0] === 0xff && value[1] === 0xd8
    && value[value.length - 2] === 0xff && value[value.length - 1] === 0xd9;
}

export async function compareAuthenticaFaces(
  input: FaceComparisonInput,
  options: { key?: string; fetcher?: typeof fetch } = {},
): Promise<FaceComparison> {
  const key = (options.key ?? process.env.AUTHENTICA_KEY)?.trim();
  if (!key) throw new Error('FACE_SERVICE_UNAVAILABLE');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.memberId)
    || !validJpeg(input.referenceJpeg) || !validJpeg(input.cameraJpeg)) {
    throw new Error('FACE_INPUT_INVALID');
  }
  // Reject accidentally submitting the selected photo twice. This is not anti-spoofing.
  if (input.referenceJpeg.equals(input.cameraJpeg)) throw new Error('FACE_CAPTURE_REQUIRED');
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'X-Authorization': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        user_id: input.memberId,
        registered_face_image: input.referenceJpeg.toString('base64'),
        query_face_image: input.cameraJpeg.toString('base64'),
      }),
    });
    if (!response.ok) throw new Error('provider_error');
    const result = await response.json();
    if (result?.success !== true || result?.data?.user_id !== input.memberId
      || typeof result?.data?.result !== 'boolean') throw new Error('invalid_response');
    return { matched: result.data.result, liveness: 'not_verified' };
  } catch {
    // Never forward provider bodies/errors: they can contain biometric data or credentials.
    throw new Error('FACE_SERVICE_UNAVAILABLE');
  }
}
