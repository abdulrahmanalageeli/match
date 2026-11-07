import { useEffect, useState } from 'react';
import { FlaskConical, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import type { CommunitySource } from '../community/data';
import './simulation-panel.css';

export function SimulationPanel({ source, paused }: { source: CommunitySource; paused: boolean }) {
  const simulation = source.simulation!;
  const [state, setState] = useState(() => simulation.snapshot());
  const [error, setError] = useState('');
  useEffect(() => {
    const update = () => setState(simulation.snapshot());
    update();
    const stop = source.watch(update);
    const timer = window.setInterval(update, 1000);
    return () => { stop(); clearInterval(timer); simulation.pause(); };
  }, [source, simulation]);
  useEffect(() => { if (paused) simulation.pause(); }, [paused, simulation]);
  async function step() {
    setError('');
    try { await simulation.step(); }
    catch { setError('تعذّر تنفيذ الخطوة. حاول مجددًا.'); }
    setState(simulation.snapshot());
  }
  return <section className="nf-simulation" aria-label="محاكاة الاستخدام">
    <div className="nf-simulation-title"><FlaskConical size={17}/><strong>محاكاة الاستخدام</strong><span>{state.running ? 'تعمل الآن' : 'متوقفة'}</span></div>
    <p>١٥ رجلًا و١٥ امرأة، منهم {new Intl.NumberFormat('ar-SA').format(state.participants.length)} يتفاعلون في تجربتك. زيارات واهتمام وطلبات وردود بوتيرة متفاوتة.</p>
    <small>حسابات توضيحية بردود محلية جاهزة، وليست أشخاصًا حقيقيين. تُحفظ المحاكاة على هذا الجهاز ولا تُرسل رسائلها إلى مزوّد ذكاء اصطناعي. محادثتك مع الحساب الآخر منفصلة.</small>
    <div className="nf-simulation-actions">
      <button type="button" disabled={paused || (state.busy && !state.running)} onClick={() => { state.running ? simulation.pause() : simulation.start(); setState(simulation.snapshot()); }}>
        {state.running ? <Pause size={14}/> : <Play size={14}/>} {state.running ? 'إيقاف مؤقت' : 'تشغيل المحاكاة'}
      </button>
      <button type="button" disabled={paused || state.busy || state.running} onClick={() => void step()}><SkipForward size={14}/>{state.busy ? 'جارٍ التنفيذ…' : 'خطوة واحدة'}</button>
      <button type="button" disabled={state.busy} onClick={() => { simulation.reset(); setState(simulation.snapshot()); }}><RotateCcw size={14}/>إعادة المحاكاة</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <details className="nf-simulation-log"><summary>سجل النشاط · {new Intl.NumberFormat('ar-SA').format(state.eventCount)}</summary>
      {state.log.length ? <ol>{state.log.slice(-8).reverse().map(event => <li key={event.id}>{event.detail}</li>)}</ol> : <p>شغّل المحاكاة أو نفّذ خطوة لبدء التجربة.</p>}
    </details>
  </section>;
}
