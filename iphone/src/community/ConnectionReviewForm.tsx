import { useState } from 'react';
import type { ConnectionReview } from './data';
import { FeedbackChoice } from './FeedbackWindow';
import { dimensions } from '../compatibility/practical-catalog';
import { partnerTraitQuestions } from '../compatibility/personality';

const labels = {
  weekContact: { none:'لم نتحدث بعد', once:'في يوم واحد', repeated:'في يومين أو أكثر' },
  potential: { yes:'نعم', no:'لا', too_early:'ما زال مبكرًا أن أحكم' },
  personalFit: { well:'ناسبني كثيرًا', partly:'ناسبني إلى حدّ ما', poorly:'لم يناسبني', too_early:'ما زال مبكرًا أن أحكم' },
  practicalFit: { aligned:'توافقت إلى حدّ كبير', partial:'توافقت جزئيًا', different:'اختلفت إلى حدّ كبير', not_discussed:'لم نناقش هذه الأمور بعد', unclear:'ما زالت توقعاتنا غير واضحة' },
  mainFactor: { conversation:'أسلوب الحوار', respect:'الاهتمام والاحترام', initiative:'المبادرة والالتزام', values:'القيم والأولويات', plans:'خطط الحياة بعد الزواج', circumstances:'التوقيت أو الظروف', other:'أمر آخر', nothing_specific:'لا شيء محدد بعد' },
  contact: { none:'لم نتحدث', once:'في يوم واحد', repeated:'في أكثر من يوم' },
  feeling: { yes:'نعم', no:'لا', unsure:'غير متأكد' },
  reason: { practical_strength:'توافق في خطط الحياة', personality_strength:'انسجام في أسلوب التعامل', timing:'التوقيت أو الظروف', no_reply:'تعذّر التواصل', practical:'اختلاف في خطط الحياة', personality:'صعوبة في أسلوب التعامل', no_connection:'لم أشعر بانسجام', offline:'انتقل التواصل خارج التطبيق', other:'سبب آخر' },
};

export function ConnectionReviewForm({stage, initial, save}: {
  stage: 'week' | 'exit'; initial?: ConnectionReview | null; save: (review?: ConnectionReview) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Partial<ConnectionReview>>(initial ?? {});
  const [busy, setBusy] = useState(false);
  const talked = draft.contact && draft.contact !== 'none';
  const complete = draft.contact && (!talked || (stage==='week'
    ? draft.marriagePotential && draft.personalFit && draft.practicalFit
    : draft.enjoyed && draft.continue));
  const practicalTopic = draft.reason==='practical' || draft.reason==='practical_strength';
  const personalityTopic = draft.reason==='personality' || draft.reason==='personality_strength';
  async function submit(clear: boolean) {
    if (busy || (!clear && !complete)) return;
    setBusy(true);
    try {
      let review: ConnectionReview | undefined;
      if (!clear && draft.contact) {
        review = stage==='exit' ? draft as ConnectionReview : {
          instrument:'week-v2', contact:draft.contact,
          ...(talked && {marriagePotential:draft.marriagePotential, personalFit:draft.personalFit,
            practicalFit:draft.practicalFit, mainFactor:draft.mainFactor}),
        };
      }
      if (await save(review) && clear) setDraft({});
    } finally { setBusy(false); }
  }
  function choice(key: 'contact'|'enjoyed'|'continue'|'marriagePotential'|'personalFit'|'practicalFit', title: string, options: Record<string,string>) {
    return <FeedbackChoice label={title} choices={Object.values(options)} value={options[draft[key] ?? '']}
      change={label => {
        const code = Object.keys(options).find(k => options[k] === label);
        setDraft(previous => ({...previous, [key]:code,
          ...(key==='contact' && code==='none' ? {enjoyed:undefined,continue:undefined,marriagePotential:undefined,
            personalFit:undefined,practicalFit:undefined,mainFactor:undefined} : {}),
          ...(key==='contact' || key==='continue' ? {reason:undefined,topic:undefined} : {})}));
      }}/>;
  }
  return <fieldset className="wf-form" disabled={busy}>
    {stage==='week' ? <>
      {choice('contact','منذ بداية التعارف، في كم يوم مختلف تحدثتما، داخل التطبيق أو خارجه؟',labels.weekContact)}
      {talked && <>
        {choice('marriagePotential','بناءً على ما عرفته حتى الآن، هل ترى هذا الشخص شريكًا محتملًا للزواج؟',labels.potential)}
        {choice('personalFit','إلى أي مدى ناسبك أسلوب هذا الشخص في التعامل معك؟',labels.personalFit)}
        {choice('practicalFit','في الأمور التي ناقشتماها عن الحياة بعد الزواج، إلى أي مدى توافقت توقعاتكما؟',labels.practicalFit)}
        <label>ما أكثر ما أثّر في رأيك حتى الآن؟ (اختياري)
          <select value={draft.mainFactor ?? ''} onChange={e=>setDraft({...draft,mainFactor:e.target.value || undefined})}>
            <option value="">تجاوز السؤال</option>{Object.entries(labels.mainFactor).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select></label>
      </>}
    </> : <>
      {choice('contact','هل تحدثتما؟ يشمل ذلك التواصل خارج التطبيق.',labels.contact)}
      {talked && <>
        {choice('enjoyed','هل استمتعت بالحديث؟',labels.feeling)}
        {choice('continue','وقت إغلاق التعارف، هل كنت ترغب في مواصلة التواصل؟',labels.feeling)}
        <label>عند إغلاق التعارف، هل رأيت هذا الشخص شريكًا محتملًا للزواج؟ (اختياري)
          <select value={draft.marriagePotential ?? ''} onChange={e=>setDraft({...draft,marriagePotential:(e.target.value || undefined) as ConnectionReview['marriagePotential']})}>
            <option value="">تجاوز السؤال</option><option value="yes">نعم</option><option value="no">لا</option><option value="too_early">مبكر أن أحكم</option>
          </select></label>
      </>}
      {draft.contact && <label>هل جرى تواصل فعلي مع الأهل بخصوص زواجكما؟ (اختياري)
        <select value={draft.familyContact ?? ''} onChange={e=>setDraft({...draft,familyContact:(e.target.value || undefined) as ConnectionReview['familyContact']})}>
          <option value="">تجاوز السؤال</option><option value="yes">نعم، جرى التواصل</option><option value="no">لا، حتى الآن</option><option value="unknown">لا أعلم</option>
        </select></label>}
      {draft.contact && <label>ما أكثر ما أثّر في رأيك؟ (اختياري)
        <select value={draft.reason ?? ''} onChange={e=>setDraft({...draft,reason:e.target.value || undefined,topic:undefined})}>
          <option value="">تجاوز السؤال</option>{Object.entries(labels.reason).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select></label>}
      {(practicalTopic || personalityTopic) && <label>أي موضوع تحديدًا؟ (اختياري)
        <select value={draft.topic ?? ''} onChange={e=>setDraft({...draft,topic:e.target.value || undefined})}>
          <option value="">تجاوز السؤال</option>{practicalTopic
            ? dimensions.map(q=><option key={q.id} value={q.id}>{q.title}</option>)
            : partnerTraitQuestions.map(q=><option key={q.id} value={q.id}>{q.label}</option>)}
          <option value="other">موضوع آخر</option>
        </select></label>}
    </>}
    <button className="btn-primary" disabled={!complete} onClick={()=>void submit(false)}>حفظ إجابتي</button>
    {initial && <button className="btn-text" onClick={()=>void submit(true)}>حذف إجابتي</button>}
  </fieldset>;
}
