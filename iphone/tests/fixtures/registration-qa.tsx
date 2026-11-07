import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { OnboardingSandbox } from '../../src/onboarding/OnboardingSandbox';
import { GuidedApplication } from '../../src/onboarding/GuidedApplication';
import { chapters, initialDraft, type ApplicationDraft } from '../../src/onboarding/draft';
import '../../src/design.css';
import '../../src/flows.css';
import '../../src/screens.css';
import '../../src/motion.css';
import '../../src/ambient.css';
import '../../src/mobile/keyboard.css';
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
  }
  return <div className="phone-app">{closed ? <p role="status">انتهت المعاينة</p> : chapter ? <GuidedApplication initial={null} previouslyApproved={false} busy={false} demo preview includeCompatibility startAt={chapter} draftRef={draft} draftOwner="registration-qa" back={()=>setClosed(true)} exitPreview={()=>setClosed(true)} onPrivacy={()=>{}} save={()=>setClosed(true)}/> : <OnboardingSandbox close={()=>setClosed(true)}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<RegistrationQa/>);
