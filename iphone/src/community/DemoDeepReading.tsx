import { dimensions } from '../compatibility/model';
import { personalityQuestions } from '../compatibility/personality';
import { suggestedQuestions } from '../compatibility/FitDetails';
import { useMembershipAccess } from '../membership/access';
import { DeepReport } from './DeepReport';
import type { PublicPerson } from './data';
import type { DeepFinding } from './deepCompatibilityModel';

export function DemoDeepReading({ person }: { person: PublicPerson }) {
  const { tier, demo, upgrade } = useMembershipAccess();
  if (!demo && tier !== 'seriousness') return <div className="wd-deep">
    <p>التحليل المعمّق من مزايا وسام الجدية.</p>
    <button type="button" className="btn-primary" onClick={upgrade}>اكتشف وسام الجدية</button>
  </div>;

  const fit = person.fit;
  const findings: DeepFinding[] = [];
  for (const topic of dimensions) {
    if (fit?.strengths.includes(topic.id)) findings.push({
      id: topic.id, section: 'strengths', kind: 'strength', text: topic.reason,
    });
    if (fit?.discussion.includes(topic.id)) findings.push({
      id: topic.id, section: 'differences', kind: 'manageable',
      text: `تختلف إحدى الإجابات عن تفضيل الطرف الآخر. سؤال يساعد على فهم الاختلاف: ${topic.discussion}`,
    });
  }
  if (!findings.length) findings.push({
    id: 'incomplete', section: 'summary', kind: 'uncertain', text: 'لا تكفي الإجابات المتاحة لتحديد نقاط الاتفاق والاختلاف بعد.',
  });
  const personality = fit?.personality;
  for (const question of personalityQuestions) {
    const similar = personality?.similarities.includes(question.id);
    if (!similar && !personality?.differences.includes(question.id)) continue;
    findings.push({
      id: `personality-${question.id}`, section: 'patterns', kind: similar ? 'strength' : 'manageable',
      text: `${similar ? 'إجاباتكما متقاربة' : 'تختلف إجاباتكما'} حول العبارة «${question.prompt}». ${similar ? 'تبادلا مثالًا من الحياة اليومية لترَيا كيف يظهر هذا التقارب.' : 'تحدثا عن موقف يوضح ما يحتاجه كل منكما في هذه الحالة.'}`,
    });
  }
  for (const [index, text] of suggestedQuestions(fit).entries()) {
    findings.push({ id: `question-${index}`, section: 'conversation', kind: 'uncertain', text });
  }
  return <div className="wd-deep wd-deep-shared"><DeepReport key={person.id} sample peerName={person.alias} snapshot={{ requestedByMe: true, findings }}/></div>;
}
