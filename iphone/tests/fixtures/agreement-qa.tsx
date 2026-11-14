import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationAgreement } from '../../src/community/ConversationAgreement';
import { demoCommunity, demoProfile, type SeriousnessAgreement } from '../../src/community/data';
import '../../src/design.css';
import '../../src/screens.css';
import '../../src/community/community.css';
import '../../src/motion.css';
// Synthetic local state only. No member session or backend writes.
const params = new URLSearchParams(location.search);
let agreement = { status: params.has('expired') ? 'expired' : 'proposed', actor: params.has('man') ? 'abdulrahman' : 'reham', proposalId: 'proposal-1', days: 30, mineName: 'عضو تجريبي', peerName: 'شريك تجريبي', womanSignedAt: new Date().toISOString(), deadline: params.has('expired') ? new Date(Date.now()-86400000).toISOString() : undefined } as SeriousnessAgreement;
const source = { ...demoCommunity(() => demoProfile), agreement: async () => ({ ...agreement }), agree: async (_id: string, action: string, payload: any) => {
  if(action === 'propose') agreement = { ...agreement, days: payload.days, proposalId: 'proposal-2' };
  if(action === 'accept') agreement = { ...agreement, status: 'accepted', deadline: new Date(Date.now()+30*86400000).toISOString() };
  if(action === 'extend') agreement = { ...agreement, extension: { id: 'extension', actor: agreement.actor, days: 7 } };
  return { ...agreement };
} };
function Fixture() {
  const [allowed, setAllowed] = useState(false), [ending, setEnding] = useState(false);
  return <main className="app-screen" dir="rtl"><ConversationAgreement source={source} requestId="synthetic" onAllowed={setAllowed} onEnd={()=>setEnding(true)}/><output>{ending?'فتح تأكيد إنهاء التعارف':allowed?'المحادثة متاحة':'المحادثة بانتظار الاتفاق'}</output></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
