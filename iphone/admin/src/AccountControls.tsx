import { useRef, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { friendly } from './client';
import type { AdminApi, ManageAction, MemberDetail } from './types';

const actionLabels: Record<ManageAction, string> = { edit_profile: 'تعديل الملف', grant_access: 'منح وصول مجاني', revoke_access: 'إلغاء الوصول المجاني', set_dummy: 'تغيير تصنيف الحساب' };

export function AccountControls({ member, api, busy, setBusy, completed, onError }: {
  member: MemberDetail; api: AdminApi; busy: boolean; setBusy: (value: boolean) => void; completed: () => void; onError: (error: unknown) => void;
}) {
  const [action, setAction] = useState<ManageAction>('edit_profile');
  const [displayName, setDisplayName] = useState(member.displayName), [profession, setProfession] = useState(member.profession), [bio, setBio] = useState(member.bio);
  const [days, setDays] = useState('30'), [reason, setReason] = useState(''), [error, setError] = useState('');
  const intent = useRef<{ fingerprint: string; id: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || reason.trim().length < 3) return;
    const changes = action === 'edit_profile' ? { displayName: displayName.trim(), profession: profession.trim(), bio: bio.trim() } : action === 'grant_access' ? { days: Number(days) } : action === 'set_dummy' ? { isDummy: !member.isDummy } : {};
    const fingerprint = JSON.stringify([member.memberId, action, changes, member.revision, reason.trim()]);
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try { await api.manage(member.memberId, action, changes, member.revision, reason.trim(), intent.current.id); completed(); }
    catch (problem) { setError(friendly(problem)); onError(problem); }
    finally { setBusy(false); }
  }
  return <section className="review-section account-controls"><h3>إدارة الحساب</h3>
    <p className="muted">تُحفظ التغييرات باسمك مع سبب الإجراء.</p>
    <form onSubmit={event => void submit(event)}>
      <label>الإجراء<select value={action} disabled={busy} onChange={event => { setAction(event.target.value as ManageAction); setError(''); }}>
        {(Object.keys(actionLabels) as ManageAction[]).filter(value => (value !== 'set_dummy' || member.accountSource !== 'pair_test') && (value !== 'revoke_access' || Boolean(member.manualAccessUntil))).map(value => <option key={value} value={value}>{actionLabels[value]}</option>)}
      </select></label>
      {action === 'edit_profile' && <>
        <label>الاسم الظاهر<input required minLength={1} maxLength={60} value={displayName} disabled={busy} onChange={event => setDisplayName(event.target.value)} /></label>
        <label>المهنة<input required minLength={1} maxLength={100} value={profession} disabled={busy} onChange={event => setProfession(event.target.value)} /></label>
        <label>النبذة<textarea required minLength={1} rows={4} maxLength={1200} value={bio} disabled={busy} onChange={event => setBio(event.target.value)} /></label>
      </>}
      {action === 'grant_access' && <><label>مدة الوصول بالأيام<input type="number" min={1} max={365} step={1} required value={days} disabled={busy} onChange={event => setDays(event.target.value)} /></label><p className="muted">تبدأ المدة من اليوم وتستبدل مدة أي منحة سابقة. لا يُسجّل هذا الإجراء دفعة مالية.</p></>}
      {action === 'revoke_access' && <p className="notice">تُلغى منحة الوصول المجاني فقط. يظل الاشتراك المدفوع عبر المتجر ساريًا إن وُجد؛ هذا الإجراء لا يلغي اشتراك المتجر ولا ينفّذ استردادًا ماليًا.</p>}
      {action === 'set_dummy' && <p className="notice">سيصبح تصنيف هذا الحساب: <strong>{member.isDummy ? 'حساب حقيقي' : 'حساب وهمي (Dummy)'}</strong>. غيّر التصنيف فقط إذا كان يطابق طبيعة الحساب.</p>}
      <label>سبب الإجراء<textarea required minLength={3} maxLength={500} rows={2} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className={'primary' + (action === 'revoke_access' ? ' danger' : '')} disabled={busy || reason.trim().length < 3}>{busy ? 'جارٍ الحفظ…' : 'تأكيد ' + actionLabels[action]}<Check size={17}/></button>
    </form>
  </section>;
}
