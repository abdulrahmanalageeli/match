import { useState } from 'react';
import { Frame } from '../Screens';
import { RegistrationAgreements } from '../legal/RegistrationAgreements';
import { LEGAL_NOTICE_VERSION } from '../legal/LegalNotice';
import { callRpc } from '../cloud';
import { emptyRegistrationChoices, registrationComplete, registrationVersion, type SignupAgreements } from './signupReturn';

export function CompleteRegistrationAgreements({owner,onPrivacy,onSaved,onBack}:{
  owner:string; onPrivacy:()=>void; onSaved:(value:SignupAgreements)=>void; onBack:()=>void;
}) {
  const [choices,setChoices]=useState(emptyRegistrationChoices);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function save() {
    if(busy || !registrationComplete(choices)) return;
    setBusy(true);
    setError('');
    try {
      onSaved(await callRpc<SignupAgreements>('wudayn_registration_agreements',{
        command:'accept',receipt:{...choices,version:LEGAL_NOTICE_VERSION,registrationVersion},
      },owner));
    } catch {setError('تعذّر حفظ موافقاتك. حاول مرة أخرى.');}
    finally {setBusy(false);}
  }
  return <Frame title="طلب العضوية" back={onBack} className="nf-auth-frame">
    <section className="nf-auth-panel"><RegistrationAgreements value={choices} change={setChoices} disabled={busy} onPrivacy={onPrivacy}/>
      {error&&<p role="alert">{error}</p>}
      <button type="button" className="f-primary" disabled={busy||!registrationComplete(choices)} onClick={()=>void save()}>حفظ ومتابعة</button>
    </section>
  </Frame>;
}
