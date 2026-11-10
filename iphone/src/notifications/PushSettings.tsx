import { useEffect, useState } from 'react';
import { Bell, Settings2 } from "../BrandIcons";
import { disablePush, enablePush, getPushPreference, nativePush, openPushSettings, pushConfigured, pushStatus, pushSupported, pushPrivacy, type PushPreview } from './push';
import { needsHomeScreen } from './webPush';
import { feedback } from '../feedback/haptics';

export function PushSettings({ owner, demo, testerSession }: { owner: string | null; demo: boolean; testerSession?: string }) {
  owner = testerSession && nativePush ? 'tester:' + testerSession : owner;
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState('prompt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview,setPreview]=useState<PushPreview>('private');
  const available = Boolean(owner && (!demo || (testerSession && nativePush)) && pushSupported() && pushConfigured);
  useEffect(() => {
    let active = true;
    setEnabled(false); setError('');
    if (available && owner) {
      void pushPrivacy(owner).then(value=>{if(active)setPreview(value.preview);}).catch(()=>{});
      void Promise.all([getPushPreference(owner), pushStatus()]).then(([setting, device]) => {
        if (active) { setEnabled(setting.enabled && (!('subscribed' in device) || device.subscribed)); setPermission(device.permission); }
      }, () => { if (active) setError('تعذّر تحميل إعداد الإشعارات.'); });
    }
    const refreshPrivacy=()=>{if(available&&owner)void pushPrivacy(owner).then(value=>{if(active)setPreview(value.preview);}).catch(()=>{});};
    window.addEventListener('nisfayn:push-privacy',refreshPrivacy);
    return () => { active = false;window.removeEventListener('nisfayn:push-privacy',refreshPrivacy); };
  }, [available, owner]);
  async function toggle() {
    if (!available || !owner || busy) return;
    setBusy(true); setError('');
    try {
      const setting = enabled ? await disablePush(owner) : await enablePush(owner);
      setEnabled(setting.enabled);
      feedback('selection');
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
        disabled={!available || busy} onClick={() => void toggle()}>
        <span className="st-icon" aria-hidden="true"><Bell /></span>
        <span className="st-row-copy"><strong>إشعارات التعارف والرسائل</strong><small>{demo && !(testerSession && nativePush) ? 'تنبيهات داخل التجربة فقط؛ لا تُرسل إشعارات نظام.' : !nativePush && needsHomeScreen() ? 'على iPhone: من قائمة المشاركة اختر «إضافة إلى الشاشة الرئيسية»، وافتح نصفين منها لتفعيل الإشعارات.' : !pushConfigured ? 'لم تُفعّل خدمة الإشعارات بعد.' : !pushSupported() ? 'هذا المتصفح لا يدعم الإشعارات. تبقى تنبيهاتك متاحة داخل نصفين.' : 'تصلك حتى عند إغلاق نصفين. أنت تختار ما يظهر فيها.'}</small></span>
        <span className="st-switch-track" aria-hidden="true"><i /></span>
      </button>
      {nativePush&&available&&enabled&&<label className="st-row"><span className="st-row-copy"><strong>معاينة الإشعارات</strong><small>الاسم أو النص قد يظهران على شاشة القفل. لا تظهر الصور الخاصة.</small></span>
        <select aria-label="معاينة الإشعارات" value={preview} disabled={busy} onChange={async event=>{
          const next=event.target.value as PushPreview;if(!owner)return;setBusy(true);setError('');
          try{setPreview((await pushPrivacy(owner,next)).preview);}catch{setError('لم يُحفظ إعداد المعاينة. حاول مجددًا.');}finally{setBusy(false);}
        }}><option value="private">إشعار خاص</option><option value="name">الاسم فقط</option><option value="content">الاسم والرسالة</option></select>
      </label>}
      {nativePush && available && permission === 'denied' && <button type="button" className="st-row" onClick={() => void openPushSettings().catch(() => setError('تعذّر فتح إعدادات الجهاز.'))}>
        <span className="st-icon"><Settings2 /></span><span className="st-row-copy"><strong>إعدادات إشعارات iPhone</strong><small>يمكنك السماح بالإشعارات من إعدادات الجهاز.</small></span>
      </button>}
      {!nativePush && available && permission === 'denied' && <p className="st-notice" role="status">السماح بالإشعارات متوقف في إعدادات جهازك أو متصفحك. غيّر الإذن لنصفين، ثم فعّله هنا.</p>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
