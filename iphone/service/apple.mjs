import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiError, BUNDLE } from "./domain.mjs";

let verifier;
let retryableStatus;
async function getVerifier() {
  if (verifier) return verifier;
  const directory = process.env.APPLE_ROOT_CERTS_DIR;
  const environment = process.env.APPLE_STORE_ENV;
  if (!directory || !["Sandbox", "Production"].includes(environment))
    throw new ApiError(503, "التحقق من اشتراكات Apple غير مهيأ.");
  const appId = process.env.APPLE_APP_ID
    ? Number(process.env.APPLE_APP_ID)
    : undefined;
  if (
    environment === "Production" &&
    (!Number.isSafeInteger(appId) || appId <= 0)
  )
    throw new ApiError(503, "معرّف تطبيق Apple غير مهيأ.");
  try {
    const { SignedDataVerifier, VerificationStatus } = await import(
      "@apple/app-store-server-library"
    );
    retryableStatus = VerificationStatus.RETRYABLE_VERIFICATION_FAILURE;
    const roots = readdirSync(directory)
      .filter((name) => name.endsWith(".cer"))
      .map((name) => readFileSync(join(directory, name)));
    if (!roots.length) throw Error("No trusted Apple roots");
    verifier = new SignedDataVerifier(roots, true, environment, BUNDLE, appId);
    return verifier;
  } catch {
    throw new ApiError(503, "تعذر تحميل شهادات التحقق من Apple.");
  }
}
async function verify(signed, type) {
  if (
    typeof signed !== "string" ||
    signed.length < 30 ||
    signed.length > 60_000
  )
    throw new ApiError(400, "بيانات اشتراك Apple غير صالحة.");
  const current = await getVerifier();
  try {
    return type === "transaction"
      ? await current.verifyAndDecodeTransaction(signed)
      : await current.verifyAndDecodeNotification(signed);
  } catch (error) {
    // Apple's retryable network / OCSP failures must not grant access or acknowledge a notification.
    if (error?.status === retryableStatus)
      throw new ApiError(503, "التحقق من Apple غير متاح الآن.");
    throw new ApiError(403, "تعذّر التحقق من توقيع Apple.");
  }
}
export const verifyTransaction = (signed) => verify(signed, "transaction");
export async function verifyNotification(signed) {
  const notification = await verify(signed, "notification");
  return notification.data?.signedTransactionInfo
    ? verifyTransaction(notification.data.signedTransactionInfo)
    : null;
}
