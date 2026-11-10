import { useEffect, useState } from 'react';
import { Bell, Settings2 } from "../BrandIcons";
import { disablePush, enablePush, getPushPreference, nativePush, openPushSettings, pushConfigured, pushStatus, pushSupported } from './push';
import { needsHomeScreen } from './webPush';

export function PushSettings({ owner, demo, testerSession }: { owner: string | null; demo: boolean; testerSession?: string }) {
  owner = testerSession && nativePush ? 'tester:' + testerSession : owner;
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState('prompt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = Boolean(owner && (!demo || (testerSession && nativePush)) && pushSupported() && pushConfigured);
  const unavailableReason = demo && !(testerSession && nativePush)
    ? testerSession ? 'إشعارات حساباتكما متاحة من تطبيق نصفين على TestFlight. افتح التطبيق لتفعيلها.' : 'إشعارات الجهاز غير متاحة في تجربة التصفح. سجّل الدخول بحسابك أولًا.'
    : !nativePush && needsHomeScreen() ? 'أضف نصفين إلى الشاشة الرئيسية من قائمة المشاركة، ثم افتحه منها لتفعيل الإشعارات.'
    : !owner ? 'سجّل الدخول أولًا لتفعيل الإشعارات.'
    : !pushConfigured ? 'خدمة إشعارات المتصفح غير مفعّلة حاليًا.'
    : !pushSupported() ? 'هذا المتصفح لا يدعم إشعارات الجهاز.' : '';
  useEffect(() => {
    let active = true;
    setEnabled(false); setError('');
    const refresh = () => { if (available && owner) {
      void Promise.all([getPushPreference(owner), pushStatus()]).then(([setting, device]) => {
        if (active) { setEnabled(setting.enabled && (!('subscribed' in device) || device.subscribed)); setPermission(device.permission); }
      }, () => { if (active) setError('تعذّر تحميل إعداد الإشعارات.'); });
    } };
    const onVisible = () => { if (!document.hidden) refresh(); };
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [available, owner]);
  async function toggle() {
    if (busy) return;
    if (!available || !owner) { setError(unavailableReason); return; }
    setBusy(true); setError('');
    try {
      if (nativePush && (await pushStatus()).permission === 'denied') {
        await openPushSettings();
        return;
      }
      const setting = enabled ? await disablePush(owner) : await enablePush(owner);
      setEnabled(setting.enabled);
      setPermission((await pushStatus()).permission);
    } catch (cause) {
      setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : 'تعذّر تحديث الإشعارات. حاول مجددًا.');
      void pushStatus().then(state => setPermission(state.permission)).catch(() => {});
    } finally { setBusy(false); }
  }
  return <section className="st-section" aria-labelledby="st-push-title">
    <h2 id="st-push-title">الإشعارات</h2>
    <div className="st-group">
      <button className="st-row st-switch" type="button" role="switch" aria-label="إشعارات التعارف والرسائل" aria-checked={enabled && permission === 'granted'}
        disabled={busy} aria-busy={busy} onClick={() => void toggle()}>
        <span className="st-icon" aria-hidden="true"><Bell /></span>
        <span className="st-row-copy"><strong>إشعارات التعارف والرسائل</strong><small>{busy ? 'جارٍ تحديث الإشعارات…' : unavailableReason || (permission === 'denied' && nativePush ? 'اضغط للسماح بالإشعارات من إعدادات iPhone.' : 'تصلك حتى عند إغلاق نصفين، دون أسماء أو محتوى الرسائل.')}</small></span>
        <span className="st-switch-track" aria-hidden="true"><i /></span>
      </button>
      {nativePush && available && permission === 'denied' && <button type="button" className="st-row" onClick={() => void openPushSettings().catch(() => setError('تعذّر فتح إعدادات الجهاز.'))}>
        <span className="st-icon"><Settings2 /></span><span className="st-row-copy"><strong>إعدادات إشعارات iPhone</strong><small>يمكنك السماح بالإشعارات من إعدادات الجهاز.</small></span>
      </button>}
      {!nativePush && available && permission === 'denied' && <p className="st-notice" role="status">السماح بالإشعارات متوقف في إعدادات جهازك أو متصفحك. غيّر الإذن لنصفين، ثم فعّله هنا.</p>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
