import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Eye, ImagePlus, LockKeyhole, ShieldCheck, Trash2, X } from "lucide-react";
import { privateUpdates, type WatchUpdates } from "../community/updates";
import { emptyPhotos, loadPhoto, photoOwner, photoState, preparePhoto, removePhoto, sharePhoto, uploadPhoto, type PhotoState } from "./photoData";
import "./photos.css";

const time = new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit" });
function PhotoDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog className="nf-photos" dir="rtl" ref={ref} aria-labelledby="nf-photo-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><span><LockKeyhole size={18} /> الصور الخاصة</span><button type="button" aria-label="إغلاق الصور الخاصة" onClick={close}><X size={20} /></button></header>
    <h2 id="nf-photo-title">{title}</h2>{children}
  </dialog>;
}

function usePhotos(owner: string | null, requestId?: string, watch?: WatchUpdates) {
  const [state, setState] = useState<PhotoState>(emptyPhotos);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [version, setVersion] = useState(0);
  const [visible, setVisible] = useState(!document.hidden);
  const refresh = useCallback(() => { setState(emptyPhotos); setBusy(true); setVersion(v => v + 1); }, []);
  const unavailable = useCallback(() => { setState(emptyPhotos); setError("الصورة غير متاحة الآن. حدّث الحالة للمحاولة مجددًا."); }, []);
  useLayoutEffect(() => { setState(emptyPhotos); setBusy(Boolean(owner)); }, [owner, requestId]);
  useEffect(() => {
    const visibility = () => { setVisible(!document.hidden); setState(emptyPhotos); if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", visibility);
    const stop = owner ? (watch ?? privateUpdates(owner))(() => { setState(emptyPhotos); refresh(); }) : undefined;
    // Routine authorization checks keep an already-open photo steady. Signals,
    // visibility changes and errors clear it immediately while revalidating.
    const timer = owner ? window.setInterval(() => { if (!document.hidden) setVersion(v => v + 1); }, 10000) : undefined;
    return () => { document.removeEventListener("visibilitychange", visibility); window.clearInterval(timer); stop?.(); };
  }, [owner, watch, refresh]);
  useEffect(() => {
    setError("");
    if (!owner || !visible) { setState(emptyPhotos); setBusy(false); return; }
    const controller = new AbortController();
    void photoState(owner, requestId, controller.signal).then(value => {
      if (!controller.signal.aborted) setState(value);
    }, () => {
      if (!controller.signal.aborted) { setState(emptyPhotos); setError("تعذّر فتح الصور الخاصة. قد تكون المشاركة انتهت أو أُغلقت المحادثة."); }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [owner, requestId, version, visible]);
  useEffect(() => {
    const ends = [state.peer?.expiresAt, state.sharedUntil].filter(Boolean).map(value => Date.parse(value!));
    if (!ends.length) return;
    const timer = window.setTimeout(() => { setState(emptyPhotos); refresh(); }, Math.max(0, Math.min(...ends) - Date.now()) + 10);
    return () => window.clearTimeout(timer);
  }, [state.peer?.expiresAt, state.sharedUntil, refresh]);
  return { state, busy, error, refresh, unavailable, visible };
}

function PrivateImage({ owner, photo, requestId, onUnavailable, label }: {
  owner: string; photo: NonNullable<PhotoState["mine"]>; requestId?: string; onUnavailable: () => void; label: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let address = "";
    setUrl("");
    void loadPhoto(owner, photo, controller.signal).then(async blob => {
      // Re-check after the download, so an in-flight response cannot revive a revoked grant.
      const fresh = await photoState(owner, requestId, controller.signal);
      const allowed = fresh.mine?.id === photo.id || fresh.peer?.id === photo.id;
      if (controller.signal.aborted) return;
      if (!allowed) { onUnavailable(); return; }
      address = URL.createObjectURL(blob); setUrl(address);
    }).catch(() => { if (!controller.signal.aborted) onUnavailable(); });
    return () => { controller.abort(); if (address) URL.revokeObjectURL(address); };
  }, [owner, photo.id, photo.path, requestId, onUnavailable]);
  return url ? <img className="nf-photo-image" src={url} alt={label} draggable={false} /> : <div className="nf-photo-placeholder" role="status"><Camera size={30} /><span>جارٍ فتح الصورة…</span></div>;
}

export function PhotoSettings({ owner, demo, close }: { owner: string; demo: boolean; close: () => void }) {
  const photos = usePhotos(demo ? null : owner);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [remove, setRemove] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  async function choose(file?: File) {
    if (!file || working || demo) return;
    setWorking(true); setError(""); setMessage("");
    try { const blob = await preparePhoto(file); if (alive.current) setPreview({ url: URL.createObjectURL(blob), blob }); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "تعذّر تجهيز الصورة."); }
    finally { if (alive.current) setWorking(false); if (input.current) input.current.value = ""; }
  }
  async function save() {
    if (!preview || working) return;
    setWorking(true); setError("");
    try { await uploadPhoto(owner, preview.blob); if (alive.current) { setPreview(null); photos.refresh(); setMessage("حُفظت صورتك. لا يراها أحد حتى تختار مشاركتها."); } }
    catch { if (alive.current) setError("تعذّر حفظ الصورة. حاول مجددًا."); }
    finally { if (alive.current) setWorking(false); }
  }
  async function erase() {
    if (working) return;
    setWorking(true); setError("");
    try { await removePhoto(owner); if (alive.current) { setRemove(false); photos.refresh(); setMessage("أُزيلت الصورة وأُوقفت جميع مشاركاتها."); } }
    catch { if (alive.current) setError("تعذّر حذف الصورة. حاول مجددًا."); }
    finally { if (alive.current) setWorking(false); }
  }
  return <PhotoDialog title="صورتك، بقرارك" close={close}>
    <p className="nf-photo-intro">صورة اختيارية محفوظة لحسابك. لا تظهر في الترشيحات، ويمكنك مشاركتها مؤقتًا داخل محادثة مقبولة.</p>
    {demo ? <div className="nf-photo-placeholder"><ShieldCheck size={36} /><p>الصور متاحة في الحساب الحقيقي فقط.<br />لا نرفع ملفات شخصية في التجربة.</p></div> : <>
      {preview ? <img className="nf-photo-image" src={preview.url} alt="معاينة صورتك قبل الحفظ" /> : photos.state.mine ?
        <PrivateImage owner={owner} photo={photos.state.mine} onUnavailable={photos.unavailable} label="صورتك الخاصة" /> :
        <div className="nf-photo-placeholder"><Camera size={36} /><span>{photos.busy ? "جارٍ تحميل صورتك…" : "لم تضف صورة بعد"}</span></div>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="nf-photo-input" aria-label="اختيار صورة خاصة" onChange={event => void choose(event.target.files?.[0])} />
      {preview ? <><p className="nf-photo-note">بحفظها تؤكد أنها صورتك وأنك توافق على تخزينها بشكل خاص. استبدال الصورة يلغي مشاركات الصورة السابقة.</p>
        <button className="btn-primary" disabled={working} onClick={() => void save()}>{working ? "جارٍ الحفظ…" : "حفظ صورتي الخاصة"}</button>
        <button className="btn-text" disabled={working} onClick={() => setPreview(null)}>تراجع</button></> : <>
        <button className="btn-secondary" disabled={working || photos.busy} onClick={() => input.current?.click()}><ImagePlus size={17} />{photos.state.mine ? "تغيير الصورة" : "اختيار صورة"}</button>
        {photos.state.mine && !remove && <button className="btn-text nf-photo-delete" onClick={() => setRemove(true)}><Trash2 size={16} /> حذف الصورة</button>}
        {remove && <div className="nf-photo-confirm"><p>سيُوقف ظهور الصورة لكل من شاركتها معه.</p><button className="btn-primary" disabled={working} onClick={() => void erase()}>تأكيد حذف الصورة</button><button className="btn-text" disabled={working} onClick={() => setRemove(false)}>تراجع</button></div>}
      </>}
    </>}
    {(error || photos.error) && <p role="alert" className="nf-photo-error">{error || photos.error}<button className="btn-text" onClick={photos.refresh}>إعادة المحاولة</button></p>}
    {message && <p role="status" className="nf-photo-note">{message}</p>}
    <p className="nf-photo-foot"><LockKeyhole size={14} /> نزيل بيانات الموقع واسم الملف الأصلي قبل الرفع.</p>
  </PhotoDialog>;
}

export function PhotoSharing({ requestId, name, demo, watch, close }: { requestId: string; name: string; demo: boolean; watch: WatchUpdates; close: () => void }) {
  const [owner, setOwner] = useState<string | null>(null);
  const [openPeer, setOpenPeer] = useState(false);
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const photos = usePhotos(owner, requestId, watch);
  useEffect(() => { let active = true; if (!demo) void photoOwner().then(id => { if (active) setOwner(id); }, () => { if (active) setError("انتهت الجلسة."); }); return () => { active = false; }; }, [demo]);
  useEffect(() => { if (!photos.visible || !photos.state.peer) setOpenPeer(false); }, [photos.visible, photos.state.peer]);
  async function share(value: boolean) {
    if (!owner || working || value && !consent) return;
    setWorking(true); setError("");
    try { await sharePhoto(owner, requestId, value); setConsent(false); photos.refresh(); }
    catch { setError("تعذّر تغيير مشاركة الصورة. حدّث الحالة وحاول مجددًا."); }
    finally { setWorking(false); }
  }
  return <PhotoDialog title="مشاركة خاصة بينكما" close={close}>
    <p className="nf-photo-intro">المشاركة اختيارية ومستقلة لكل طرف. إذنك يسمح لـ<bdi>{name}</bdi> بمشاهدة صورتك لمدة ٢٤ ساعة، ويمكنك سحبه قبل ذلك.</p>
    {demo ? <div className="nf-photo-placeholder"><ShieldCheck size={36} /><p>لا توجد صور شخصية في التجربة.<br />في الحساب الحقيقي يختار كل طرف متى يشارك صورته.</p></div> : <>
      <section className="nf-photo-section"><h3>صورتك</h3>
        {photos.busy ? <p role="status">جارٍ تحديث الإذن…</p> : photos.state.mine ? photos.state.sharedUntil ? <>
          <p className="nf-photo-note">صورتك متاحة حتى {time.format(new Date(photos.state.sharedUntil))}.</p>
          <button className="btn-secondary" disabled={working} onClick={() => void share(false)}>إيقاف مشاركة صورتي الآن</button>
        </> : <><label className="nf-photo-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> أوافق على مشاركة صورتي مع {name} لمدة ٢٤ ساعة.</label>
          <button className="btn-primary" disabled={!consent || working} onClick={() => void share(true)}>مشاركة صورتي</button></> : <p>أضف صورتك من الإعدادات ← صورتي الخاصة، ثم عد للمحادثة.</p>}
      </section>
      <section className="nf-photo-section"><h3>صورة {name}</h3>
        {owner && photos.state.peer ? openPeer ? <><PrivateImage owner={owner} photo={photos.state.peer} requestId={requestId} onUnavailable={photos.unavailable} label={"الصورة التي شاركها " + name} /><button className="btn-text" onClick={() => setOpenPeer(false)}>إغلاق الصورة</button></> :
          <button className="btn-secondary" onClick={() => setOpenPeer(true)}><Eye size={17} /> عرض الصورة المشتركة</button> : <div className="nf-photo-wait"><LockKeyhole size={22} /><p>لم يشارك الطرف الآخر صورته حاليًا.</p></div>}
      </section>
    </>}
    {(error || photos.error) && <p role="alert" className="nf-photo-error">{error || photos.error}<button className="btn-text" onClick={photos.refresh}>إعادة المحاولة</button></p>}
    <p className="nf-photo-foot">سحب الإذن يمنع المشاهدة الجديدة. لا يمكن منع لقطات الشاشة أو محو نسخة احتفظ بها الطرف الآخر.</p>
  </PhotoDialog>;
}
