export const deepSections = {
  summary: 'ملخص التوافق', strengths: 'ما يجمعكما', differences: 'ما قد تختلفان عليه',
  patterns: 'ما وراء الإجابات', expectations: 'التوقعات المتبادلة', friction: 'نقاط تستحق الانتباه',
  conversation: 'أسئلة للنقاش بينكما', conclusion: 'الخلاصة',
} as const;
export type DeepSection = keyof typeof deepSections;
export type DeepStatus = 'none' | 'requested' | 'ready' | 'generating' | 'review' | 'shared' | 'declined' | 'cancelled' | 'stale' | 'failed';
export type DeepAction = 'get' | 'request' | 'accept' | 'decline' | 'cancel' | 'review';
export type DeepReview = { id: string; section: DeepSection; ownInterpretation: string; ownEvidence: { key: string; label: string; value: string }[] };
export type DeepFinding = { id: string; section: DeepSection; kind: 'strength' | 'manageable' | 'incompatibility' | 'uncertain'; text: string };
export type DeepSnapshot = {
  id?: string; status: DeepStatus; canRequest: boolean; requestedByMe: boolean;
  canGenerate: boolean; myReviewed: boolean; peerReviewed: boolean;
  review: DeepReview[]; findings: DeepFinding[];
};
export const deepConsentVersion = 'deep-assessment-v2' as const;
export function deepConsent(action: 'request' | 'accept', requestId?: string) {
  if (action === 'request') return { consentVersion: deepConsentVersion };
  if (!requestId) throw Error('أعد فتح الدعوة للموافقة عليها.');
  return { consentVersion: deepConsentVersion, requestId };
}
export type DeepAnalysisSource = {
  request(connectionId: string, action: DeepAction, decisions?: Record<string, boolean>, requestId?: string): Promise<DeepSnapshot>;
  generate(connectionId: string): Promise<void>;
};

const statuses: DeepStatus[] = ['none', 'requested', 'ready', 'generating', 'review', 'shared', 'declined', 'cancelled', 'stale', 'failed'];
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const section = (value: unknown): value is DeepSection => typeof value === 'string' && Object.hasOwn(deepSections, value);

/** Narrow every response: unfinished reports never enter the render state. No raw peer evidence is retained. */
export function deepSnapshot(value: unknown): DeepSnapshot {
  const data = record(value);
  if (!statuses.includes(data.status as DeepStatus)) throw Error('تعذّر تحميل حالة التقرير. حاول مجددًا.');
  const status = data.status as DeepStatus;
  const review: DeepReview[] = status === 'review' && Array.isArray(data.review) ? data.review.map(value => {
    const item = record(value);
    if (!text(item.id) || !section(item.section) || !text(item.ownInterpretation) || !Array.isArray(item.ownEvidence)) throw Error('تعذّر تحميل مراجعة المشاركة.');
    return { id: text(item.id), section: item.section, ownInterpretation: text(item.ownInterpretation), ownEvidence: item.ownEvidence.map(value => {
      const entry = record(value);
      return { key: text(entry.key), label: text(entry.label), value: text(entry.value) };
    }) };
  }) : [];
  const findings: DeepFinding[] = status === 'shared' && Array.isArray(data.findings) ? data.findings.map(value => {
    const item = record(value);
    if (!text(item.id) || !section(item.section) || !text(item.text) || !['strength', 'manageable', 'incompatibility', 'uncertain'].includes(text(item.kind))) throw Error('تعذّر تحميل التقرير المشترك.');
    return { id: text(item.id), section: item.section, kind: item.kind as DeepFinding['kind'], text: text(item.text) };
  }) : [];
  return { id: typeof data.id === 'string' ? data.id : undefined, status, canRequest: data.canRequest === true,
    requestedByMe: data.requestedByMe === true, canGenerate: data.canGenerate === true,
    myReviewed: data.myReviewed === true, peerReviewed: data.peerReviewed === true, review, findings };
}
