export const familyConsentVersion = 'family-v1' as const;
export type FamilyRelationship = 'father' | 'mother' | 'brother' | 'sister' | 'relative';
export type FamilyAction = 'register' | 'state' | 'invite_link' | 'claim_link' | 'approve_link' | 'revoke_link' | 'revoke_invite' | 'consent' | 'create_room' | 'approve_room' | 'accept_room' | 'messages' | 'send' | 'read' | 'leave_room' | 'close_room' | 'export' | 'delete_family';
export type FamilyParticipant = { id: string; name: string; role: 'member' | 'family'; accepted?: boolean; left?: boolean };
export type FamilyLink = { id: string; memberName: string; familyName: string; relationship: FamilyRelationship; status: 'pending' | 'active'; adminReview: 'pending' | 'approved' | 'rejected'; owner: boolean };
export function familyLinkReady(link: Pick<FamilyLink, 'status' | 'adminReview'>): boolean { return link.status === 'active' && link.adminReview === 'approved'; }
export function familyLinkStatus(link: Pick<FamilyLink, 'status' | 'adminReview'>): string {
  if (link.adminReview === 'rejected') return 'لم تعتمد الإدارة الربط';
  if (link.adminReview !== 'approved') return 'بانتظار مراجعة الإدارة';
  return link.status === 'active' ? 'ربط جاهز' : 'بانتظار موافقة العضو';
}
export type FamilyInvitation = { id: string; relationship: FamilyRelationship; expiresAt: string };
export type FamilyRoom = {
  id: string; title: string; status: 'pending' | 'active' | 'closed'; participants: FamilyParticipant[];
  needsApproval: boolean; needsAcceptance: boolean; canRead: boolean; canSend: boolean; unread: number; leftByMe?: boolean;
  connectionId: string; createdAt: string;
};
export type FamilyMessage = { id: string; body: string; senderName: string; senderId: string; senderIsMe: boolean; createdAt: string; clientId: string };
export type FamilyBridge = { connectionId: string; mine: boolean; peer: boolean; enabled: boolean; participants: FamilyParticipant[]; memberIds: [string, string] };
export type FamilyState = {
  role: 'member' | 'guardian'; participantId: string; account: { displayName: string } | null;
  links: FamilyLink[]; invites?: FamilyInvitation[]; bridge?: FamilyBridge | null; rooms: FamilyRoom[];
};
export type FamilyInvite = { token: string; code: string; expiresAt: string; inviteId: string };
export type FamilyExport = { familyBridge: { state: FamilyState; messages: FamilyMessage[] }; exportedAt: string };
export type FamilyResult = FamilyState | FamilyInvite | FamilyMessage[] | FamilyExport | string | { deleted: true };
export type FamilyRequest = (action: FamilyAction, payload?: Record<string, unknown>) => Promise<FamilyResult>;

export function validFamilyToken(value: string): boolean { return /^[a-f0-9]{64}$/i.test(value); }
export function normalizeFamilyCode(value: string): string { return value.replace(/[\s-]/g, '').toUpperCase(); }
export function validFamilyCode(value: string): boolean { return /^[A-HJ-NP-Z2-9]{12}$/.test(normalizeFamilyCode(value)); }
export function unwrapFamilyResult(value: unknown): FamilyResult {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') throw Error(value.error);
  return value as FamilyResult;
}
/** Never put an invitation secret in a native/local URL. Missing deployment configuration leaves the short code usable. */
export function familyInviteUrl(token: string, origin: string = typeof window === 'undefined' ? '' : window.location.origin): string | null {
  if (!validFamilyToken(token)) throw Error('رمز الدعوة غير صالح.');
  try {
    const base = new URL(origin);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(base.hostname) || /\.(localhost|local)$/i.test(base.hostname)) return null;
    const url = new URL('/?family=1', base);
    url.hash = `invite=${token.toLowerCase()}`;
    return url.href;
  } catch { return null; }
}
export function isFamilyState(value: unknown): value is FamilyState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Partial<FamilyState>;
  return ['member', 'guardian'].includes(state.role ?? '') && typeof state.participantId === 'string' && Array.isArray(state.links) && Array.isArray(state.rooms);
}
export function boundedFamilyPayload(action: FamilyAction, payload: Record<string, unknown> = {}): Record<string, unknown> {
  if (action === 'register') {
    if (payload.consentVersion !== familyConsentVersion || payload.adult !== true) throw Error('يلزم الإقرار بالعمر والموافقة على إنشاء حساب الأهل.');
    const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
    if (displayName.length < 2 || displayName.length > 60) throw Error('اكتب اسمًا من حرفين إلى ٦٠ حرفًا.');
    return { displayName, adult: true, consentVersion: familyConsentVersion };
  }
  if (action === 'claim_link') {
    if (typeof payload.code === 'string') {
      if (!validFamilyCode(payload.code)) throw Error('أدخل معرّف الربط المكوّن من ١٢ حرفًا ورقمًا.');
      return { code: normalizeFamilyCode(payload.code) };
    }
    const token = typeof payload.token === 'string' ? payload.token.trim().toLowerCase() : '';
    if (!validFamilyToken(token)) throw Error('استخدم رمز الدعوة الكامل المكوّن من ٦٤ حرفًا، أو افتح رابط الدعوة.');
    return { token };
  }
  if (action === 'send') {
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    if (!body || body.length > 1000) throw Error('اكتب رسالة لا تتجاوز ١٠٠٠ حرف.');
    return { roomId: payload.roomId, body, clientId: payload.clientId };
  }
  return payload;
}

/** Only an explicit demo; no fake guardian identity, real invite, or simulated peer consent. */
export function createDemoFamily(
  connection: (id: string) => { name: string; id: string } | null,
  viewer: () => string, notify: () => void,
): FamilyRequest {
  const consents = new Map<string, boolean>();
  return async (action, payload = {}) => {
    const id = typeof payload.connectionId === 'string' ? payload.connectionId : '';
    const peer = id ? connection(id) : null;
    if (!peer && id) consents.delete(id);
    if (action === 'consent') {
      if (!peer) throw Error('جسر الأهل متاح مع تعارف مقبول فقط.');
      if (typeof payload.agree !== 'boolean') throw Error('حدّد قرارك بشأن جسر الأهل.');
      consents.set(id, payload.agree); notify();
    } else if (action === 'messages') return [];
    else if (action !== 'state') throw Error('هذه معاينة محلية. ربط الأهل والمراسلة متاحان في الحساب المتصل أو تجربة رهام وعبدالرحمن.');
    return {
      role: 'member', participantId: 'demo-viewer', account: { displayName: viewer() }, links: [], invites: [], rooms: [],
      bridge: peer ? { connectionId: id, mine: consents.get(id) ?? false, peer: false, enabled: false,
        participants: [{ id: 'demo-viewer', name: viewer(), role: 'member' }, { id: peer.id, name: peer.name, role: 'member' }], memberIds: ['demo-viewer', peer.id] } : null,
    };
  };
}
