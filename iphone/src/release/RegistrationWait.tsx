import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Settings2 } from 'lucide-react';
import { BrandWordmark } from '../Brand';
import { callRpc } from '../cloud';
import { registerPushDevice } from '../notifications/push';
import './registration-wait.css';

type Props = { owner: string; subscribed: boolean; onSettings: () => void; onRefresh: () => Promise<unknown> };

const previews = [
  { id: 'discovery', label: 'الاكتشاف', title: 'مين يشاركك أولوياتك؟', alt: 'قائمة ملفات توضيحية تظهر لكل شخص نبذة ونسبة التوافق' },
  { id: 'compatibility', label: 'التوافق', title: 'وش وراء النسبة؟', alt: 'شاشة التوافق وتفاصيل تشابه الطباع ومدى توافق التفضيلات' },
  { id: 'journey', label: 'التعارف', title: 'أول خطوة تتفقون عليها.', alt: 'ميثاق التعارف واختيار المدة بين الطرفين قبل أول رسالة' },
] as const;

export function RegistrationWait({owner, subscribed, onSettings, onRefresh}: Props) {
  const [enabled, setEnabled] = useState(subscribed);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const preview = previews[selected];
  const sending = useRef(false);
  useEffect(() => { setEnabled(subscribed); }, [subscribed]);

  async function toggle() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const installation = enabled ? null : await registerPushDevice(owner);
      const next = await callRpc<boolean>('wudayn_launch_alert', {subscribe: !enabled, installation}, owner);
      setEnabled(next);
      await onRefresh();
    } catch (reason) {
      setError(reason instanceof Error && /[\u0600-\u06ff]/.test(reason.message) ? reason.message : 'تعذّر تغيير تنبيه الإطلاق. حاول مرة أخرى.');
    } finally { sending.current = false; setBusy(false); }
  }
  return <main className="wd-wait" dir="rtl" aria-labelledby="wd-launch-title">
    <div className="wd-wait-inner">
      <header className="wd-wait-mast">
        <span className="wd-wait-brand"><img src="/brand/wudayn-emblem-v2.png" width="34" height="38" alt=""/><BrandWordmark/></span>
        <button className="wd-wait-settings" type="button" onClick={onSettings}><Settings2 size={15} aria-hidden="true"/>إعدادات حسابي</button>
      </header>
      <div className="wd-wait-intro">
        <p className="wd-wait-receipt"><Check size={14} aria-hidden="true"/> وصلنا طلبك</p>
        <h1 id="wd-launch-title">نلتقي عند الإطلاق<span aria-hidden="true">.</span></h1>
        <p className="wd-wait-description">نستقبل طلبات الانضمام الآن. قريبًا تقدر تكتشف مين يشاركك نظرتك للزواج.</p>
      </div>
      <section className="wd-wait-gallery" aria-label="من داخل وُدَين">
        <figure className="wd-wait-exhibit" id="wd-wait-preview">
          <figcaption>
            <div className="wd-wait-folio"><span>من داخل وُدَين</span><span className="wd-wait-folio-note">معاينة توضيحية</span></div>
            <h2 aria-live="polite" aria-atomic="true">{preview.title}</h2>
          </figcaption>
          <div className="wd-wait-window" data-preview={preview.id}>
            <div className="wd-wait-print" key={preview.id}><img src={`/brand/welcome/${preview.id}.webp`} width="804" height="1160" alt={preview.alt}/></div>
          </div>
        </figure>
        <div className="wd-wait-switcher" role="group" aria-label="اختر شاشة للمعاينة">
          {previews.map((item,index)=><button type="button" key={item.id} aria-controls="wd-wait-preview" aria-pressed={index===selected} onClick={()=>setSelected(index)}>{item.label}</button>)}
        </div>
      </section>
      <div className="wd-wait-actions">
        {enabled ? <>
          <p className="wd-wait-success" role="status"><Check size={19} aria-hidden="true"/>سنرسل لك تنبيهًا عند الإطلاق.</p>
          <button className="wd-wait-cancel" type="button" disabled={busy} onClick={toggle}>إلغاء تنبيه الإطلاق</button>
        </> : <>
          <button className="wd-wait-cta" aria-describedby="wd-wait-alert-note" type="button" disabled={busy} onClick={toggle}><Bell size={18} aria-hidden="true"/>{busy ? 'جارٍ التفعيل…' : 'نبّهني عند الإطلاق'}</button>
          <small id="wd-wait-alert-note" className="wd-wait-alert-note">تنبيه واحد يوم نفتح الاكتشاف.</small>
        </>}
        {error && <p className="wd-wait-error" role="alert">{error}</p>}
      </div>
    </div>
  </main>;
}
