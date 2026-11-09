import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Feather, HeartHandshake, MessageCircle, Route, Send } from 'lucide-react';
import type { CommunitySource, SeriousnessAgreement, StepProgress } from './data';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { chooseNextStep, nextStepState, type NextStepAssessment, type NextStepSnapshot, type NextStepState } from './nextStepModel';
import './next-step.css';

export function NextStep({ source, assessment, onAssessment, onRequest, onConversation, onStateChange }: {
  source: CommunitySource;
  assessment?: NextStepAssessment;
  onAssessment?: () => void;
  onRequest: (id: string) => void;
  onConversation: (id: string) => void;
  onStateChange?: (state: NextStepState) => void;
}) {
  const [snapshot, setSnapshot] = useState<NextStepSnapshot | null>(null);
  const reportState = useRef(onStateChange); reportState.current = onStateChange;
  useEffect(() => {
    let active = true, fetching = false, queued = false;
    setSnapshot(null);
    reportState.current?.({ loaded: false, acceptedCount: 0, exclusive: false, pendingIncomingCount: 0 });
    async function refresh() {
      if (document.hidden || !navigator.onLine) return;
      if (fetching) { queued = true; return; }
      fetching = true;
      try {
        const connections = await source.inbox();
        const accepted = connections.filter(c => c.status === 'accepted');
        const details = await Promise.all(accepted.map(async c => {
          const [agreement, progress] = await Promise.allSettled([source.agreement?.(c.id), source.progress?.(c.id)]);
          return { id: c.id, agreement: agreement.status === 'fulfilled' ? agreement.value : undefined, progress: progress.status === 'fulfilled' ? progress.value : undefined };
        }));
        if (!active) return;
        const next = { connections, requiresAgreement: Boolean(source.agreement),
          agreements: new Map(details.flatMap(d => d.agreement ? [[d.id, d.agreement] as [string, SeriousnessAgreement]] : [])),
          progress: new Map(details.flatMap(d => d.progress ? [[d.id, d.progress] as [string, StepProgress]] : [])),
        };
        setSnapshot(next); reportState.current?.(nextStepState(next));
      } catch { if (active) { setSnapshot(null); reportState.current?.({ loaded: false, acceptedCount: 0, exclusive: false, pendingIncomingCount: 0 }); } }
      finally { fetching = false; if (active && queued) { queued = false; void refresh(); } }
    }
    void refresh();
    const unwatch = source.watch(() => void refresh());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { active = false; unwatch(); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [source]);
  const next = snapshot && chooseNextStep(snapshot, onAssessment ? assessment : undefined);
  if (!next || next.kind === 'request') return null;
  const Icon = next.kind === 'assessment' ? BookOpen : next.kind === 'agreement' ? Feather : next.kind === 'journey' ? Route
    : next.kind === 'capacity' ? HeartHandshake : next.kind === 'waiting' ? Send : MessageCircle;
  const open = () => {
    if (next.target === 'assessment') onAssessment?.();
    else if (next.connectionId) (next.target === 'request' ? onRequest : onConversation)(next.connectionId);
  };
  return <MotionReveal key={next.key} as="section" className="nf-next-step" duration={320} distance={5} aria-label="خطوتك التالية">
    <span className="nf-next-step-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.6}/></span>
    <div className="nf-next-step-copy"><span className="nf-next-step-eyebrow">{next.attention ? 'بانتظارك' : 'الخطوة التالية'}</span>
      <h2>{next.title}</h2><p>{next.detail}</p>
      <MotionPressButton onClick={open}>{next.action}<ArrowLeft size={14} aria-hidden="true"/></MotionPressButton>
    </div>
  </MotionReveal>;
}
