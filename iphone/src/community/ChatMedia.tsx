import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Mic, Pause, Play, RotateCcw, Send, Square, Trash2, LoaderCircle, CircleDashed, Eye, CheckCheck, LockKeyhole, X } from 'lucide-react';
import type { ChatAttachment, CommunitySource } from './data';
import './chatMedia.css';

const seconds = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
const safeError = (e: unknown) => e instanceof Error && /[\u0600-\u06ff]/.test(e.message) ? e.message : 'تعذّر إرسال المرفق. حاول مجددًا.';
type Draft = { blob: Blob; kind: ChatAttachment['kind']; url: string; clientId: string; duration?: number; viewOnce?: boolean };

async function preparePhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('اختر صورة بصيغة JPEG أو PNG أو WebP.');
  if (file.size > 8 * 1024 * 1024) throw Error('حجم الصورة يجب أن يكون أقل من ٨ ميغابايت.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw Error('تعذّر تجهيز الصورة.');
    ctx.fillStyle = '#faf6ee'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('تعذّر تجهيز الصورة.')), 'image/jpeg', .86));
  } finally { URL.revokeObjectURL(url); }
}

function VoicePlayer({ url, duration, failed }: { url: string; duration?: number; failed?: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false), [position, setPosition] = useState(0), [length, setLength] = useState(duration || 0), [error, setError] = useState('');
  async function toggle() {
    if (!audio.current) return;
    setError('');
    if (playing) audio.current.pause();
    else try { await audio.current.play(); } catch { setError('تعذّر التشغيل. حاول مجددًا.'); }
  }
  return <div className="cm-voice-note">
    <audio ref={audio} src={url} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onLoadedMetadata={() => { const value = audio.current?.duration; if (value && Number.isFinite(value)) setLength(value); }}
      onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)} onError={() => { setError('تعذّر تحميل التسجيل.'); failed?.(); }}/>
    <button type="button" className="cm-audio-play" aria-label={playing ? 'إيقاف التسجيل مؤقتًا' : 'تشغيل التسجيل الصوتي'} onClick={() => void toggle()}>{playing ? <Pause size={19}/> : <Play size={19}/>}</button>
    <div className="cm-audio-track"><span>رسالة صوتية</span><input aria-label="موضع تشغيل التسجيل" type="range" min="0" max={length || 1} step="0.1" value={Math.min(position,length || 1)} onChange={e => { const value = Number(e.target.value); if (audio.current) audio.current.currentTime = value; setPosition(value); }}/></div>
    <time dir="ltr">{seconds(playing || position ? position : length)}</time>
    {error && <small role="status">{error}</small>}
  </div>;
}

function PhotoViewer({ url, once, close }: { url: string; once: boolean; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className="cm-photo-viewer" dir="rtl" aria-label={once ? 'صورة للعرض مرة واحدة' : 'صورة المحادثة'}
    onCancel={event => { event.preventDefault(); close(); }} onContextMenu={event => event.preventDefault()}>
    <header><span><LockKeyhole size={17}/>{once ? 'صورة لمرة واحدة' : 'بينكما فقط'}</span><button type="button" aria-label="إغلاق الصورة" onClick={close} autoFocus><X size={23}/></button></header>
    <div className="cm-photo-viewer-image"><img src={url} alt="الصورة المرسلة في المحادثة" draggable={false} onDragStart={event => event.preventDefault()}/></div>
    <footer>{once && <strong><CircleDashed size={17}/>لن يمكن فتحها مجددًا بعد الإغلاق أو مغادرة التطبيق.</strong>}<p>لا يستطيع الموقع منع لقطات الشاشة أو تصوير الشاشة بجهاز آخر. احترم خصوصية الطرف الآخر.</p></footer>
  </dialog>;
}

export function MessageMedia({ source, requestId, attachment, senderIsMe = false }: { source: CommunitySource; requestId: string; attachment: ChatAttachment; senderIsMe?: boolean }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [viewer, setViewer] = useState(''), [opening, setOpening] = useState(false), [spent, setSpent] = useState(false);
  const alive = useRef(true), generation = useRef(0), displayed = useRef('');
  const once = attachment.viewOnce === true;
  function closeViewer() {
    generation.current++;
    if (once && displayed.current.startsWith('blob:')) URL.revokeObjectURL(displayed.current);
    displayed.current = ''; setViewer(''); setOpening(false);
  }
  useEffect(() => {
    alive.current = true;
    const hide = () => { if (document.hidden) closeViewer(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', closeViewer);
    return () => {
      alive.current = false; generation.current++;
      if (once && displayed.current.startsWith('blob:')) URL.revokeObjectURL(displayed.current);
      displayed.current = '';
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', closeViewer);
    };
  }, [attachment.id, once]);
  useEffect(() => {
    if (once) return;
    let active = true, loaded = '', epoch = 0;
    const photo = attachment.kind === 'photo';
    function discard() {
      epoch++;
      if (loaded.startsWith('blob:')) URL.revokeObjectURL(loaded);
      loaded = '';
      if (active) setUrl('');
    }
    async function load() {
      if (!active || photo && document.hidden) return;
      const ticket = ++epoch; setError('');
      try {
        const value = await source.mediaUrl?.(requestId, attachment.id);
        if (!value) return;
        if (!active || ticket !== epoch || photo && document.hidden) { if (value.startsWith('blob:')) URL.revokeObjectURL(value); return; }
        if (loaded.startsWith('blob:')) URL.revokeObjectURL(loaded);
        loaded = value; setUrl(value);
      } catch { if (active && ticket === epoch) setError('تعذّر تحميل المرفق.'); }
    }
    function visibility() {
      if (document.hidden) discard();
      else void load();
    }
    setUrl(''); void load();
    if (photo) document.addEventListener('visibilitychange', visibility);
    return () => { active = false; discard(); if (photo) document.removeEventListener('visibilitychange', visibility); };
  }, [source, requestId, attachment.id, attachment.kind, once, retry]);

  async function openPhoto() {
    if (opening || viewer || (once && (senderIsMe || spent || attachment.openedAt))) return;
    setError('');
    if (!once) { displayed.current = url; setViewer(url); return; }
    if (!source.openMedia) { setError('حدّث التطبيق لفتح هذه الصورة.'); return; }
    const ticket = ++generation.current; setOpening(true);
    try {
      const value = await source.openMedia(requestId, attachment.id);
      if (!alive.current || ticket !== generation.current || document.hidden) { if (value.startsWith('blob:')) URL.revokeObjectURL(value); return; }
      displayed.current = value; setSpent(true); setViewer(value);
    } catch (cause) { if (alive.current && ticket === generation.current) setError(safeError(cause)); }
    finally { if (alive.current && ticket === generation.current) setOpening(false); }
  }
  if (once) {
    const opened = spent || Boolean(attachment.openedAt);
    return <><button type="button" className="cm-once-photo" disabled={senderIsMe || opened || opening} onClick={() => void openPhoto()} aria-label={opened ? 'تم فتح الصورة لمرة واحدة' : senderIsMe ? 'صورة لمرة واحدة أرسلتها' : 'فتح الصورة لمرة واحدة'}>
      <span className="cm-once-mark">{opening ? <LoaderCircle className="cm-spin" size={24}/> : opened ? <CheckCheck size={24}/> : <CircleDashed size={25}/>}</span>
      <span><strong>{opened ? 'تم فتح الصورة' : 'صورة لمرة واحدة'}</strong><small>{opening ? 'جارٍ الفتح…' : opened ? 'لا يمكن عرضها مجددًا' : senderIsMe ? 'يمكن للطرف الآخر فتحها مرة واحدة' : 'اضغط للعرض · تختفي عند الإغلاق'}</small></span>
      {!senderIsMe && !opened && !opening && <Eye size={17}/>}</button>
      {error && <p className="cm-once-error" role="alert">{error}</p>}
      {viewer && <PhotoViewer url={viewer} once close={closeViewer}/>}</>;
  }
  if (error) return <button type="button" className="cm-media-retry" onClick={() => setRetry(n => n + 1)}><RotateCcw size={16}/> إعادة تحميل المرفق</button>;
  if (!url) return <div className="cm-media-loading" role="status"><LoaderCircle size={19}/> تحميل المرفق…</div>;
  return attachment.kind === 'photo' ? <><button type="button" className="cm-message-photo" onClick={() => void openPhoto()} onContextMenu={event => event.preventDefault()} aria-label="فتح الصورة بحجمها الكامل"><img src={url} alt="صورة أُرسلت في المحادثة" draggable={false} onDragStart={event => event.preventDefault()} onError={() => setError('تعذّر تحميل الصورة.')}/></button>{viewer && <PhotoViewer url={viewer} once={false} close={closeViewer}/>}</>
    : <VoicePlayer url={url} duration={attachment.duration} failed={() => setError('تعذّر تحميل التسجيل.')}/>;
}

export function ChatMediaComposer({ source, requestId, disabled, callActive, onRecording, sent }: {
  source: CommunitySource; requestId: string; disabled: boolean; callActive: boolean; onRecording: (active: boolean) => void; sent: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [recording, setRecording] = useState(false), [elapsed, setElapsed] = useState(0), [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const alive = useRef(true), capturing = useRef(false), generation = useRef(0), stopTimer = useRef<number | undefined>(undefined), lastUrl = useRef(''), chunks = useRef<Blob[]>([]), recordingStart = useRef(0);
  const onRecordingRef = useRef(onRecording); onRecordingRef.current = onRecording;
  function release() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; clearInterval(stopTimer.current); stopTimer.current = undefined; }
  function discardRecording() { if (!capturing.current) return; capturing.current = false; generation.current++; if (recorder.current?.state === 'recording') recorder.current.stop(); recorder.current = null; release(); if (alive.current) { setRecording(false); setBusy(false); onRecordingRef.current(false); } }
  function clearDraft() { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); lastUrl.current = ''; setDraft(null); setError(''); }
  function preview(blob: Blob, kind: Draft['kind'], duration?: number) { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); const url = URL.createObjectURL(blob); lastUrl.current = url; setDraft({ blob, kind, url, duration, clientId: crypto.randomUUID() }); }
  useEffect(() => { alive.current = true; const hide = () => { if (document.hidden) { discardRecording(); } }; document.addEventListener('visibilitychange', hide); return () => { alive.current = false; generation.current++; if (recorder.current?.state === 'recording') recorder.current.stop(); release(); if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); onRecordingRef.current(false); document.removeEventListener('visibilitychange', hide); }; }, []);
  useEffect(() => { if (callActive) discardRecording(); }, [callActive]);
  async function photo(file?: File) { if (!file || busy) return; setBusy(true); setError(''); const ticket = ++generation.current; try { const blob = await preparePhoto(file); if (alive.current && ticket === generation.current) preview(blob, 'photo'); } catch (e) { if (alive.current && ticket === generation.current) setError(safeError(e)); } finally { if (alive.current && ticket === generation.current) setBusy(false); } }
  async function record() {
    if (busy || disabled || callActive) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('التسجيل غير مدعوم في هذا المتصفح. افتح نصفين في Safari أو Chrome حديث.'); return; }
    setError(''); setBusy(true); capturing.current = true; onRecordingRef.current(true); const ticket = ++generation.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!alive.current || ticket !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const current = new MediaRecorder(media, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      recorder.current = current; chunks.current = []; recordingStart.current = Date.now();
      current.ondataavailable = e => { if (e.data.size && ticket === generation.current) chunks.current.push(e.data); };
      current.onerror = () => { if (ticket !== generation.current) return; discardRecording(); if (alive.current) setError('تعذّر تسجيل الصوت. حاول مجددًا.'); };
      current.onstop = () => {
        media.getTracks().forEach(track => track.stop()); if (!alive.current || ticket !== generation.current) return;
        release(); capturing.current = false;
        setRecording(false); onRecordingRef.current(false);
        const duration = Math.min(60, (Date.now() - recordingStart.current) / 1000), blob = new Blob(chunks.current, { type: current.mimeType || 'audio/webm' });
        if (duration < .5 || !blob.size) setError('التسجيل قصير جدًا. سجّل رسالة أطول قليلًا.');
        else if (blob.size > 8 * 1024 * 1024) setError('التسجيل أكبر من الحجم المسموح. حاول تسجيل رسالة أقصر.');
        else preview(blob, 'audio', duration);
      };
      current.start(250); setRecording(true); setElapsed(0); onRecordingRef.current(true);
      stopTimer.current = window.setInterval(() => { const value = (Date.now() - recordingStart.current) / 1000; setElapsed(Math.min(60, value)); if (value >= 60 && current.state === 'recording') current.stop(); }, 200);
    } catch { if (alive.current && ticket === generation.current) { setError('اسمح باستخدام الميكروفون من إعدادات المتصفح لتسجيل رسالة صوتية.'); capturing.current = false; onRecordingRef.current(false); release(); } }
    finally { if (alive.current && ticket === generation.current) setBusy(false); }
  }
  async function send() {
    if (!draft || !source.sendMedia || busy || disabled) return; setBusy(true); setError('');
    try { await source.sendMedia(requestId, draft.blob, draft.kind, draft.clientId, draft.duration, draft.viewOnce === true); if (alive.current) { clearDraft(); sent(); } }
    catch (e) { if (alive.current) setError(safeError(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  if (!source.sendMedia || !source.mediaUrl) return null;
  return <div className="cm-media-composer">
    <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="cm-file-input" tabIndex={-1} aria-label="اختيار صورة للمحادثة" onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void photo(file); }}/>
    {recording ? <div className="cm-recording" role="status"><span className="cm-record-dot"/><b>جارٍ التسجيل</b><time dir="ltr">{seconds(elapsed)} / 1:00</time><button type="button" onClick={() => recorder.current?.stop()} aria-label="إنهاء التسجيل ومعاينته"><Square size={17}/></button><button type="button" onClick={discardRecording} aria-label="إلغاء التسجيل"><Trash2 size={18}/></button></div>
      : draft ? <div className="cm-media-preview"><div className="cm-media-preview-content">{draft.kind === 'photo' ? <img src={draft.url} alt="معاينة الصورة قبل الإرسال"/> : <VoicePlayer url={draft.url} duration={draft.duration}/>}</div>{draft.kind === 'photo' && <div className="cm-once-setting"><label><input type="checkbox" checked={draft.viewOnce === true} disabled={busy} onChange={event => setDraft(current => current ? {...current, viewOnce: event.target.checked} : current)}/><CircleDashed size={19}/><span><strong>عرض لمرة واحدة</strong><small>{draft.viewOnce ? 'تُفتح مرة واحدة، ثم لا يمكن الرجوع إليها.' : 'يستطيع الطرف الآخر العودة إلى الصورة.'}</small></span></label>{draft.viewOnce && <p>لقطات الشاشة لا يمكن منعها في الموقع. أرسل فقط ما ترتاح لمشاركته.</p>}</div>}<div className="cm-media-preview-actions"><span>{busy ? 'جارٍ الإرسال…' : draft.kind === 'photo' ? 'جاهزة للإرسال' : 'استمع قبل الإرسال'}</span><button type="button" disabled={busy} aria-label="إزالة المرفق" onClick={clearDraft}><Trash2 size={18}/></button><button type="button" className="cm-media-send" disabled={busy || disabled} aria-label="إرسال المرفق" onClick={() => void send()}>{busy ? <LoaderCircle className="cm-spin" size={18}/> : <Send size={18}/>}</button></div></div>
        : <div className="cm-media-tools"><button type="button" disabled={disabled || busy} onClick={() => picker.current?.click()}><ImagePlus size={17}/> صورة</button><button type="button" disabled={disabled || busy || callActive} onClick={() => void record()}><Mic size={17}/> رسالة صوتية</button>{busy && <span role="status">جارٍ التجهيز…</span>}</div>}
    {error && <p className="cm-media-error" role="alert">{error}</p>}
  </div>;
}
