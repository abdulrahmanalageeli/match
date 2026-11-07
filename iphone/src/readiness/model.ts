export const readinessConsentVersion = 'readiness-v1' as const;
export const timelineOptions = [
  { id: 'within_6_months', label: 'خلال ٦ أشهر' },
  { id: '6_to_12_months', label: 'خلال ٦ إلى ١٢ شهرًا' },
  { id: 'over_12_months', label: 'بعد أكثر من سنة' },
  { id: 'exploring', label: 'أحتاج إلى تحديد الوقت المناسب' },
] as const;
export const familyOptions = [
  { id: 'discussed', label: 'تحدثت مع أسرتي عن رغبتي في الزواج' },
  { id: 'ready_to_discuss', label: 'مستعد لبدء الحديث مع الأسرة' },
  { id: 'not_yet', label: 'لم أبدأ الحديث بعد' },
] as const;
export const preparationItems = [
  { id: 'communication', label: 'الحوار وحل الخلاف', description: 'التعبير عن الاحتياجات والاستماع وإدارة الاختلاف باحترام.' },
  { id: 'budget', label: 'الخطة المالية', description: 'تصور واقعي لتكاليف الزواج والمصاريف المشتركة، دون ذكر مبالغ أو مستندات.' },
  { id: 'housing', label: 'السكن', description: 'تحديد الخيارات المناسبة والحديث عن التوقعات المتعلقة بالسكن.' },
  { id: 'responsibilities', label: 'المسؤوليات المشتركة', description: 'التفكير في العمل والمنزل والوقت والأدوار التي ستناقشانها معًا.' },
  { id: 'course', label: 'التأهيل للزواج', description: 'التعلم أو حضور برنامج للتأهيل للزواج. الإجابة هنا إفادة شخصية.' },
] as const;
export const preparationStatusOptions = [
  { id: 'not_started', label: 'لم أبدأ بعد' },
  { id: 'in_progress', label: 'أعمل عليه' },
  { id: 'ready', label: 'لدي تصور واضح' },
] as const;
export const readinessSections = [
  { id: 'timeline', label: 'الوقت المناسب ومشاركة الأسرة' },
  { id: 'preparation', label: 'الاستعداد العملي' },
  { id: 'verification', label: 'البيانات الموثّقة' },
] as const;
export type ReadinessTimeline = typeof timelineOptions[number]['id'];
export type ReadinessFamily = typeof familyOptions[number]['id'];
export type ReadinessPreparation = Record<typeof preparationItems[number]['id'], typeof preparationStatusOptions[number]['id']>;
export type ReadinessSection = typeof readinessSections[number]['id'];
export type ReadinessAction = 'get' | 'save' | 'share' | 'revoke' | 'view' | 'withdraw';
export type VerificationClaim = {
  id: string; kind: 'identity' | 'preparation_course'; label: string; issuer: string;
  method: 'issuer_confirmation'; verifiedAt: string; expiresAt: string; status: 'valid' | 'expired' | 'revoked';
};
export type ReadinessGrant = { connectionId: string; sections: ReadinessSection[]; expiresAt: string };
export type ReadinessDraft = {
  consentVersion: typeof readinessConsentVersion; timeline: ReadinessTimeline;
  family: ReadinessFamily; preparation: ReadinessPreparation;
};
export type ReadinessPassport = {
  consentedAt: string | null; updatedAt: string | null; timeline?: ReadinessTimeline;
  family?: ReadinessFamily; preparation?: ReadinessPreparation;
  claims: VerificationClaim[]; grants: ReadinessGrant[]; verificationAvailable: boolean;
};
export type SharedReadinessPassport = {
  available: boolean; sections: ReadinessSection[]; sharedUntil?: string; updatedAt?: string;
  timeline?: ReadinessTimeline; family?: ReadinessFamily; preparation?: ReadinessPreparation; claims?: VerificationClaim[];
};
export type ReadinessResult = ReadinessPassport | SharedReadinessPassport;
export type ReadinessRequest = (action: ReadinessAction, payload?: Record<string, unknown>) => Promise<ReadinessResult>;

export function emptyReadinessPassport(): ReadinessPassport {
  return { consentedAt: null, updatedAt: null, claims: [], grants: [], verificationAvailable: false };
}
export function isOwnerPassport(value: ReadinessResult): value is ReadinessPassport {
  return 'consentedAt' in value;
}
export function normalizeReadinessDraft(payload: Record<string, unknown>): ReadinessDraft {
  const preparation = payload.preparation;
  if (payload.consentVersion !== readinessConsentVersion) throw Error('وافق على معالجة بيانات جواز الجاهزية لحفظه.');
  if (!timelineOptions.some(option => option.id === payload.timeline) || !familyOptions.some(option => option.id === payload.family)) throw Error('اختر الوقت المناسب وحالة مشاركة الأسرة.');
  if (!preparation || typeof preparation !== 'object' || Array.isArray(preparation)) throw Error('أكمل أقسام الاستعداد العملي.');
  const statuses = preparation as Record<string, unknown>;
  if (preparationItems.some(item => !preparationStatusOptions.some(option => option.id === statuses[item.id]))) throw Error('أكمل أقسام الاستعداد العملي.');
  // Only the bounded self-reported fields can leave this draft; never claims or identifiers.
  return {
    consentVersion: readinessConsentVersion, timeline: payload.timeline as ReadinessTimeline,
    family: payload.family as ReadinessFamily,
    preparation: Object.fromEntries(preparationItems.map(item => [item.id, statuses[item.id]])) as ReadinessPreparation,
  };
}
export function currentVerificationStatus(claim: VerificationClaim, now = Date.now()): VerificationClaim['status'] {
  if (claim.status === 'revoked') return 'revoked';
  return claim.status !== 'valid' || !Number.isFinite(Date.parse(claim.expiresAt)) || Date.parse(claim.expiresAt) <= now ? 'expired' : 'valid';
}

/** A local demonstration has no verification issuer or consenting peer. Its data lives only in this source instance. */
export function createDemoReadiness(canShare: (connectionId: string) => boolean, notify: () => void, now = () => Date.now()): ReadinessRequest {
  let passport = emptyReadinessPassport();
  return async (action, payload = {}) => {
    passport.grants = passport.grants.filter(grant => Date.parse(grant.expiresAt) > now() && canShare(grant.connectionId));
    if (action === 'view') return { available: false, sections: [] };
    if (action === 'save') {
      const { consentVersion: _version, ...draft } = normalizeReadinessDraft(payload);
      const timestamp = new Date(now()).toISOString();
      passport = { ...passport, ...draft, consentedAt: passport.consentedAt ?? timestamp, updatedAt: timestamp };
    } else if (action === 'share') {
      if (!passport.consentedAt) throw Error('احفظ جوازك ووافق على معالجة بياناته أولًا.');
      if (typeof payload.connectionId !== 'string' || !canShare(payload.connectionId)) throw Error('المشاركة متاحة فقط مع تعارف متبادل نشط.');
      if (![7, 30].includes(payload.days as number)) throw Error('اختر مدة مشاركة صالحة.');
      if (!Array.isArray(payload.sections) || !payload.sections.length || payload.sections.some(section => !readinessSections.some(option => option.id === section))) throw Error('اختر الأقسام التي تريد مشاركتها.');
      passport.grants = passport.grants.filter(grant => grant.connectionId !== payload.connectionId);
      passport.grants.push({ connectionId: payload.connectionId, sections: [...new Set(payload.sections)] as ReadinessSection[], expiresAt: new Date(now() + Number(payload.days) * 86400000).toISOString() });
    } else if (action === 'revoke') {
      passport.grants = passport.grants.filter(grant => grant.connectionId !== payload.connectionId);
    } else if (action === 'withdraw') {
      passport = emptyReadinessPassport();
    } else if (action !== 'get') {
      throw Error('الإجراء غير متاح.');
    }
    if (action !== 'get') notify();
    return structuredClone(passport);
  };
}
