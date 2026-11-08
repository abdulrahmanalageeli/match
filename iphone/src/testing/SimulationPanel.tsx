import { useEffect, useState } from 'react';
import { FlaskConical, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import type { CommunitySource } from '../community/data';
import './simulation-panel.css';

const preferenceKey = 'nisfayn-abdulrahman-simulation-enabled-v1';
function prefersRunning() { try { return localStorage.getItem(preferenceKey) !== 'off'; } catch { return true; } }
function savePreference(enabled: boolean) { try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch { /* Session-only controls still work. */ } }

export function SimulationPanel({ source, paused }: { source: CommunitySource; paused: boolean }) {
  const simulation = source.simulation!;
  const [state, setState] = useState(() => simulation.snapshot());
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    const update = () => setState(simulation.snapshot());
    update();
    const stop = source.watch(update);
    const timer = window.setInterval(update, 1000);
    return () => { stop(); clearInterval(timer); simulation.dispose(); };
  }, [source, simulation]);
  useEffect(() => {
    if (paused) simulation.pause();
    else if (prefersRunning()) simulation.start();
  }, [paused, simulation]);
  async function step() {
    setError('');
    try { await simulation.step(); }
    catch { setError('تعذّر تنفيذ الخطوة. حاول مجددًا.'); }
    setState(simulation.snapshot());
  }
  return <section className="nf-simulation" aria-label="محاكاة الاستخدام">
    <div className="nf-simulation-title"><FlaskConical size={17}/><strong>محاكاة الاستخدام</strong><span>{state.running ? 'تعمل الآن' : 'متوقفة'}</span></div>
    <p>زيارات واهتمام وطلبات تتدرّج بشكل طبيعي، ومحادثات تتذكّر كلامك. تعمل المحاكاة أثناء استخدامك للتطبيق، وتحترم حدّ التعارفين.</p>
    <small>هذه شخصيات افتراضية لعبدالرحمن فقط. تُرسل محادثات المحاكاة النصية إلى OpenAI لتوليد الردود، وتبقى رهام ومحادثتكما خارج المحاكاة. تُحفظ الذاكرة على هذا المتصفح. المكالمات الصوتية الفعلية بينكما فقط.</small>
    <div className="nf-simulation-actions">
      <button type="button" disabled={paused || (state.busy && !state.running)} onClick={() => { savePreference(!state.running); state.running ? simulation.pause() : simulation.start(); setState(simulation.snapshot()); }}>
        {state.running ? <Pause size={14}/> : <Play size={14}/>} {state.running ? 'إيقاف مؤقت' : 'تشغيل المحاكاة'}
      </button>
      <button type="button" disabled={paused || state.busy || state.running} onClick={() => void step()}><SkipForward size={14}/>{state.busy ? 'جارٍ التنفيذ…' : 'خطوة واحدة'}</button>
      <button type="button" disabled={state.busy} onClick={() => setConfirmReset(true)}><RotateCcw size={14}/>إعادة المحاكاة</button>
    </div>
    {confirmReset && <div className="nf-simulation-reset" role="group" aria-label="تأكيد إعادة المحاكاة"><p>تُحذف محادثات الشخصيات الافتراضية ونشاطها من هذا المتصفح فقط. تبقى محادثتك مع رهام كما هي.</p><div className="nf-simulation-actions"><button type="button" onClick={()=>setConfirmReset(false)}>احتفظ بالمحادثات</button><button type="button" disabled={state.busy} onClick={()=>{simulation.reset();savePreference(true);if(!paused)simulation.start();setConfirmReset(false);setState(simulation.snapshot());}}>ابدأ محاكاة جديدة</button></div></div>}
    {error && <p role="alert">{error}</p>}
    <details className="nf-simulation-log"><summary>سجل النشاط · {new Intl.NumberFormat('ar-SA').format(state.eventCount)}</summary>
      {state.log.length ? <ol>{state.log.slice(-8).reverse().map(event => <li key={event.id}>{event.detail}</li>)}</ol> : <p>شغّل المحاكاة أو نفّذ خطوة لبدء التجربة.</p>}
    </details>
  </section>;
}
