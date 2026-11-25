import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationAgreement } from '../../src/community/ConversationAgreement';
import { demoCommunity, demoProfile, type SeriousnessAgreement } from '../../src/community/data';
import '../../src/design.css';
import '../../src/screens.css';
import '../../src/flows.css';
import '../../src/community/community.css';
import '../../src/motion.css';
// Synthetic local state only. No member session or backend writes.
const params = new URLSearchParams(location.search);
const man = params.has('man');
let agreement: SeriousnessAgreement = {
  status: params.has('expired') ? 'expired' : params.has('unsent') ? 'none' : 'proposed',
  actor: man ? 'abdulrahman' : 'reham',
  proposalId: 'proposal-1',
  days: 30,
  mineName: man ? 'عبدالله' : 'نورة',
  peerName: man ? 'نورة' : 'عبدالله',
  womanSignedAt: params.has('unsent') ? undefined : new Date().toISOString(),
  deadline: params.has('expired') ? new Date(Date.now()-86400000).toISOString() : undefined,
};
if(params.has('countdown')){
 agreement.status='accepted';
 agreement.deadline=new Date(Date.now()+4000).toISOString();
}
let delayedRead:((value:SeriousnessAgreement)=>void)|undefined;
let firstRead=true;
const source = { ...demoCommunity(() => demoProfile), agreement: async () => {
  if(firstRead && params.has('stalled')){
    firstRead=false;
    return new Promise<SeriousnessAgreement>(resolve=>{delayedRead=resolve;});
  }
  return {...agreement};
}, agree: async (_id: string, action: string, payload: any) => {
  if(action === 'propose') agreement = { ...agreement, status: 'proposed', days: payload.days, proposalId: 'proposal-2', womanSignedAt: new Date().toISOString() };
  if(action === 'accept') agreement = { ...agreement, status: 'accepted', deadline: new Date(Date.now()+30*86400000).toISOString() };
  if(action === 'extend') agreement = { ...agreement, extension: { id: 'extension', actor: agreement.actor, days: 7 } };
  if(action==='family_propose') agreement={...agreement,familyProposalId:'demo-family',familyAgreed:{[agreement.actor]:true}};
  if(action==='family_clear') agreement={...agreement,familyProposalId:undefined,familyAgreed:{}};
  if(agreement.status==='accepted'&&agreement.deadline&&Date.parse(agreement.deadline)<=Date.now())agreement.status='expired';
  return { ...agreement };
} };
function Fixture() {
  const [allowed, setAllowed] = useState(false), [ending, setEnding] = useState(false);
  return <main className="app-screen" dir="rtl"><ConversationAgreement source={source} requestId="synthetic" onAllowed={setAllowed} onEnd={()=>setEnding(true)}/>
    {(ending||allowed)&&<output>{ending?'فتح تأكيد إنهاء التعارف':'المحادثة متاحة'}</output>}
    {params.has('stalled')&&<button onClick={()=>delayedRead?.({...agreement,status:'accepted'})}>Resolve previous read</button>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
