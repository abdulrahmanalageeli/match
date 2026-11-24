import { useEffect, useRef, useState } from 'react';
import { nativeSession, type DeviceLockStatus } from '../session';

export function DeviceUnlockOffer({owner}: {owner: string}) {
  const preferenceKey = 'wudayn.device-lock-offer.v1.' + owner;
  const [nextOfferAt, setNextOfferAt] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(preferenceKey);
      return saved === 'never' ? null : Number(saved) || 0;
    } catch { return 0; }
  });
  function dismiss(permanent: boolean) {
    const next = permanent ? null : Date.now() + 24 * 60 * 60 * 1000;
    try { localStorage.setItem(preferenceKey, next === null ? 'never' : String(next)); } catch { /* Keep the choice for this visit. */ }
    setNextOfferAt(next);
    setOffer(null);
  }
  const [offer, setOffer] = useState<DeviceLockStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (nextOfferAt === null) return;
    let active = true, checked = false;
    const check = () => {
      if (!active || checked || document.hidden || Date.now() < nextOfferAt) return;
      checked = true;
      void nativeSession.privacyStatus().then(status => {
        if (active && status.available && !status.enabled &&
            (status.biometry === 'Face ID' || status.biometry === 'Touch ID')) setOffer(status);
      }).catch(() => {});
    };
    const remaining = nextOfferAt - Date.now();
    const timer = remaining > 0 ? window.setTimeout(check, remaining) : undefined;
    check();
    document.addEventListener('visibilitychange', check);
    return () => { active = false; clearTimeout(timer); document.removeEventListener('visibilitychange', check); };
  }, [nextOfferAt]);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [offer]);

  async function enable() {
    if (!offer || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const status = await nativeSession.privacyConfigure({ enabled: true, delay: offer.delay });
      if (status.enabled) dismiss(true);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!offer) return null;
  return <dialog ref={dialog} className="action-dialog device-unlock-offer" dir="rtl" lang="ar"
    aria-labelledby="device-unlock-title" aria-describedby="device-unlock-description"
    onCancel={event => { event.preventDefault(); if (!busy) dismiss(false); }}>
    <h2 id="device-unlock-title">تفعيل <bdi>{offer.biometry}</bdi>؟</h2>
    <p id="device-unlock-description">افتح وُدَين باستخدام <bdi>{offer.biometry}</bdi> على هذا الجهاز. عند الحاجة، تقدر تستخدم رمز قفل الجهاز. خيار القفل موجود دائمًا في الإعدادات.</p>
    {failed && <p role="alert">ما اكتمل التفعيل. تقدر تحاول مرة ثانية أو تكمّل الآن.</p>}
    <button type="button" className="f-primary" disabled={busy} onClick={() => void enable()}>
      {busy ? 'جارٍ التحقق…' : <>تفعيل <bdi>{offer.biometry}</bdi></>}
    </button>
    <button type="button" className="f-secondary" disabled={busy} onClick={() => dismiss(false)}>ذكّرني غدًا</button>
    <button type="button" className="device-unlock-dismiss" disabled={busy} onClick={() => dismiss(true)}>لا تذكّرني مرة أخرى</button>
  </dialog>;
}
