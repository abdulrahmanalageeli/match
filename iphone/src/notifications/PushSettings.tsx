import { useEffect, useState } from 'react';
import { Bell, Settings2 } from 'lucide-react';
import { disablePush, enablePush, getPushPreference, nativePush, openPushSettings, pushConfigured, pushStatus } from './push';

export function PushSettings({ owner, demo }: { owner: string | null; demo: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState('prompt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = Boolean(owner && !demo && nativePush && pushConfigured);
  useEffect(() => {
    let active = true;
    setEnabled(false); setError('');
    if (available && owner) {
      void Promise.all([getPushPreference(owner), pushStatus()]).then(([setting, device]) => {
        if (active) { setEnabled(setting.enabled); setPermission(device.permission); }
      }, () => { if (active) setError('تعذّر تحميل إعداد الإشعارات.'); });
    }
    return () => { active = false; };
  }, [available, owner]);
  async function toggle() {
    if (!available || !owner || busy) return;
    setBusy(true); setError('');
    try {
      const setting = enabled ? await disablePush(owner) : await enablePush(owner);
      setEnabled(setting.enabled);
      setPermission((await pushStatus()).permission);
    } catch (cause) {
      setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : 'تعذّر تحديث الإشعارات. حاول مجددًا.');
      void pushStatus().then(state => setPermission(state.permission));
    } finally { setBusy(false); }
  }
  return <section className="st-section" aria-labelledby="st-push-title">
    <h2 id="st-push-title">الإشعارات</h2>
    <div className="st-group">
      <button className="st-row st-switch" type="button" role="switch" aria-label="إشعارات التعارف والرسائل" aria-checked={enabled && permission === 'granted'}
        disabled={!available || busy} onClick={() => void toggle()}>
        <span className="st-icon" aria-hidden="true"><Bell /></span>
        <span className="st-row-copy"><strong>إشعارات التعارف والرسائل</strong><small>{!nativePush ? 'في الويب: تنبيهات داخل الموقع أثناء فتحه. لا تصل إشعارات نظام عند إغلاق المتصفح.' : demo ? 'تنبيهات داخل التجربة فقط؛ لا تُرسل إشعارات نظام.' : !pushConfigured ? 'لم تُفعّل خدمة الإشعارات بعد.' : 'تنبيهات عامة دون أسماء أو محتوى الرسائل.'}</small></span>
        <span className="st-switch-track" aria-hidden="true"><i /></span>
      </button>
      {available && permission === 'denied' && <button type="button" className="st-row" onClick={() => void openPushSettings().catch(() => setError('تعذّر فتح إعدادات الجهاز.'))}>
        <span className="st-icon"><Settings2 /></span><span className="st-row-copy"><strong>إعدادات إشعارات iPhone</strong><small>يمكنك السماح بالإشعارات من إعدادات الجهاز.</small></span>
      </button>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
