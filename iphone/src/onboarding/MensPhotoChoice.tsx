import { useRef, useState } from 'react';
import { Camera, ShieldCheck } from '../BrandIcons';
import { preparePortrait, type PortraitDraft } from '../photos/portraitPreparation';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import type { ProfilePortrait } from '../types';
import type { CommunitySource } from '../community/data';
import { requestPortraitModeration, retryStagedPortrait, stageOnboardingPortrait } from '../photos/stagedPortrait';
import './profile-photo-choice.css';

export function MensPhotoChoice({ change, onChange, existing, source, consented, onConsent, onBusy, immediateVerification = false }: {
  change: PortraitDraft | null | undefined; onChange: (v: PortraitDraft) => void; existing?: ProfilePortrait | null;
  source?: CommunitySource | null; consented: boolean; onConsent: (v: boolean) => void; onBusy: (v: boolean) => void; immediateVerification?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function choose(file: File) {
    setBusy(true); onBusy(true); setError('');
    try { const draft = await preparePortrait(file, 0, 'never'); onChange(draft); if (immediateVerification && consented) await check(draft); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تجهيز الصورة.'); }
    finally { onBusy(false); setBusy(false); }
  }
  async function check(draft: PortraitDraft, moderation = false) {
    setBusy(true); onBusy(true); setError('');
    try {
      const uploaded = await stageOnboardingPortrait(draft, 'man', true); onChange(uploaded);
      onChange(moderation ? await requestPortraitModeration(uploaded) : await retryStagedPortrait(uploaded));
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر التحقق. حاول مجددًا أو أرسل الصورة للمراجعة.'); }
    finally { onBusy(false); setBusy(false); }
  }
  const checked = change?.staged?.status === 'verified' || change?.staged?.status === 'approved';
  const pending = change?.staged?.status === 'moderation';
  return <section className="nf-photo-choice" data-field="portrait" tabIndex={-1} aria-label="صورة ملفك">
    <p className="nf-photo-intro">صورة واضحة لك تجعل البداية أكثر ثقة. اختر صورة يظهر فيها وجهك وحدك، ثم نطابقها مع لقطة جديدة من الكاميرا قبل أن تكمل.</p>
    <div className="nf-photo-stage">{change ? <img src={change.url} alt="صورتك المختارة"/> : existing ? <PortraitPhoto portrait={existing} source={source} alt="صورة ملفك"/> : <div><Camera size={34}/><span>صورتك، كما أنت</span></div>}</div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void choose(file); e.target.value = ''; }}/>
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}><Camera size={18}/>{busy ? 'تجهيز الصورة…' : change || existing ? 'اختيار صورة أخرى' : 'اختيار صورتي'}</button>
    {(change || existing) && <label className="nf-photo-consent"><input type="checkbox" checked={consented} disabled={busy} onChange={e => { onConsent(e.target.checked); if (e.target.checked && immediateVerification && change && !checked && !pending) void check(change); }}/><span>هذه صورتي وأوافق على عرضها في ملفي للأعضاء المؤهلين. نوضح استخدام لقطة التحقق قبل فتح الكاميرا.</span></label>}
    {immediateVerification && <>{busy && <p className="nf-photo-result" role="status">نجهّز صورتك ونتحقق منها…</p>}{checked && <p className="nf-photo-result" role="status"><ShieldCheck size={18}/>{change?.staged?.status === 'approved' ? 'صورتك جاهزة، اعتمدها فريق المراجعة.' : 'صورتك جاهزة، اكتملت مطابقة الصورة.'}</p>}{pending && <p className="nf-photo-result" role="status">أُرسلت للمراجعة. يمكنك إكمال ملفك، وستبقى الصورة خاصة حتى يوافق الفريق.</p>}{change && consented && !busy && !checked && !pending && <div className="nf-photo-retry"><button type="button" className="btn-secondary" onClick={() => void check(change)}>إعادة المحاولة</button>{change.staged && <button type="button" className="btn-secondary" onClick={() => void check(change, true)}>إرسال الصورة للمراجعة</button>}</div>}</>}
    <p className="nf-photo-safety"><ShieldCheck size={16}/><span>تبقى لقطة المطابقة خارج ملفك، ولا تظهر الصورة للأعضاء قبل اعتمادها. هذه مطابقة بين صورتين، وليست توثيقًا للهوية الوطنية أو فحص حيوية مستقلًا.</span></p>
    {error && <p role="alert" className="nf-intake-error">{error}</p>}
  </section>;
}
