import { useEffect, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { BrandWordmark } from '../Brand';
import { callRpc } from '../cloud';
import { registerPushDevice } from '../notifications/push';
import './release-screen.css';

type Props = { owner: string; subscribed: boolean; onSettings: () => void; onRefresh: () => Promise<unknown> };

export function RegistrationWait({owner, subscribed, onSettings, onRefresh}: Props) {
  const [enabled, setEnabled] = useState(subscribed);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
  return <main className="wd-release-screen wd-launch-wait" dir="rtl" aria-labelledby="wd-launch-title">
    <div className="wd-release-layout">
      <div className="wd-release-content">
        <div className="wd-release-brand"><img src="/brand/wudayn-icon-v2.png" alt="" width="64" height="64"/><BrandWordmark/></div>
        <h1 id="wd-launch-title">نلتقي عند الإطلاق</h1>
        <p className="wd-release-description">وصل طلبك. نستقبل طلبات الانضمام الآن، ويفتح الاكتشاف قريبًا.</p>
      </div>
      <div className="wd-release-actions">
        {enabled && <p className="wd-launch-subscribed" role="status"><Check size={17} aria-hidden="true"/>سنرسل لك تنبيهًا عند الإطلاق.</p>}
        {!enabled && <button type="button" disabled={busy} className="f-primary wd-release-primary" onClick={toggle}><span>{busy ? 'جارٍ التفعيل…' : 'نبّهني عند الإطلاق'}</span><Bell size={18} aria-hidden="true"/></button>}
        {error && <p className="wd-release-error" role="alert">{error}</p>}
        <button type="button" className="wd-release-retry" onClick={onSettings}>إعدادات حسابي</button>
        {enabled && <button type="button" className="wd-launch-cancel" disabled={busy} onClick={toggle}>إلغاء تنبيه الإطلاق</button>}
      </div>
    </div>
  </main>;
}
