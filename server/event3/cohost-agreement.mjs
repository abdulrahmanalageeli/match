import { createHash } from "node:crypto"
import { COHOST_AGREEMENT, cohostAgreementText } from "../../app/lib/cohost-agreement.mjs"

export const COHOST_AGREEMENT_TEXT = cohostAgreementText()
export const COHOST_AGREEMENT_HASH = createHash("sha256").update(COHOST_AGREEMENT_TEXT).digest("hex")
export const COHOST_AGREEMENT_ACTIONS = new Set(["e3-cohost-agreement", "e3-cohost-accept-agreement"])

export function hasCurrentCohostAgreement(claims) {
  return Boolean(claims?.agreement_id
    && claims.agreement_version === COHOST_AGREEMENT.version
    && claims.agreement_hash === COHOST_AGREEMENT_HASH
    && Number.isFinite(Date.parse(claims.agreement_accepted_at)))
}

function fail(message, status, code) {
  throw Object.assign(new Error(message), { status, code })
}

export async function acceptCohostAgreement(supabase, token, input) {
  if (input?.accepted !== true) fail("يجب الموافقة على التعهد قبل المتابعة", 400, "AGREEMENT_CONSENT_REQUIRED")
  if (input.version !== COHOST_AGREEMENT.version || input.agreement_hash !== COHOST_AGREEMENT_HASH) {
    fail("تم تحديث التعهد. أعيدي تحميله وقراءته قبل الموافقة", 409, "AGREEMENT_CHANGED")
  }
  const fullName = typeof input.full_name === "string" ? input.full_name.trim().replace(/\s+/gu, " ") : ""
  if (fullName.length < 3 || fullName.length > 120 || !/^[\p{L}\p{M}]+(?:[ .’'\-][\p{L}\p{M}]+)+$/u.test(fullName)) {
    fail("اكتبي اسمك الكامل (الاسم واسم العائلة على الأقل)", 400, "AGREEMENT_NAME_REQUIRED")
  }
  const sessionHash = createHash("sha256").update(token).digest("hex")
  const findReceipt = () => supabase.from("event3_cohost_agreements")
    .select("id,full_name,agreement_version,agreement_hash,accepted_at")
    .eq("session_hash", sessionHash).eq("agreement_hash", COHOST_AGREEMENT_HASH).maybeSingle()
  const existing = await findReceipt()
  if (existing.error) fail("تعذر التحقق من سجل الموافقة. حاولي مجدداً", 503, "AGREEMENT_RECORD_UNAVAILABLE")
  if (existing.data) {
    if (existing.data.full_name !== fullName) fail("سُجلت موافقة هذه الجلسة باسم مختلف. سجلي الخروج للدخول باسمك", 409, "AGREEMENT_NAME_CONFLICT")
    return existing.data
  }
  const saved = await supabase.from("event3_cohost_agreements").insert({
    session_hash: sessionHash,
    full_name: fullName,
    agreement_version: COHOST_AGREEMENT.version,
    agreement_hash: COHOST_AGREEMENT_HASH,
    agreement_text: COHOST_AGREEMENT_TEXT,
  }).select("id,full_name,agreement_version,agreement_hash,accepted_at").single()
  if (saved.error?.code === "23505") {
    const retried = await findReceipt()
    if (!retried.error && retried.data?.full_name === fullName) return retried.data
  }
  if (saved.error || !saved.data) fail("لم تُحفظ الموافقة. حاولي مجدداً قبل الدخول إلى اللوحة", 503, "AGREEMENT_RECORD_UNAVAILABLE")
  return saved.data
}
