import { useRef, useState } from 'react';
import { Camera, ShieldCheck } from '../BrandIcons';
import { preparePortrait, type PortraitDraft } from '../photos/portraitPreparation';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import type { ProfilePortrait } from '../types';
import type { CommunitySource } from '../community/data';
import './profile-photo-choice.css';

export function MensPhotoChoice({ change, onChange, existing, source, consented, onConsent, onBusy }: {
  change: PortraitDraft | null | undefined; onChange: (v: PortraitDraft) => void; existing?: ProfilePortrait | null;
  source?: CommunitySource | null; consented: boolean; onConsent: (v: boolean) => void; onBusy: (v: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function choose(file: File) {
    setBusy(true); onBusy(true); setError('');
    try { onChange(await preparePortrait(file, 0, 'never')); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تجهيز الصورة.'); }
    finally { onBusy(false); setBusy(false); }
  }
  return <section className="nf-photo-choice" data-field="portrait" tabIndex={-1} aria-label="صورة ملفك">
    <p className="nf-photo-intro">صورة واضحة لك تجعل البداية أكثر ثقة. اختر صورة يظهر فيها وجهك وحدك؛ عند الحفظ سنطلب لقطة من الكاميرا لمطابقتها عبر Authentica.</p>
    <div className="nf-photo-stage">{change ? <img src={change.url} alt="صورتك المختارة"/> : existing ? <PortraitPhoto portrait={existing} source={source} alt="صورة ملفك"/> : <div><Camera size={34}/><span>صورتك، كما أنت</span></div>}</div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void choose(file); e.target.value = ''; }}/>
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}><Camera size={18}/>{busy ? 'تجهيز الصورة…' : change || existing ? 'اختيار صورة أخرى' : 'اختيار صورتي'}</button>
    {(change || existing) && <label className="nf-photo-consent"><input type="checkbox" checked={consented} onChange={e => onConsent(e.target.checked)}/><span>هذه صورتي وأوافق على عرضها في ملفي للأعضاء المؤهلين. موافقة مطابقة الوجه تُطلب بشكل منفصل قبل فتح الكاميرا.</span></label>}
    <p className="nf-photo-safety"><ShieldCheck size={16}/> لا تُنشر الصورة الجديدة حتى تنجح المطابقة. تبقى لقطة التحقق خارج ملفك.</p>
    {error && <p role="alert" className="nf-intake-error">{error}</p>}
  </section>;
}
