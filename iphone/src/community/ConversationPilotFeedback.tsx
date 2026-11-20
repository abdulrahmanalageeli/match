import { useEffect, useState } from 'react';
import { ArrowLeft, Link2 } from 'lucide-react';
import { FeedbackChoice, FeedbackWindow } from './FeedbackWindow';
import { ConnectionReviewForm } from './ConnectionReviewForm';
import type { CommunitySource, ConversationPilotAnswer, ConversationPilotState } from './data';

function YesNo({ label, value, change }: { label: string; value: boolean | undefined; change: (value: boolean) => void }) {
  return <FeedbackChoice label={label} choices={['نعم', 'لا']} value={value === undefined ? undefined : value ? 'نعم' : 'لا'} change={choice => change(choice === 'نعم')}/>;
}

export function ConversationPilotFeedback({ requestId, respond, resumeChat, expanded, showUnavailable }: {
  requestId: string;
  respond: NonNullable<CommunitySource['conversationPilot']>;
  resumeChat: () => void;
  expanded?: boolean;
  showUnavailable?: boolean;
}) {
  const [pilot, setPilot] = useState<ConversationPilotState | null>(null);
  const [answer, setAnswer] = useState<Partial<ConversationPilotAnswer>>({});
  const [followup, setFollowup] = useState<boolean | undefined>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);
  const { talked } = answer;
  const { enjoyed, continue: wantsMore } = talked === true ? answer : {};
  const complete = talked === false || (talked === true && enjoyed !== undefined && wantsMore !== undefined);

  useEffect(() => {
    let current = true;
    let previousStage: string | undefined;
    async function refresh() {
      if (document.hidden) return;
      try {
        const result = await respond(requestId);
        if (!current) return;
        const stage = result?.stage ?? (result ? 'first' : 'hidden');
        setLoaded(true);
        if (stage === previousStage) { setPilot(result); return; }
        previousStage=stage;
        setPilot(result); setStatus('');
        setAnswer(result?.answer ?? {});
        setFollowup(result?.followupTalked ?? undefined);
      } catch { /* A later foreground read retries. */ }
    }
    void refresh();
    const timer=window.setInterval(refresh, 15*60*1000);
    document.addEventListener('visibilitychange',refresh);
    return () => { current=false; window.clearInterval(timer); document.removeEventListener('visibilitychange',refresh); };
  }, [requestId, respond]);

  async function update(action: 'save' | 'withdraw' | 'followup', clearFollowup = false) {
    if (busy) return;
    const payload: ConversationPilotAnswer | undefined = talked === false ? {talked} :
      talked === true && enjoyed !== undefined && wantsMore !== undefined ? {talked, enjoyed, continue: wantsMore} : undefined;
    if (action === 'save' && !payload) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await respond(requestId, action, action === 'followup'
        ? (clearFollowup || followup === undefined ? undefined : {followupTalked: followup})
        : payload);
      if (!result) {
        setStatus('انتهت فترة تسجيل الإجابة.');
        return;
      }
      setAnswer(result.answer ?? {});
      setPilot(result);
      setFollowup(result.followupTalked ?? undefined);
      setStatus(action === 'withdraw' || clearFollowup ? 'حُذفت إجابتك.' : 'حُفظت إجابتك.');
    } catch {
      setStatus('تعذّر تحديث الإجابة. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  if (!pilot) return showUnavailable && loaded ? <p>لا تتوفر متابعة لهذا التعارف حاليًا.</p> : null;
  if (pilot.stage) {
    const stage = pilot.stage;
    return <FeedbackWindow key={stage} expanded={expanded} symbol={stage==='exit'?'step':'return'}
      period={stage==='exit'?'بعد إغلاق التعارف':'بعد أسبوع من فتح التواصل'}
      title={stage==='exit'?'كيف كانت تجربة التعارف؟':'كيف مضى التواصل بينكما؟'}
      note="مشاركة اختيارية لدراسة مدى توافق الإجابات مع تجربة التعارف. إجابتك خاصة.">
      <ConnectionReviewForm key={requestId} stage={stage} initial={pilot.review} save={async review=>{
        try {
          const result = await respond(requestId,stage,review);
          if (!result || result.stage!==stage) { setStatus('انتهت فترة تسجيل الإجابة.'); return false; }
          setPilot(result); setStatus(review?'حُفظت إجابتك.':'حُذفت إجابتك.'); return true;
        } catch { setStatus('تعذّر تحديث الإجابة. حاول مرة أخرى.'); return false; }
      }}/>
      <p className="wf-status" role="status">{status}</p>
    </FeedbackWindow>;
  }
  return <FeedbackWindow expanded={expanded} period={pilot.initialOpen ? 'بعد يومين من فتح التواصل' : 'بعد أسبوع من فتح التواصل'}
    title={pilot.initialOpen ? 'رأيك في المحادثة' : 'الحديث من جديد'}
    symbol={pilot.initialOpen ? 'first' : 'return'}
    note={pilot.initialOpen ? 'مشاركة اختيارية لدراسة التوافق. إجاباتك خاصة، وتظهر رغبتكما في المتابعة إذا اخترتماها معًا.' : 'مشاركتك اختيارية. إجابتك عن هذه المحادثة تبقى خاصة.'}>
    {pilot.initialOpen && <>
      <fieldset className="wf-form" disabled={busy}>
        <YesNo label="هل تحدثتما بالفعل؟" value={talked} change={value => setAnswer(value ? {...answer, talked: true} : {talked: false})} />
        {talked === true && <div className="wf-reveal">
          <YesNo label="هل استمتعت بالمحادثة؟" value={enjoyed} change={value => setAnswer({...answer, talked: true, enjoyed: value})} />
          <YesNo label="هل ترغب في مواصلة الحديث؟" value={wantsMore} change={value => setAnswer({...answer, talked: true, continue: value})} />
        </div>}
        <button type="button" className="btn-primary" disabled={!complete} onClick={() => void update('save')}>حفظ إجابتي</button>
        {pilot.answer && <button type="button" className="btn-text" onClick={() => void update('withdraw')}>حذف إجابتي</button>}
      </fieldset>
    </>}
    {pilot.mutualContinue && <div className="wf-mutual">
      <Link2 size={18} aria-hidden="true"/><strong>ترغبان في مواصلة الحديث.</strong>
      <button type="button" onClick={resumeChat}>العودة للمحادثة <ArrowLeft size={14}/></button>
    </div>}
    {pilot.followupOpen && <fieldset className="wf-form" disabled={busy}>
      <YesNo label="هل تحدثتما مرة أخرى في يوم آخر؟" value={followup} change={setFollowup}/>
      <button type="button" className="btn-primary" disabled={followup === undefined} onClick={() => void update('followup')}>حفظ إجابتي</button>
      {pilot.followupTalked !== null && <button type="button" className="btn-text" onClick={() => void update('followup', true)}>حذف إجابتي</button>}
    </fieldset>}
    <p className="wf-status" role="status">{status}</p>
  </FeedbackWindow>;
}
