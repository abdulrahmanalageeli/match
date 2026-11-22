import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cloud } from '../cloud';
import { Camera, LockKeyhole, X } from '../BrandIcons';
import './verify-photo.css';

const consentedPhotos = new Set<string>();
function Capture({ done, consentKey, referenceUrl }: { done: (value: string | null) => void; consentKey?: string; referenceUrl?: string }) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const [consent, setConsent] = useState(Boolean(consentKey && consentedPhotos.has(consentKey))), [ready, setReady] = useState(false), [starting, setStarting] = useState(false), [error, setError] = useState('');
  const [capture, setCapture] = useState('');
  function stop() {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setReady(false);
  }
  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    const hidden = () => { if (document.hidden) { stop(); setCapture(''); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { alive.current = false; stream.current?.getTracks().forEach(track => track.stop()); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  async function start() {
    if (!consent || starting) return;
    if (consentKey) consentedPhotos.add(consentKey);
    setError(''); setStarting(true); setCapture('');
    try {
      stop();
      if (!navigator.mediaDevices?.getUserMedia) throw Error('unsupported');
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } } });
      if (!alive.current || document.hidden) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
    } catch { stop(); if (alive.current) setError('تعذّر فتح الكاميرا. اسمح بالوصول إليها من إعدادات التطبيق أو المتصفح، ثم حاول مجددًا.'); }
    finally { if (alive.current) setStarting(false); }
  }
  function take() {
    const v = video.current;
    if (!v || !v.videoWidth || !ready) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) { setError('تعذّر التقاط الصورة. حاول مجددًا.'); return; }
    context.drawImage(v, 0, 0, canvas.width, canvas.height);
    setError(''); setCapture(canvas.toDataURL('image/jpeg', .86)); stop();
  }
  return <dialog ref={dialog} className="nf-face-dialog" dir="rtl" aria-labelledby="face-title" onCancel={e => { e.preventDefault(); done(null); }}>
    <button className="nf-face-close" aria-label="إلغاء التحقق" onClick={() => done(null)}><X size={20}/></button>
    <h2 id="face-title">{capture ? 'راجع لقطة المطابقة' : 'مطابقة صورتك'}</h2>
    <p role="status">{capture ? 'إذا كان وجهك واضحًا، أرسل اللقطة للمطابقة.' : ready ? 'انظر إلى الكاميرا وضع وجهك داخل الإطار.' : 'خذ لقطة أمامية في إضاءة واضحة لمطابقتها مع صورتك المختارة.'}</p>
    <div className="nf-face-pair" data-reference={referenceUrl ? true : undefined}>
      {referenceUrl && <figure><div className="nf-face-frame"><img src={referenceUrl} alt="الصورة المختارة للمطابقة"/></div><figcaption>صورة ملفك</figcaption></figure>}
      <figure><div className="nf-face-frame nf-face-camera">
        {capture && <img src={capture} alt="لقطتك قبل إرسالها للتحقق"/>}
        <video ref={video} playsInline muted hidden={Boolean(capture)} data-ready={ready || undefined} onLoadedData={() => setReady(Boolean(stream.current))}/>
        {ready && !capture ? <span className="nf-face-guide" aria-hidden="true"/> : !capture && <Camera size={28} aria-hidden="true"/>}
      </div><figcaption><LockKeyhole size={13} aria-hidden="true"/> لقطة خاصة</figcaption></figure>
    </div>
    <label className="nf-face-consent"><input type="checkbox" checked={consent} disabled={ready || starting || Boolean(capture)} onChange={e => { setConsent(e.target.checked); if (!e.target.checked && consentKey) consentedPhotos.delete(consentKey); }}/><span>أوافق على مشاركة الصورتين مع مزوّد التحقق لمطابقة وجهي. تبقى لقطة الكاميرا مخفية عن الأعضاء.</span></label>
    <details className="nf-face-detail"><summary>من يعالج الصورتين؟</summary><p>تعالج شركة Authentica الصورتين للمطابقة. لا تُضاف لقطة الكاميرا إلى معرض صورك. <a href="https://authentica.sa" target="_blank" rel="noreferrer">عن مزوّد التحقق</a></p></details>
    {error && <p role="alert" className="nf-intake-error">{error}</p>}
    {capture ? <div className="nf-face-actions"><button className="btn-primary" onClick={() => done(capture.split(',')[1])}>مطابقة الصورة</button><button className="btn-secondary" onClick={() => void start()}>إعادة الالتقاط</button></div> : <button className="btn-primary" disabled={!consent || starting} onClick={() => ready ? take() : void start()}>{starting ? 'فتح الكاميرا…' : ready ? 'التقاط صورتي' : 'فتح الكاميرا'}</button>}
  </dialog>;
}

export async function captureForPhoto(requiredDuringOnboarding = false, consentKey?: string, referenceUrl?: string): Promise<string | null> {
  if (!cloud) throw Error('خدمة الصور غير متاحة.');
  if (!requiredDuringOnboarding) {
    const required = await cloud.rpc('marriage_photo_face_required');
    if (required.error) throw Error('تعذّر تجهيز التحقق من الصورة. حاول مجددًا.');
    if (!required.data) return null;
  }
  return new Promise((resolve, reject) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host), previous = document.activeElement as HTMLElement | null;
    root.render(<Capture consentKey={consentKey} referenceUrl={referenceUrl} done={value => { root.unmount(); host.remove(); previous?.focus(); if (value) resolve(value); else reject(Error('أُلغي التحقق. لم يتم نشر الصورة.')); }}/>);
  });
}

export async function verifyUploadedPhoto(photoId: string, kind: 'portrait' | 'gallery', selfie: string | null, staged = false) {
  if (!selfie) return;
  const session = await cloud!.auth.getSession();
  if (!session.data.session) throw Error('سجّل الدخول مجددًا لإكمال التحقق.');
  let response: Response;
  try {
    response = await fetch('https://nisfayn-admin.vercel.app/api/verify-photo', {
      method: 'POST', headers: { Authorization: 'Bearer ' + session.data.session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId, kind, selfie, consent: 'face-photo-v1', staged }), signal: AbortSignal.timeout(45000),
    });
  } catch { throw Error('تعذّر الاتصال بخدمة مطابقة الصور. لم تُنشر الصورة؛ حاول مجددًا.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.matched !== true) throw Error(result.error === 'no_match' ? 'لم تتطابق الصورتان. اختر صورة واضحة لك وأعد التقاط وجهك بإضاءة جيدة.' : result.error === 'rate_limited' ? 'وصلت إلى حد محاولات التحقق. حاول لاحقًا.' : 'تعذّر التحقق من الصورة حاليًا. لم تُنشر الصورة؛ حاول مجددًا.');
}
