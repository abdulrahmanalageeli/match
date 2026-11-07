export const verificationConsentVersion = 'manual-verification-v1' as const;
export const verificationSubmissionUnavailable = 'إرسال مستندات التوثيق متوقف مؤقتًا إلى حين اعتماد طريقة تحقق مناسبة.';
export const verificationMaxFileBytes = 5 * 1024 * 1024;
export const verificationMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'] as const;

export const verificationKinds = [
  { id: 'marital_status', label: 'الحالة الاجتماعية', description: 'وضوح في بداية التعارف', evidenceHint: 'مستند حديث يوضح حالتك الاجتماعية. أخفِ الأرقام والبيانات غير اللازمة للمراجعة.' },
  { id: 'identity', label: 'مستند الهوية', description: 'مراجعة يدوية للمستند', evidenceHint: 'مستند هوية واضح مع إخفاء الرقم والعنوان وأي بيانات غير لازمة. الاسم الظاهر في ملفك قد يكون اسمًا مستعارًا.' },
  { id: 'education', label: 'المؤهل الدراسي', description: 'مراجعة المؤهل المضاف لملفك', evidenceHint: 'شهادة أو إفادة توضح المؤهل. أخفِ الرقم الجامعي والدرجات وأي بيانات غير لازمة.' },
  { id: 'employment', label: 'المهنة', description: 'مراجعة مهنتك الحالية', evidenceHint: 'إفادة عمل حديثة توضح المهنة. أخفِ الراتب ورقم الموظف وأي بيانات غير لازمة.' },
  { id: 'preparation_course', label: 'التأهيل للزواج', description: 'مراجعة شهادة إتمام دورة', evidenceHint: 'شهادة إتمام الدورة مع اسمها. أخفِ أرقام الهوية وأي بيانات غير لازمة.' },
] as const;
export type ManualVerificationKind = typeof verificationKinds[number]['id'];
export type ManualVerificationStatus = 'draft' | 'pending' | 'changes_requested' | 'approved' | 'rejected' | 'revoked' | 'withdrawn' | 'expired' | 'stale';
export type ManualVerificationClaim = {
  id: string;
  kind: ManualVerificationKind;
  label: string;
  reviewedAt: string;
  expiresAt: string;
  isTest: boolean;
};
export type ManualVerificationEvidence = { id: string; fileName: string; mimeType: string; sizeBytes: number; available: boolean };
export type ManualVerificationRequest = {
  id: string;
  kind: ManualVerificationKind;
  status: ManualVerificationStatus;
  claimSnapshot: Record<string, string | number | null>;
  memberNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reason: string | null;
  expiresAt: string | null;
  revision: number;
  isTest: boolean;
  isDummy?: boolean;
  evidence: ManualVerificationEvidence[];
};
export type ManualVerificationState = { requests: ManualVerificationRequest[]; claims: ManualVerificationClaim[]; isTest: boolean };
export type SubmitVerificationInput = {
  kind: ManualVerificationKind;
  file: File;
  memberNote?: string;
  claimLabel?: string;
  consent: true;
  consentVersion: typeof verificationConsentVersion;
};
export type ManualVerificationSource = {
  verification?: (action: 'state' | 'withdraw', payload?: Record<string, unknown>) => Promise<ManualVerificationState>;
  submitVerification?: (input: SubmitVerificationInput) => Promise<ManualVerificationState>;
  verificationTestMode?: boolean;
};

export const verificationStatusLabels: Record<ManualVerificationStatus, string> = {
  draft: 'لم يُرسل بعد', pending: 'قيد المراجعة', changes_requested: 'يحتاج استكمالًا', approved: 'تمت المراجعة',
  rejected: 'لم يُعتمد', revoked: 'سُحب التوثيق', withdrawn: 'سحبت الطلب', expired: 'انتهت الصلاحية', stale: 'تغيّرت بيانات الملف',
};

export function isVerificationKind(value: unknown): value is ManualVerificationKind {
  return verificationKinds.some(kind => kind.id === value);
}

/** Public claims contain no document paths or review notes. Do not infer a badge from a request status. */
export function currentVerificationClaims(value: unknown, now = Date.now()): ManualVerificationClaim[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is ManualVerificationClaim => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || !isVerificationKind(item.kind)
      || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 180 || typeof item.isTest !== 'boolean'
      || typeof item.reviewedAt !== 'string' || typeof item.expiresAt !== 'string') return false;
    const reviewed = Date.parse(item.reviewedAt), expires = Date.parse(item.expiresAt);
    const key = `${item.kind}:${item.isTest}`;
    if (!Number.isFinite(reviewed) || !Number.isFinite(expires) || reviewed > now + 300_000 || expires <= now || expires <= reviewed || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function verificationFileError(file: Pick<File, 'name' | 'size' | 'type'> | null): string | null {
  if (!file) return 'اختر مستندًا لإرساله للمراجعة.';
  if (!file.size) return 'الملف فارغ. اختر مستندًا آخر.';
  if (file.size > verificationMaxFileBytes) return 'حجم المستند أكبر من ٥ ميغابايت. اختر نسخة أصغر.';
  if (!(verificationMimeTypes as readonly string[]).includes(file.type)) return 'اختر صورة JPEG أو PNG، أو ملف PDF.';
  const extension = file.name.toLowerCase().split('.').pop();
  const expected = file.type === 'image/jpeg' ? ['jpg', 'jpeg'] : file.type === 'image/png' ? ['png'] : ['pdf'];
  if (!extension || !expected.includes(extension)) return 'امتداد الملف لا يطابق نوعه. اختر نسخة JPEG أو PNG أو PDF سليمة.';
  return null;
}

export function verificationDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('ar-SA', { calendar: 'gregory', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

type VerificationProfile = { displayName: string; age: number; gender: 'woman' | 'man'; education?: string; profession: string; marriageBasics?: { maritalStatus?: string; currentWives?: number } };
export function verificationProfileValue(kind: ManualVerificationKind, profile: VerificationProfile): string {
  if (kind === 'identity') return `${profile.displayName} · ${new Intl.NumberFormat('ar-SA').format(profile.age)} سنة`;
  if (kind === 'education') return profile.education?.trim() ?? '';
  if (kind === 'employment') return profile.profession.trim();
  if (kind === 'preparation_course') return '';
  const woman = profile.gender === 'woman';
  const status = profile.marriageBasics?.maritalStatus;
  const labels: Record<string, string> = { never_married: 'لم يسبق الزواج', divorced: woman ? 'مطلّقة' : 'مطلّق', widowed: woman ? 'أرملة' : 'أرمل', married: woman ? 'متزوجة' : 'متزوج' };
  if (status === 'married' && !woman && profile.marriageBasics?.currentWives) return `${labels.married} · عدد الزوجات: ${new Intl.NumberFormat('ar-SA').format(profile.marriageBasics.currentWives)}`;
  return status ? (labels[status] ?? '') : '';
}
