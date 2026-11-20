import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand } from '../../src/Brand';
import '../../src/design.css';
import './feedback-preview.css';
import { ConversationPilotFeedback } from '../../src/community/ConversationPilotFeedback';
import { FeedbackChoice, FeedbackWindow } from '../../src/community/FeedbackWindow';
import type { CommunitySource, ConversationPilotState } from '../../src/community/data';

// Local design fixture. Responses exist only in memory for this preview.
function pilotResponse(stage: 'first' | 'week' | 'exit'): NonNullable<CommunitySource['conversationPilot']> {
  let state: ConversationPilotState = {answer: null, initialOpen: stage === 'first', followupOpen: stage === 'week',
    mutualContinue: false, followupTalked: null, ...(stage==='first'?{}:{stage,review:null})};
  return async (_id, action, payload) => {
    if (action === 'save' && payload && 'talked' in payload) state = {...state, answer: payload};
    if (action === 'withdraw') state = {...state, answer: null};
    if (action==='week' || action==='exit') state={...state,review:payload && 'contact' in payload ? payload : null};
    if (action === 'followup') state = {...state, followupTalked: payload && 'followupTalked' in payload ? payload.followupTalked : null};
    return state;
  };
}
const pilots = {first:pilotResponse('first'),week:pilotResponse('week'),exit:pilotResponse('exit')};
const skip = 'أفضل عدم الإجابة';

function Milestone({symbol, period, title}: {symbol: 'step' | 'season' | 'year'; period: string; title: string}) {
  const [value, setValue] = useState('');
  const [rating, setRating] = useState('');
  const [saved, setSaved] = useState(false);
  const formal = symbol === 'step';
  const together = value === 'مستمرّان في التعارف' || value === 'متزوجان';
  return <FeedbackWindow {...{symbol, period, title}} note="هذه المتابعة اختيارية. إجابتك خاصة ويمكنك تجاوز السؤال.">
    <div className="wf-form">
      <FeedbackChoice label={formal ? 'هل اتخذتما خطوة رسمية بالفعل؟' : 'أين وصل تعارفكما اليوم؟'}
        choices={formal ? ['نعم', 'ليس بعد', skip] : ['مستمرّان في التعارف', 'متزوجان', 'انتهى التعارف', skip]}
        value={value} change={next => { setValue(next); setRating(''); setSaved(false); }}/>
      {together && <FeedbackChoice label="ما مدى رضاك عن علاقتكما؟" choices={['راضٍ', 'إلى حد ما', 'غير راضٍ', skip]}
        value={rating} change={next => { setRating(next); setSaved(false); }}/>}
      <button className="btn-primary" disabled={!value || saved} onClick={() => setSaved(true)}>حفظ إجابتي</button>
      {saved && <button className="btn-text" onClick={() => { setSaved(false); setValue(''); setRating(''); }}>حذف إجابتي</button>}
    </div><p className="wf-status" role="status">{saved ? 'حُفظت إجابتك في المعاينة.' : ''}</p>
  </FeedbackWindow>;
}

function Preview() {
  const [notice, setNotice] = useState('');
  const [event, setEvent] = useState('week');
  return <main className="wf-preview"><header className="wf-courtyard"><Brand/><div><h1>مسار التعارف</h1><p>متابعات خاصة، من أول حديث إلى ما بعده.</p></div></header>
    <section className="wf-stages"><h2>نوافذ المتابعة</h2>
    <label className="wf-event-select">معاينة توقيت المتابعة
      <select value={event} onChange={e=>{setEvent(e.target.value);setNotice('');}}>
        <option value="start">عند فتح التواصل</option><option value="first">بعد يومين</option>
        <option value="week">بعد أسبوع</option><option value="exit">عند إنهاء التعارف</option>
        <option value="step">متابعة الخطوة الرسمية · اختيارية</option><option value="year">متابعة الزواج · باشتراك مسبق</option>
      </select></label>
    {event==='start' && <p>لا يظهر تقييم عند فتح التواصل.</p>}
    {(event==='first'||event==='week'||event==='exit') && <ConversationPilotFeedback key={event} expanded requestId={event} respond={pilots[event]}
      resumeChat={() => setNotice('في التطبيق، تعود من هنا إلى محادثتكما.')}/>}
    <p role="status">{notice}</p>
    {event==='step' && <Milestone period="بعد الاتفاق على خطوة رسمية" title="الخطوة الرسمية" symbol="step"/>}
    {event==='year' && <Milestone period="بعد عام · بموافقة مسبقة" title="أين وصلتما اليوم؟" symbol="year"/>}
    <footer>معاينة تفاعلية ببيانات تجريبية</footer></section></main>;
}

createRoot(document.getElementById('root')!).render(<Preview/>);
