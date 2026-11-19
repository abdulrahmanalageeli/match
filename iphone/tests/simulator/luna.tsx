import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HybridAssessment } from '../../src/interview/HybridAssessment';
import type { InterviewProposal } from '../../src/interview/types';
import '../../src/design.css';
import '../../src/interview/interview.css';
import '../../src/motion.css';

const proposal: InterviewProposal = {
  id:'personality:depth:self',kind:'personality',fieldId:'depth',side:'self',values:['D'],
  summary:'عمق الحوار',evidence:[{turnId:'intro',quote:'أحب الحديث المتعمق'}],needsClarification:false,
};
function Fixture() {
  const [choices, change] = useState<Record<string,string[]>>({[proposal.id]:proposal.values});
  return <main className="phone-app wi-content"><HybridAssessment choices={choices} onChange={change}
    aiProposals={[proposal]} onComplete={()=>{}}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
