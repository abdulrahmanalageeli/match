import { useEffect, useRef, useState } from 'react';
import { nativeSession, type DeviceLockStatus } from '../session';

export function DeviceUnlockOffer() {
  const [offer, setOffer] = useState<DeviceLockStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    void nativeSession.privacyStatus().then(status => {
      if (active && status.available && !status.enabled &&
          (status.biometry === 'Face ID' || status.biometry === 'Touch ID')) setOffer(status);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

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
      if (status.enabled) setOffer(null);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!offer) return null;
  return <dialog ref={dialog} className="action-dialog" dir="rtl" lang="ar"
    aria-labelledby="device-unlock-title" aria-describedby="device-unlock-description"
    onCancel={event => { event.preventDefault(); if (!busy) setOffer(null); }}>
    <h2 id="device-unlock-title">تفعيل <bdi>{offer.biometry}</bdi>؟</h2>
    <p id="device-unlock-description">افتح وُدَين باستخدام <bdi>{offer.biometry}</bdi> على هذا الجهاز. تقدر تستخدم رمز قفل الجهاز عند الحاجة.</p>
    {failed && <p role="alert">ما اكتمل التفعيل. تقدر تحاول مرة ثانية أو تكمّل الآن.</p>}
    <button type="button" className="f-primary" disabled={busy} onClick={() => void enable()}>
      {busy ? 'جارٍ التحقق…' : <>تفعيل <bdi>{offer.biometry}</bdi></>}
    </button>
    <button type="button" className="f-secondary" style={{ marginBlockStart: 8 }} disabled={busy} onClick={() => setOffer(null)}>لاحقًا</button>
  </dialog>;
}
