import { call, AdminError, verificationEvidence } from './client';
import type { AdminApi, AuditRow, FamilyReviewRow, MemberDetail, ReportRow, SupportRow, VerificationRow, VerificationStatus } from './types';

export const liveApi: AdminApi = {
  support: (status, before) => call('marriage_support', { action: 'admin_list', payload: { status, before } }),
  supportReply: (id, revision, status, response, requestId) => call('marriage_support', { action: 'admin_reply', payload: { id, revision, status, response, requestId } }),
  overview: () => call('marriage_admin_overview'),
  applications: (status, before) => call('marriage_admin_applications', { status_filter: status, before_id: before || null }),
  member: id => call('marriage_admin_member', { member_id: id }),
  async review(id, action, revision, reason, requestId) { await call('marriage_admin_review', { member_id: id, action, expected_revision: revision, reason, request_id: requestId }); },
  async manage(id, action, changes, revision, reason, requestId) { await call('marriage_admin_manage', { member_id: id, action, changes, expected_revision: revision, reason, request_id: requestId }); },
  reports: (status, before) => call('marriage_admin_reports', { status_filter: status, before_id: before || null }),
  async reportAction(id, action, revision, reason, requestId) { await call('marriage_admin_report_action', { report_id: id, action, expected_revision: revision, reason, request_id: requestId }); },
  audit: before => call('marriage_admin_audit', { before_id: before || null }),
  health: () => call('marriage_admin_health'),
  family: (status, query, before) => call('marriage_admin_family', { status_filter: status, query, before_id: before || null }),
  familyReview: (id, action, revision, reason, requestId) => call('marriage_admin_family_review', { link_id: id, action, expected_revision: revision, reason, request_id: requestId }),
  verifications: (status, query, before) => call('marriage_admin_verifications', { status_filter: status, query, before_id: before || null }),
  verificationReview: (id, action, revision, reason, requestId, expiresInDays, reviewConfirmed) => call('marriage_admin_verification_review', { verification_id: id, action, expected_revision: revision, reason, request_id: requestId, expires_in_days: expiresInDays, review_confirmed: reviewConfirmed }),
  verificationEvidence: (id, evidenceId) => verificationEvidence(id, evidenceId),
};

export const demoOwner = { authorized: true, userId: 'demo-owner', role: 'owner' as const, displayName: 'مدير التجربة', mfaRequired: false };
export function createDemoApi(storage?: Pick<Storage, 'getItem' | 'setItem'>): AdminApi {
  if (!storage) { try { storage = window.localStorage; } catch { /* The demo still works when browser storage is disabled. */ } }
  const storageKey = 'nisfayn.admin.demo-data.v2';
  const day = (back: number) => new Date(Date.now() - back * 86400000).toISOString();
  const supportRows: SupportRow[] = [{ id: '60000000-0000-4000-8000-000000000001', ownerId: 'demo-family-account', category: 'access', subject: 'مساعدة تجريبية في ربط الأهل', body: 'هذا طلب وهمي لتجربة متابعة المساعدة داخل التطبيق.', status: 'open', response: null, revision: 1, createdAt: day(0), updatedAt: day(0) }];
  const names = ['نورة', 'فهد', 'سارة', 'عبدالله', 'ريم', 'خالد', 'هند', 'محمد'];
  const jobs = ['مصممة منتجات', 'مهندس معماري', 'باحثة', 'طبيب', 'محللة أعمال', 'مهندس برمجيات', 'معلمة', 'محاسب'];
  const members: MemberDetail[] = names.map((displayName, i) => ({ memberId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, displayName, age: 26 + i, gender: i % 2 ? 'man' : 'woman', city: 'الرياض', profession: jobs[i], status: i < 5 ? 'pending' : 'approved', suspended: i === 7, submittedAt: day(i / 3), revision: '1', bio: 'أقدّر الوضوح والتفاهم، وأبحث عن بداية جادة نشارك فيها الاهتمامات وتفاصيل الحياة.', interests: ['القراءة', 'السفر'], familyPreference: 'بعد التعارف الأول', preferredMinAge: 25, preferredMaxAge: 38, consentVersion: '2026-11-06-assessment', consentedAt: day(i / 3), assessmentVersion: 'marriage-v1', answeredTopics: 24 + i % 7 }));
  members[0].marriageBasics = { heightCm: 165, weightKg: 60, nationality: 'سعودية', tribalBackground: 'tribal', tribeName: 'قبيلة تجريبية', maritalStatus: 'never_married', childrenCount: 0, smoking: 'never', skinTone: 'tone_4', dressStyle: 'hijab', dressFlexibility: 'keep' };
  members[0].publicAvatar = { style: 'hijab', skinTone: 'tone_3' };
  members[1].marriageBasics = { heightCm: 178, weightKg: 78, nationality: 'سعودية', tribalBackground: 'non_tribal', maritalStatus: 'divorced', childrenCount: 1, smoking: 'sometimes' };
  const reports: ReportRow[] = [6, 7].map((index, i) => ({ reportId: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, reportedId: members[index].memberId, reportedName: members[index].displayName, reason: i ? 'بلاغ تجريبي عن تواصل غير مرغوب بعد طلب التوقف.' : 'بلاغ تجريبي يحتاج إلى مراجعة أسلوب التواصل.', createdAt: day(i / 2), resolvedAt: null, assignedTo: null, assignedName: null, revision: '1' }));
  const familyLinks: FamilyReviewRow[] = ['محمد العتيبي', 'أم نورة', 'خالد الدوسري', 'أم ريم'].map((guardianName, index) => ({ id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, guardianId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, guardianName, memberId: members[index].memberId, memberName: members[index].displayName, relationship: index % 2 ? 'والدة' : 'والد', memberStatus: index === 1 ? 'pending' : 'active', adminReview: index < 2 ? 'pending' : index === 2 ? 'approved' : 'rejected', submittedAt: day(index / 4), memberApprovedAt: index === 1 ? null : day(index / 5), reviewedAt: index < 2 ? null : day(index / 6), reviewedByName: index < 2 ? null : demoOwner.displayName, reason: index < 2 ? null : 'قرار توضيحي لحسابات خيالية فقط.', revision: '1' }));
  const audit: AuditRow[] = [];
  const verificationFixtures: Pick<VerificationRow, 'kind' | 'status' | 'claimSnapshot'>[] = [
    { kind: 'marital_status', status: 'pending', claimSnapshot: { maritalStatus: 'never_married' } },
    { kind: 'identity', status: 'pending', claimSnapshot: { displayName: 'فهد', age: 27 } },
    { kind: 'education', status: 'changes_requested', claimSnapshot: { education: 'ماجستير' } },
    { kind: 'employment', status: 'approved', claimSnapshot: { profession: 'طبيب' } },
    { kind: 'preparation_course', status: 'rejected', claimSnapshot: { course: 'الاستعداد للحياة الزوجية' } },
  ];
  const verificationRequests: VerificationRow[] = verificationFixtures.map((fixture, index) => ({ id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, memberId: members[index].memberId, memberName: members[index].displayName, isDummy: true, isTest: true, accountSource: 'member', kind: fixture.kind, status: fixture.status, claimSnapshot: fixture.claimSnapshot, memberNote: 'طلب توضيحي ببيانات وهمية فقط.', submittedAt: day(index / 3), reviewedAt: index < 2 ? null : day(index / 6), reviewedByName: index < 2 ? null : demoOwner.displayName, reason: index < 2 ? null : index === 2 ? 'يرجى تقديم صورة مكتملة للمؤهل.' : 'قرار توضيحي لطلب وهمي فقط.', expiresAt: index === 3 ? day(-90) : null, revision: 1, evidence: [{ id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, fileName: 'مستند توضيحي وهمي.svg', mimeType: 'image/svg+xml', sizeBytes: 480, available: true }] }));
  const operations = new Map<string, string>();
  members.forEach(row => { row.isDummy = true; row.accountSource = 'member'; row.paused = false; row.accessUntil = null; row.manualAccessUntil = null; row.accessActive = false; });
  try {
    const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
    if (saved?.version === 2 && Array.isArray(saved.members) && saved.members.length === members.length && saved.members.every((row: MemberDetail) => members.some(seed => seed.memberId === row.memberId) && typeof row.revision === 'string') && Array.isArray(saved.reports) && Array.isArray(saved.audit) && Array.isArray(saved.operations)) {
      members.splice(0, members.length, ...saved.members); reports.splice(0, reports.length, ...saved.reports); audit.push(...saved.audit);
      if (Array.isArray(saved.familyLinks) && saved.familyLinks.length === familyLinks.length && saved.familyLinks.every((row: FamilyReviewRow) => familyLinks.some(seed => seed.id === row.id) && typeof row.revision === 'string' && ['pending', 'approved', 'rejected'].includes(row.adminReview))) familyLinks.splice(0, familyLinks.length, ...saved.familyLinks);
      if (Array.isArray(saved.verificationRequests) && saved.verificationRequests.length === verificationRequests.length && saved.verificationRequests.every((row: VerificationRow) => verificationRequests.some(seed => seed.id === row.id) && Number.isInteger(row.revision) && ['pending', 'changes_requested', 'approved', 'rejected', 'revoked'].includes(row.status))) verificationRequests.splice(0, verificationRequests.length, ...saved.verificationRequests);
      if (Array.isArray(saved.supportRows) && saved.supportRows.length === supportRows.length && saved.supportRows.every((row: SupportRow) => supportRows.some(seed => seed.id === row.id) && Number.isInteger(row.revision) && ['open', 'in_review', 'resolved'].includes(row.status))) supportRows.splice(0, supportRows.length, ...saved.supportRows);
      saved.operations.forEach(([id, fingerprint]: [string, string]) => operations.set(id, fingerprint));
    }
  } catch { /* An obsolete or malformed local demo is replaced by the seeded accounts. */ }
  const persist = () => { try { storage?.setItem(storageKey, JSON.stringify({ version: 2, members, reports, familyLinks, verificationRequests, supportRows, audit, operations: [...operations] })); } catch { /* Keep the current session usable without persistent storage. */ } };
  const log = (action: string, targetType: string, targetId: string, reason: string) => { audit.unshift({ id: String(Number(audit[0]?.id || 0) + 1), actorId: demoOwner.userId, actorName: demoOwner.displayName, actorRole: 'owner', action, targetType, targetId, reason, createdAt: new Date().toISOString() }); persist(); };
  const member = (id: string) => { const row = members.find(m => m.memberId === id); if (!row) throw new AdminError('الملف غير متاح.'); return row; };
  const currentMember = (row: MemberDetail): MemberDetail => ({ ...row, accessActive: !!row.accessUntil && Date.parse(row.accessUntil) > Date.now() });
  const operation = (requestId: string, values: unknown[]) => {
    const fingerprint = JSON.stringify(values), previous = operations.get(requestId);
    if (previous && previous !== fingerprint) throw new AdminError('أعيد استخدام معرّف إجراء مختلف.');
    return { done: !!previous, save: () => { operations.set(requestId, fingerprint); persist(); } };
  };
  return {
    async support(status, before) { return { items: structuredClone(supportRows.filter(row => (status === 'all' || row.status === status) && !before)), nextCursor: null }; },
    async supportReply(id, revision, status, response, requestId) {
      const row = supportRows.find(item => item.id === id); if (!row) throw new AdminError('الطلب غير متاح.');
      const op = operation(requestId, [id, revision, status, response]); if (op.done) return structuredClone(row);
      if (row.revision !== revision) throw new AdminError('تغيّر الطلب. حدّث القائمة.', '40001');
      if (response.trim().length < 3 || response.length > 3000) throw new AdminError('أدخل ردًا صالحًا.');
      row.status = status; row.response = response.trim(); row.revision++; row.updatedAt = day(0); op.save(); return structuredClone(row);
    },
    async overview() { return { counts: { pendingApplications: members.filter(m => m.status === 'pending' && !m.suspended).length, openReports: reports.filter(r => !r.resolvedAt).length, suspendedMembers: members.filter(m => m.suspended).length, approvedMembers: members.filter(m => m.status === 'approved' && !m.suspended).length, totalMembers: members.length }, daily: [{ day: day(0).slice(0, 10), event: 'accepted', total: 7 }, { day: day(0).slice(0, 10), event: 'requested', total: 12 }], cohorts: [{ offer_week: day(6).slice(0, 10), version: 'marriage-v1', band: 'strong', returned: 42, opened: 31, requested: 12, accepted: 7, formal: 2 }] }; },
    async applications(status, before) { return structuredClone(members.filter(m => (status === 'all' || (status === 'dummy' ? m.isDummy : status === 'suspended' ? m.suspended : !m.suspended && m.status === status)) && (!before || m.memberId < before)).sort((a, b) => b.memberId.localeCompare(a.memberId)).slice(0, 50).map(currentMember)); },
    async member(id) { const row = member(id); log('member_viewed', 'member', id, 'مراجعة ملف تجريبي'); return structuredClone(currentMember(row)); },
    async review(id, action, revision, reason, requestId) {
      const op = operation(requestId, [id, action, revision, reason]); if (op.done) return;
      const row = member(id); if (row.revision !== revision) throw new AdminError('تغيّر الملف. أعد فتحه قبل اتخاذ القرار.', '40001');
      if (reason.trim().length < 3 || reason.trim().length > 500 || !['approve', 'suspend', 'restore', 'return_pending', 'pause', 'resume'].includes(action)) throw new AdminError('أدخل قرارًا وسببًا صالحين.');
      if (action === 'approve') { if (row.suspended || row.status !== 'pending') throw new AdminError('الطلب غير جاهز للمراجعة.'); row.status = 'approved'; }
      else if (action === 'return_pending') row.status = 'pending';
      else if (action === 'pause' || action === 'resume') row.paused = action === 'pause';
      else { row.suspended = action === 'suspend'; row.status = 'pending'; }
      row.revision = String(Number(row.revision) + 1); log(action, 'member', id, reason); op.save();
    },
    async manage(id, action, changes, revision, reason, requestId) {
      const op = operation(requestId, [id, action, changes, revision, reason]); if (op.done) return;
      const row = member(id); if (row.revision !== revision) throw new AdminError('تغيّر الملف. أعد فتحه قبل اتخاذ القرار.', '40001');
      if (reason.trim().length < 3 || reason.trim().length > 500 || !['edit_profile', 'grant_access', 'revoke_access', 'set_dummy'].includes(action)) throw new AdminError('أدخل قرارًا وسببًا صالحين.');
      if (action === 'edit_profile') {
        const { displayName, profession, bio } = changes;
        if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.trim().length > 60 || typeof profession !== 'string' || profession.trim().length < 1 || profession.trim().length > 100 || typeof bio !== 'string' || !bio.trim() || bio.length > 1200) throw new AdminError('راجع الاسم والمهنة والنبذة.');
        row.displayName = displayName.trim(); row.profession = profession.trim(); row.bio = bio.trim();
      } else if (action === 'grant_access') {
        const days = Number(changes.days); if (!Number.isInteger(days) || days < 1 || days > 365) throw new AdminError('المدة من يوم واحد إلى ٣٦٥ يومًا.');
        row.manualAccessUntil = new Date(Date.now() + days * 86400000).toISOString(); row.accessUntil = row.manualAccessUntil; row.accessActive = true;
      } else if (action === 'revoke_access') { row.manualAccessUntil = null; row.accessUntil = null; row.accessActive = false; }
      else if (action === 'set_dummy') { if (typeof changes.isDummy !== 'boolean' || row.accountSource === 'pair_test') throw new AdminError('لا يمكن تغيير تصنيف حساب الاختبار الخاص.'); row.isDummy = changes.isDummy; }
      row.revision = String(Number(row.revision) + 1); log(action, 'member', id, reason); op.save();
    },
    async reports(status, before) { return structuredClone(reports.filter(r => (status === 'open' ? !r.resolvedAt : !!r.resolvedAt) && (!before || r.reportId < before)).sort((a, b) => b.reportId.localeCompare(a.reportId)).slice(0, 50).map(row => { const reported = member(row.reportedId); return { ...row, reportedName: reported.displayName, isDummy: reported.isDummy }; })); },
    async reportAction(id, action, revision, reason, requestId) {
      const op = operation(requestId, [id, action, revision, reason]); if (op.done) return;
      const row = reports.find(r => r.reportId === id); if (!row) throw new AdminError('البلاغ غير متاح.');
      if (row.revision !== revision) throw new AdminError('تغيّر البلاغ. حدّث القائمة.', '40001');
      if (reason.trim().length < 3 || reason.trim().length > 500 || !['assign_self', 'resolve', 'reopen'].includes(action)) throw new AdminError('أدخل قرارًا وسببًا صالحين.');
      row.assignedTo = demoOwner.userId; row.assignedName = demoOwner.displayName;
      if (action === 'resolve') row.resolvedAt = new Date().toISOString();
      if (action === 'reopen') row.resolvedAt = null;
      row.revision = String(Number(row.revision) + 1); log(action, 'report', id, reason); op.save();
    },
    async audit(before) { return structuredClone(audit.filter(a => !before || Number(a.id) < Number(before)).slice(0, 100)); },
    async health() { return { serverTime: new Date().toISOString(), retentionDays: 30, clientEvents: [], push: { queued: 0, retrying: 0, sent24h: 0, failed24h: 0, oldestPendingAt: null } }; },
    async family(status, query, before) {
      if (!['pending', 'approved', 'rejected', 'all'].includes(status) || query.length > 80) throw new AdminError('راجع حالة الطلب أو عبارة البحث.');
      const needle = query.trim().toLocaleLowerCase();
      const rows = familyLinks.map(row => ({ ...row, memberName: members.find(member => member.memberId === row.memberId)?.displayName ?? row.memberName })).filter(row => (status === 'all' || row.adminReview === status) && (!needle || [row.guardianName, row.memberName].some(name => name.toLocaleLowerCase().includes(needle))) && (!before || row.id < before)).sort((a, b) => b.id.localeCompare(a.id));
      const items = rows.slice(0, 50);
      return structuredClone({ items, counts: { pending: familyLinks.filter(row => row.adminReview === 'pending').length, approved: familyLinks.filter(row => row.adminReview === 'approved').length, rejected: familyLinks.filter(row => row.adminReview === 'rejected').length }, nextCursor: rows.length > 50 ? items.at(-1)!.id : null });
    },
    async familyReview(id, action, revision, reason, requestId) {
      const op = operation(requestId, [id, action, revision, reason]);
      const row = familyLinks.find(item => item.id === id); if (!row) throw new AdminError('طلب الربط غير متاح.');
      if (op.done) return structuredClone(row);
      if (row.revision !== revision) throw new AdminError('تغيّر طلب الربط. حدّث القائمة قبل المراجعة.', '40001');
      if (reason.trim().length < 3 || reason.trim().length > 500 || !(action === 'approve' && row.adminReview !== 'approved' || action === 'reject' && row.adminReview === 'pending' || action === 'revoke' && row.adminReview === 'approved')) throw new AdminError('اختر إجراءً متاحًا وأدخل سببًا واضحًا.');
      row.adminReview = action === 'approve' ? 'approved' : 'rejected'; row.reviewedAt = new Date().toISOString(); row.reviewedByName = demoOwner.displayName; row.reason = reason.trim(); row.revision = String(Number(row.revision) + 1);
      log(action === 'approve' ? 'family_link_approved' : action === 'reject' ? 'family_link_rejected' : 'family_link_revoked', 'family_link', id, reason.trim()); op.save();
      return structuredClone(row);
    },
    async verifications(status, query, before) {
      const allowed: VerificationStatus[] = ['draft', 'pending', 'changes_requested', 'approved', 'rejected', 'revoked', 'withdrawn', 'expired', 'stale'];
      if ((status !== 'all' && !allowed.includes(status)) || query.length > 80) throw new AdminError('راجع حالة الطلب أو عبارة البحث.');
      const current = verificationRequests.map(row => ({ ...row, memberName: member(row.memberId).displayName, status: row.status === 'approved' && row.expiresAt && Date.parse(row.expiresAt) <= Date.now() ? 'expired' as const : row.status }));
      const needle = query.trim().toLocaleLowerCase();
      const rows = current.filter(row => (status === 'all' || row.status === status) && (!needle || row.memberName.toLocaleLowerCase().includes(needle)) && (!before || row.id < before)).sort((a, b) => b.id.localeCompare(a.id));
      const items = rows.slice(0, 50), counts = Object.fromEntries(allowed.map(value => [value, current.filter(row => row.status === value).length])) as Record<VerificationStatus, number>;
      return structuredClone({ items, counts, nextCursor: rows.length > 50 ? items.at(-1)!.id : null });
    },
    async verificationReview(id, action, revision, reason, requestId, expiresInDays, reviewConfirmed) {
      const op = operation(requestId, [id, action, revision, reason, expiresInDays, reviewConfirmed]);
      const row = verificationRequests.find(item => item.id === id); if (!row) throw new AdminError('طلب التحقق غير متاح.');
      if (op.done) return structuredClone(row);
      if (row.revision !== revision) throw new AdminError('تغيّر طلب التحقق. حدّث القائمة قبل المراجعة.', '40001');
      const validAction = row.status === 'pending' && ['approve', 'request_changes', 'reject'].includes(action) || row.status === 'approved' && action === 'revoke';
      if (!validAction || !reviewConfirmed || reason.trim().length < 3 || reason.trim().length > 500) throw new AdminError('راجع الطلب وأكّد المراجعة وأدخل سببًا واضحًا.');
      if (action === 'approve' && (!expiresInDays || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > (row.kind === 'marital_status' ? 90 : 365))) throw new AdminError('اختر مدة صالحة للمراجعة.');
      row.status = action === 'approve' ? 'approved' : action === 'request_changes' ? 'changes_requested' : action === 'reject' ? 'rejected' : 'revoked';
      row.reviewedAt = new Date().toISOString(); row.reviewedByName = demoOwner.displayName; row.reason = reason.trim(); row.expiresAt = action === 'approve' ? day(-expiresInDays!) : null; row.revision++;
      log('verification_' + action, 'verification_request', id, reason.trim()); op.save(); return structuredClone(row);
    },
    async verificationEvidence(id, evidenceId) {
      const row = verificationRequests.find(item => item.id === id), evidence = row?.evidence.find(item => item.id === evidenceId && item.available);
      if (!row || !evidence) throw new AdminError('المستند غير متاح.');
      log('verification_evidence_viewed', 'verification_request', id, 'فتح مستند توضيحي وهمي.');
      return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="700" height="460" viewBox="0 0 700 460"><rect width="700" height="460" fill="#faf6ee"/><rect x="30" y="30" width="640" height="400" rx="20" fill="white" stroke="#d8c4c7"/><text x="350" y="145" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#5a0f28">DEMO DOCUMENT</text><text x="350" y="225" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#765966">Fictional account. Not an identity document.</text><text x="350" y="310" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#765966">FOR WORKFLOW TESTING ONLY</text></svg>'], { type: 'image/svg+xml' });
    },
  };
}
