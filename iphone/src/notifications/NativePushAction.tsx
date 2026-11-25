import { useEffect, useState } from 'react';
import { Bell } from '../BrandIcons';
import { enablePush, getPushPreference, nativePush, openPushSettings, pushConfigured, pushDeviceRegistered, pushStatus, registerPushDevice } from './push';

type Action = 'enable' | 'repair' | 'settings';

export function NativePushAction({ owner, settings = false }: { owner: string; settings?: boolean }) {
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!nativePush || !pushConfigured) return;
    let version = 0;
    async function refresh() {
      if (document.hidden) return;
      const request = ++version;
      try {
        const [pref, device] = await Promise.all([getPushPreference(owner), pushStatus()]);
        if (version !== request) return;
        if (device.permission === 'denied') setAction(settings ? null : 'settings');
        else if (!pref.enabled) setAction(settings ? null : 'enable');
        else setAction(pushDeviceRegistered(owner) ? null : 'repair');
      } catch { /* The settings page retains the full manual controls. */ }
    }
    void refresh();
    window.addEventListener('wudayn:push-registration', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      ++version;
      window.removeEventListener('wudayn:push-registration', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [owner, settings]);

  if (!action) return null;
  async function activate() {
    if (busy) return;
    setError(''); setBusy(true);
    try {
      if (action === 'settings') await openPushSettings();
      else {
        if (action === 'enable') await enablePush(owner);
        else await registerPushDevice(owner);
        setAction(null);
      }
    } catch {
      if ((await pushStatus().catch(() => null))?.permission === 'denied' && !settings) setAction('settings');
      setError('تعذّر تفعيل التنبيهات. تحقّق من إذن الإشعارات في إعدادات iPhone.');
    } finally { setBusy(false); }
  }
  return <>
    <button type="button" className={settings ? 'st-row' : 'nf-phone-alert-action'} disabled={busy} onClick={() => void activate()}>
      <Bell size={16} aria-hidden="true"/>{action === 'settings' ? 'إعدادات إشعارات iPhone' : 'تفعيل التنبيهات على هذا الجهاز'}
    </button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </>;
}
