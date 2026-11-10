import { Capacitor, registerPlugin } from '@capacitor/core';
import { useEffect, useState } from 'react';
import { ShieldCheck } from '../BrandIcons';
import { feedback } from '../feedback/haptics';

type Privacy = { enabled: boolean; delay: number; available: boolean };
const native = registerPlugin<{
  privacyStatus(): Promise<Privacy>;
  privacyConfigure(options: { enabled: boolean; delay: number }): Promise<Privacy>;
}>('PrivateSession');

export function NativePrivacy() {
  const [state, setState] = useState<Privacy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (Capacitor.getPlatform() === 'ios') void native.privacyStatus().then(value => { if (active) setState(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!state) return null;
  async function configure(enabled: boolean, delay: number) {
    if (busy) return;
    setBusy(true); setError('');
    try { setState(await native.privacyConfigure({ enabled, delay }));feedback('selection'); }
    catch { setError('لم يتم التحقق. بقي إعداد الخصوصية كما هو. حاول مجددًا.'); }
    finally { setBusy(false); }
  }
  return <section className="st-section" aria-label="خصوصية iPhone">
    <h2>خصوصية iPhone</h2><div className="st-group">
      <button type="button" className="st-row st-switch" role="switch" aria-checked={state.enabled}
        disabled={busy || !state.available} onClick={() => void configure(!state.enabled, state.delay)}>
        <span className="st-icon"><ShieldCheck /></span><span className="st-row-copy"><strong>قفل نصفين</strong>
          <small>{state.available ? 'Face ID أو رمز قفل iPhone. يُطلب التحقق أيضًا لتغيير هذا الإعداد.' : 'فعّل رمز قفل iPhone أولًا لاستخدام قفل التطبيق.'}</small></span>
        <span className="st-switch-track" aria-hidden="true"><i /></span>
      </button>
      {state.enabled && <label className="st-row"><span className="st-row-copy"><strong>القفل بعد مغادرة التطبيق</strong></span>
        <select aria-label="مهلة قفل نصفين" value={state.delay} disabled={busy} onChange={event => void configure(true, Number(event.target.value))}>
          <option value={0}>فورًا</option><option value={60}>بعد دقيقة</option><option value={300}>بعد ٥ دقائق</option>
        </select></label>}
    </div><p className="st-notice">تُخفى محادثاتك تلقائيًا من معاينة التطبيقات عند مغادرة نصفين.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
