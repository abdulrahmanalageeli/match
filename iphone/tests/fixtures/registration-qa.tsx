import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { applicableDimensions } from '../../src/compatibility/model';
import { personalityQuestionsFor } from '../../src/compatibility/personality';
import { OnboardingSandbox } from '../../src/onboarding/OnboardingSandbox';
import { GuidedApplication } from '../../src/onboarding/GuidedApplication';
import { chapters, initialDraft, type ApplicationDraft } from '../../src/onboarding/draft';
import '../../src/design.css';
import '../../src/flows.css';
import '../../src/screens.css';
import '../../src/motion.css';
import '../../src/ambient.css';
import '../../src/mobile/keyboard.css';
import '../../src/onboarding/arrivalJourney.css';
import '../../src/onboarding/arrivalAssessments.css';
import '../../src/arrivalSurfaces.css';
import '../../src/typography.css';
import { initializeKeyboardViewport } from '../../src/mobile/keyboardViewport';
import { initializeDevicePreferences } from '../../src/settings/preferences';

if (import.meta.env.MODE !== 'demo') throw new Error('Run this fixture with --mode demo.');
initializeDevicePreferences();
const stopKeyboardViewport = initializeKeyboardViewport();
if (import.meta.hot) import.meta.hot.dispose(stopKeyboardViewport);
function RegistrationQa() {
  const chapter = chapters.find(item => item.key === new URLSearchParams(location.search).get('chapter'))?.key;
  const draft = useRef<ApplicationDraft | null>(null);
  const [closed, setClosed] = useState(false);
  if (chapter && !draft.current) {
    draft.current = initialDraft('registration-qa', null);
    Object.assign(draft.current.answers, { displayName: 'نورة', gender: 'woman', age: '28', city: 'الرياض', profession: 'مهندسة', bio: 'أحب الهدوء والقراءة والوقت مع العائلة.', contact: 'qa@example.com' });
    draft.current.step = chapter;
    const mode = new URLSearchParams(location.search).get('assessment');
    if (mode === 'legacy' || mode === 'current') {
      const p = draft.current.answers;
      p.assessmentVersion = mode === 'legacy' ? 'marriage-v3' : 'marriage-v4';
      p.personalityVersion = mode === 'legacy' ? 'personality-v1' : 'personality-v2';
      p.birthDate = '1997-05-12';
      p.marriageBasics = {maritalStatus:'never_married', polygynyPreference:'not_open', childrenCount:0};
      p.partnerCriteria = {children:{mode:'require',target:'none'}};
      const topics = applicableDimensions(p.assessmentVersion,{children_plan:'B'},0,p.partnerCriteria.children);
      p.surveyAnswers = Object.fromEntries(topics.flatMap(d => [[d.id,'B'],[d.partnerId,'B']]));
      const questions = personalityQuestionsFor(p.personalityVersion);
      const seeded = chapter === 'review' ? questions : questions.slice(0,-1);
      p.personalityAnswers = Object.fromEntries(seeded.map(q => [q.id,'C']));
      draft.current.permissions = {version:'2026-11-07-privacy',assessment:true,sensitiveProfile:true,sensitivePublication:true};
    }
    if (new URLSearchParams(location.search).has('consolidation')) {
      draft.current.permissions = { version: '2026-11-07-privacy', assessment: true, sensitiveProfile: true, sensitivePublication: true };
      Object.assign(draft.current.answers, {
        birthDate: '1997-03-14', familyPreference: 'من البداية', surveyAnswers: { marriage_timeline: 'A' },
        marriageBasics: { maritalStatus: 'never_married', polygynyPreference: 'not_open', heightCm: 167, marriageTimeline: 'six_to_twelve_months' },
        partnerCriteria: { smoking: { mode: 'require', target: 'never' } },
        membershipReadiness: { family: 'later', nextStep: 'not_yet' },
      });
    }
  }
  return <div className="phone-app">{closed ? <p role="status">انتهت المعاينة</p> : chapter ? <GuidedApplication initial={null} previouslyApproved={false} busy={false} demo preview includeCompatibility startAt={chapter} draftRef={draft} draftOwner="registration-qa" back={()=>setClosed(true)} exitPreview={()=>setClosed(true)} onPrivacy={()=>{}} save={()=>setClosed(true)}/> : <OnboardingSandbox close={()=>setClosed(true)}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<RegistrationQa/>);
