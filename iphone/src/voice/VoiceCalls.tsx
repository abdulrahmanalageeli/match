import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AudioLines, Check, ChevronDown, Headphones, Mic, MicOff, Phone, PhoneOff, ShieldCheck, Volume2 } from "lucide-react";
import { Brand } from "../Brand";
import { PersonAvatar } from "../avatars/PersonAvatar";
import type { CommunitySource, Connection } from "../community/data";
import { callProblem, voiceSource, type CallAction, type VoiceCall } from "./source";
import { createVoiceTransport, prepareVoiceTransport, nativeVoice, type VoiceTransport } from "./transport";
import "./voice.css";
import { fatalVoiceError, retryVoice } from './recovery';

type Phase = "starting" | "ringing" | "connecting" | "connected" | "reconnecting" | "ended";
const VoiceContext = createContext<{ start: (connection: Connection) => void; occupied: boolean } | null>(null);
export const useVoiceCalls = () => useContext(VoiceContext);
const endLabels = { declined: "لم تُقبل المكالمة", cancelled: "أُلغيت المكالمة", ended: "انتهت المكالمة", missed: "لم يتم الرد", expired: "انقطع الاتصال", unavailable: "المكالمة غير متاحة" };

export function VoiceCallsProvider({ children, source, owner, demo, testApi }: {
  children: ReactNode; source: CommunitySource | null; owner: string | null; demo: boolean; testApi?: ReturnType<typeof voiceSource>;
}) {
  const api = useMemo(() => testApi || (owner && !demo ? voiceSource(owner) : null), [owner, demo, testApi]);
  const [call, setCall] = useState<VoiceCall | null>(null);
  const current = useRef<VoiceCall | null>(null);
  const [phase, setPhase] = useState<Phase>("ringing");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const mounted = useRef(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [canRetry,setCanRetry]=useState(false);
  const mutedRef=useRef(muted);mutedRef.current=muted;
  const speakerRef=useRef(speaker);speakerRef.current=speaker;
  const media = useRef<VoiceTransport | null>(null);
  const resumeMedia = useRef<(() => Promise<void>) | null>(null);
  const lastResumeAt = useRef(0);
  const seen = useRef(new Set<string>());
  const update = useCallback((next: VoiceCall | null) => {
    current.current = next;
    if (mounted.current) setCall(next);
  }, []);
  const finish = useCallback(async (action: "end" | "decline" = "end", reason: VoiceCall["endReason"] = "ended") => {
    const previous = current.current;
    if (!previous || previous.status === "ended") return;
    // Stop microphone/audio immediately, even if the server is temporarily unreachable.
    update({ ...previous, status: "ended", endedAt: new Date().toISOString(), endReason: reason });
    setPhase("ended"); setMinimized(false);
    const stopped = media.current?.leave().catch(() => {});
    if (api) {
      try { await api.act(previous.id, action); }
      catch { if (mounted.current) setError("توقف الصوت على جهازك. تعذّر تحديث حالة المكالمة؛ ستنتهي تلقائيًا."); }
    }
    await stopped;
  }, [api, update]);

  useEffect(() => {
    if (!demo && call?.status === "ringing") void prepareVoiceTransport().catch(() => {});
  }, [demo, call?.id, call?.status]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const previous = current.current;
      void media.current?.leave().catch(() => {});
      if (api && previous && previous.status !== "ended") void api.act(previous.id, "end").catch(() => {});
    };
  }, [api]);

  useEffect(() => {
    if (!source || !api) return;
    let alive = true, reading = false, resumeRequested = false;
    const refresh = async () => {
      if (!alive || reading || working.current || (document.hidden && current.current?.status !== "active")) return;
      const previous = current.current;
      if (previous?.status === "ended") return;
      const resume = resumeRequested;
      resumeRequested = false;
      reading = true;
      try {
        const next = await retryVoice(()=>api.state(previous?.id ?? null),()=>alive&&current.current?.status!=='ended',()=>{});
        if (!alive || working.current || current.current?.id !== previous?.id || current.current?.status === "ended") return;
        if (!next && previous) { void finish("end", "unavailable"); return; }
        if (!next || (!previous && (next.status === "ended" || seen.current.has(next.id)))) return;
        if (!previous) {
          setError(""); setMuted(false); setSpeaker(false); setConnectedAt(null); setMinimized(false);
        }
        update(next);
        setError(value => value === "الاتصال ضعيف. نحاول استعادته تلقائيًا…" ? "" : value);
        if (next.status === "ended") { setPhase("ended"); setMinimized(false); }
        else if (next.status === "ringing") setPhase("ringing");
        else if (resume) void resumeMedia.current?.();
      } catch (error) {
        // Authorization failures stop immediately; transient reads get bounded retries first.
        if (alive && previous && current.current?.id === previous.id && !working.current) {
          if (fatalVoiceError(error)) { setCanRetry(false); setError(callProblem(error)); void finish("end", "unavailable"); }
          else { setError("الاتصال ضعيف. نحاول استعادته تلقائيًا…"); }
        }
      } finally { reading = false; if (alive && resumeRequested) void refresh(); }
    };
    void refresh();
    const stop = source.watch(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 5_000);
    const resume = () => { lastResumeAt.current = Date.now(); resumeRequested = true; void refresh(); };
    const visible = () => {
      if (document.hidden) { if (nativeVoice) void finish(); }
      else resume();
    };
    const offline = () => { if(current.current?.status==='active')setPhase('reconnecting'); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("offline", offline);
    window.addEventListener("online", resume);
    return () => {
      alive = false; stop(); window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", resume);
    };
  }, [api, source, finish, update]);

  useEffect(() => {
    if (!call || call.status !== "active") return;
    if (demo) { setPhase("connected"); setConnectedAt(Date.now()); return; }
    if (!api) return;
    const id = call.id;
    let alive = true, renewing = false, peer = false, connecting=false, recovering=false, recoveries=0, generation=0;
    let transport:VoiceTransport;
    let disconnectedSince = Date.now();
    let renewedAt = Date.now();
    let stableSince = 0, rtcReconnecting = false;
    setPhase("connecting"); setPlaybackBlocked(false);
    const fail = (error: unknown) => {
      if (!active()) return;
      setCanRetry(!fatalVoiceError(error));
      setError(callProblem(error)); void finish("end", "expired");
    };
    const active=()=>alive&&current.current?.id===id&&current.current.status==='active';
    const retrying=()=>{if(active())setPhase('reconnecting');};
    const renew = async () => {
      if (!active() || renewing || connecting || !transport) return;
      const target = transport;
      renewing = true;
      try {
        const next = await retryVoice(()=>api.credentials(id),active,retrying);
        if (!active() || transport !== target) return;
        await target.renew(next.token);
        if (!active() || transport !== target) return;
        renewedAt = Date.now();
        if(peer&&!rtcReconnecting){disconnectedSince=0;setPhase('connected');setError('');}
      } catch (error) {
        if (active() && transport === target) {
          if (fatalVoiceError(error)) fail(error);
          else { disconnectedSince ||= Date.now(); retrying(); setError("الاتصال ضعيف. نحاول استعادته تلقائيًا…"); }
        }
      }
      finally { renewing = false; }
    };
    const makeTransport = () => {
      const ownGeneration = ++generation;
      const currentTransport = () => active() && ownGeneration === generation;
      return createVoiceTransport({
      peer(present) {
        if (!currentTransport()) return;
        peer = present;
        if (present) { disconnectedSince = 0; stableSince = Date.now(); setPhase("connected"); setError(""); setConnectedAt(value => value ?? Date.now()); }
        else { stableSince = 0; disconnectedSince = Date.now(); setPhase("reconnecting"); }
      },
      reconnecting(value) {
        if (!currentTransport()) return;
        rtcReconnecting = value;
        if (value) { stableSince = 0; disconnectedSince ||= Date.now(); setPhase("reconnecting"); }
        else if (peer) { disconnectedSince = 0; stableSince = Date.now(); setPhase("connected"); setError(""); }
      },
      renew: () => { if (currentTransport()) void renew(); },
      ended: () => { if (currentTransport()) void finish(); },
      error: error=>{if(!currentTransport()||connecting)return;if(fatalVoiceError(error)){fail(error);return;}disconnectedSince ||= Date.now();retrying();if(!document.hidden)void connect(true);},
      playbackBlocked: (blocked = true) => { if (currentTransport()) setPlaybackBlocked(blocked); },
    }); };
    async function connect(recovery=false){
      if(connecting||!active())return;connecting=true;recovering=recovery;
      if(recovery&&recoveries>=2){connecting=false;recovering=false;fail(new Error("تعذّر استعادة الصوت. يمكنك إعادة الاتصال."));return;}
      if(recovery){recoveries++;generation++;retrying();peer=false;rtcReconnecting=false;stableSince=0;disconnectedSince=Date.now();await transport?.leave().catch(()=>{});}
      try{
        await retryVoice(async()=>{
          const credentials=await api!.credentials(id);
          if(!active())return;
          const nextTransport=makeTransport();transport=nextTransport;media.current=nextTransport;
          try{await nextTransport.join(credentials,mutedRef.current);if(active()&&transport===nextTransport){if(nativeVoice)await nextTransport.speaker(speakerRef.current);renewedAt=Date.now();}}
          catch(error){await nextTransport.leave().catch(()=>{});throw error;}
        },active,retrying);
      }catch(error){if(active())fail(error);}finally{connecting=false;recovering=false;}
    }
    const resume = async () => {
      if (!active() || connecting || renewing) return;
      // The state refresh has already checked that both parties still allow this call.
      // Reset only the foreground recovery window, never the server's expiry or lease.
      if (disconnectedSince) disconnectedSince = Date.now();
      const target = transport;
      try {
        if (!target || !await target.resume()) { await connect(true); return; }
        if (active() && transport === target && Date.now() - renewedAt >= 20_000) await renew();
        if (active() && transport === target && peer && !disconnectedSince) { setPhase("connected"); setError(""); }
      } catch (error) { if (active() && transport === target) { if (fatalVoiceError(error)) fail(error); else await connect(true); } }
    };
    resumeMedia.current = resume;
    void connect();
    const timer = window.setInterval(() => {
      if (!active()) return;
      if (stableSince && Date.now() - stableSince > 30_000) recoveries = 0;
      if (!document.hidden && disconnectedSince && Date.now() - Math.max(disconnectedSince, lastResumeAt.current) > 45_000) fail(new Error("تعذّر الاتصال بالطرف الآخر."));
      else if (!connecting && !recovering && Date.now() - renewedAt >= 60_000) void renew();
    }, 5_000);
    return () => {
      alive = false; window.clearInterval(timer);
      if (resumeMedia.current === resume) resumeMedia.current = null;
      if (media.current === transport) media.current = null;
      void transport?.leave().catch(() => {});
    };
  }, [call?.id, call?.status, api, demo, finish]);

  useEffect(() => {
    if (!call || call.status === "ended") return;
    const tick = () => {
      setNow(Date.now());
      if (current.current?.status === "ringing" && Date.now() >= Date.parse(current.current.ringingUntil)) void finish("end", "missed");
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [call?.id, call?.status, finish]);

  const start = useCallback(async (connection: Connection) => {
    if (!source || (!demo && !api) || working.current || current.current || connection.status !== "accepted") return;
    working.current = true; setBusy(true); setError("");setCanRetry(false); setMuted(false); setSpeaker(false); setConnectedAt(null); setMinimized(false);
    const clientId = crypto.randomUUID();
    const initial: VoiceCall = {
      id: clientId, requestId: connection.id, status: "ringing", direction: "outgoing", person: connection.person,
      createdAt: new Date().toISOString(), ringingUntil: new Date(Date.now() + 45_000).toISOString(), acceptedAt: null, endedAt: null, endReason: null,
    };
    update(initial); setPhase(demo ? "ringing" : "starting");
    try {
      const result = demo ? initial : await api!.start(connection.id, clientId);
      if (!mounted.current) { if (api) void api.act(result.id, "end").catch(() => {}); return; }
      const latest = current.current as VoiceCall | null;
      if (latest?.id !== clientId || latest.status === "ended") { if (api) void api.act(result.id, "end").catch(() => {}); return; }
      update(result); setPhase(result.status === "ringing" ? "ringing" : result.status === "ended" ? "ended" : "connecting");
    } catch (error) {
      // Recover a successful server start whose response was lost, without starting a second call.
      const recovered = api ? await api.state(null).catch(() => null) : null;
      if (!mounted.current) { if (api && recovered && recovered.status !== "ended") void api.act(recovered.id, "end").catch(() => {}); return; }
      const latest = current.current as VoiceCall | null;
      if (latest?.id !== clientId || latest.status === "ended") { if (api && recovered && recovered.status !== "ended") void api.act(recovered.id, "end").catch(() => {}); return; }
      if (recovered && recovered.status !== "ended") { update(recovered); setPhase(recovered.status === "active" ? "connecting" : "ringing"); }
      else { update({ ...initial, status: "ended", endReason: "unavailable" }); setPhase("ended");setCanRetry(!fatalVoiceError(error)); setError(callProblem(error)); }
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }, [api, demo, source, update]);

  async function act(action: CallAction) {
    const previous = current.current;
    if (!previous || (working.current && action === "accept")) return;
    if (action !== "accept") { await finish(action, action === "decline" ? "declined" : previous.status === "ringing" ? "cancelled" : "ended"); return; }
    working.current = true; setBusy(true); setError("");
    try {
      const next = demo ? { ...previous, status: "active" as const, acceptedAt: new Date().toISOString() } : await api!.act(previous.id, action);
      if (mounted.current && current.current?.id === previous.id && current.current.status !== "ended") update(next);
      else if (api && next.status !== "ended") void api.act(next.id, "end").catch(() => {});
    } catch (error) { if (mounted.current) setError(callProblem(error)); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  async function control(kind: "mute" | "speaker") {
    if (working.current) return;
    working.current = true; setBusy(true);
    try {
      if (kind === "mute") { if (!demo) await media.current?.mute(!muted); setMuted(!muted); }
      else { if (!demo) await media.current?.speaker(!speaker); setSpeaker(!speaker); }
    } catch { setError("تعذّر تغيير إعداد الصوت. حاول مجددًا."); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  function dismiss() {
    if (call) { seen.current.add(call.id); if (seen.current.size > 30) seen.current.delete(seen.current.values().next().value!); }
    update(null); setError("");
  }
  const context = useMemo(() => source && (demo || api) ? { start: (connection: Connection) => void start(connection), occupied: !!call } : null, [source, demo, api, start, !!call]);
  const seconds = connectedAt ? Math.max(0, Math.floor(((call?.endedAt ? Date.parse(call.endedAt) : now) - connectedAt) / 1_000)) : 0;
  const duration = Math.floor(seconds / 60).toString().padStart(2, "0") + ":" + (seconds % 60).toString().padStart(2, "0");
  const status = call?.status === "ended" ? endLabels[call.endReason || "ended"] : {
    starting: "جارٍ بدء المكالمة…", ringing: call?.direction === "incoming" ? "مكالمة صوتية واردة" : "بانتظار الرد…",
    connecting: "جارٍ توصيل الصوت…", connected: "متصل الآن", reconnecting: "جارٍ استعادة الاتصال…", ended: "انتهت المكالمة",
  }[phase];

  return <VoiceContext.Provider value={context}>
    {children}
    {call && minimized ? <button className="nf-call-banner" onClick={() => setMinimized(false)}>
      <AudioLines size={20}/><span>مكالمة مع {call.person?.alias || "الطرف الآخر"}</span><b dir="ltr">{duration}</b>
    </button> : call && <VoiceDialog minimize={call.status === "active" ? () => setMinimized(true) : undefined}
      close={() => call.status === "ended" ? dismiss() : call.status === "active" ? setMinimized(true) : void act(call.direction === "incoming" ? "decline" : "end")}>
      <header><Brand/><span><ShieldCheck size={14}/> مكالمة داخل نصفين</span></header>
      {demo && <p className="nf-call-demo">معاينة تجريبية · لا يُستخدم الميكروفون ولا يُتصل بأي شخص</p>}
      <div className="nf-call-identity">
        <div className="nf-call-halo" data-active={call.status !== "ended" || undefined}>
          <div className="nf-call-avatar">{call.person&&source ? <PersonAvatar person={call.person} source={source}/> : <span>{call.person?.alias.slice(0, 1) || "ن"}</span>}</div>
        </div>
        <h1 id="nf-call-title">{call.person?.alias || "الطرف الآخر"}</h1>
        <p key={status} role="status" className="nf-call-status" data-phase={phase}>{status}</p>
        {connectedAt && <p className="nf-call-duration" dir="ltr" aria-label="مدة المكالمة">{duration}</p>}
        <div className="nf-call-wave" aria-hidden="true" data-moving={phase === "connected" && !muted || undefined}>{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ animationDelay: `${i * -0.17}s` }}/>)}</div>
      </div>
      {error && <p className="nf-call-error" role="alert">{error}</p>}
      {playbackBlocked && call.status === "active" && <button className="btn-secondary" onClick={() => { media.current?.play(); setPlaybackBlocked(false); }}>اضغط لسماع الطرف الآخر</button>}
      {call.status === "ended" ? <>{canRetry&&call.person&&<button className="btn-primary nf-call-done" onClick={()=>{const previous=call;dismiss();void start({id:previous.requestId,status:'accepted',direction:previous.direction,person:previous.person!});}}>إعادة الاتصال</button>}<button className="btn-secondary nf-call-done" onClick={dismiss}>العودة للمحادثة</button></> : <>
        <div className="nf-call-controls">
          {call.status === "ringing" && call.direction === "incoming" ? <>
            <CallControl label="رفض" icon={<PhoneOff/>} tone="end" disabled={busy} onClick={() => void act("decline")}/>
            <CallControl label="قبول المكالمة" icon={<Phone/>} tone="accept" disabled={busy} onClick={() => void act("accept")}/>
          </> : <>
            {call.status === "active" && <CallControl label={muted ? "تشغيل الميكروفون" : "كتم الصوت"} icon={muted ? <MicOff/> : <Mic/>} pressed={muted} disabled={busy || phase === "connecting" || phase === 'reconnecting'} onClick={() => void control("mute")}/>}
            <CallControl label={call.status === "ringing" ? "إلغاء" : "إنهاء"} icon={<PhoneOff/>} tone="end" onClick={() => void act("end")}/>
            {call.status === "active" && (nativeVoice || demo) && <CallControl label="مكبر الصوت" icon={<Volume2/>} pressed={speaker} disabled={busy || phase === "connecting"} onClick={() => void control("speaker")}/>}
          </>}
        </div>
        <p className="nf-call-footnote"><Headphones size={14}/> يبقى رقم هاتفك خاصًا. أبقِ التطبيق مفتوحًا أثناء المكالمة.</p>
        {!nativeVoice&&!demo&&<p className="nf-call-footnote">قد يوقف المتصفح الصوت عند قفل الشاشة أو الانتقال لتطبيق آخر؛ عند العودة نحاول استعادته تلقائيًا. مخرج الصوت يحدده جهازك، ويمكنك استخدام سماعة أو بلوتوث.</p>}
        {demo && call.status === "ringing" && call.direction === "outgoing" && <div className="nf-call-simulate">
          <button className="btn-secondary" onClick={() => void act("accept")}><Check size={16}/> محاكاة الرد</button>
          <button className="btn-text" onClick={() => { update({ ...call, direction: "incoming" }); }}>معاينة مكالمة واردة</button>
        </div>}
      </>}
    </VoiceDialog>}
  </VoiceContext.Provider>;
}

function CallControl({ label, icon, tone, pressed, disabled, onClick }: {
  label: string; icon: ReactNode; tone?: string; pressed?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return <div className="nf-call-control"><button type="button" aria-label={label} aria-pressed={pressed} disabled={disabled} data-tone={tone} onClick={onClick}>{icon}</button><span>{label}</span></div>;
}
function VoiceDialog({ children, close, minimize }: { children: ReactNode; close: () => void; minimize?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog className="nf-call" dir="rtl" ref={ref} aria-labelledby="nf-call-title" onCancel={event => { event.preventDefault(); close(); }}>
    {minimize && <button className="nf-call-minimize" aria-label="تصغير المكالمة" onClick={minimize}><ChevronDown size={22}/></button>}
    {children}
  </dialog>;
}
