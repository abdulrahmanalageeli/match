import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demoCommunity, demoProfile } from '../src/community/data';
import { Auth } from '../src/Screens';
import { GuidedApplication } from '../src/onboarding/GuidedApplication';
import '../src/design.css';
import '../src/flows.css';
import '../src/screens.css';
import '../src/typography.css';

const portraitSource = demoCommunity(() => demoProfile, false);

function Registration() {
  const [account, setAccount] = useState(() => JSON.parse(sessionStorage.getItem('qa-account') || 'null'));
  const [submitted, setSubmitted] = useState(false);
  const draft = useRef(null);
  if (submitted) return <h1>تم إرسال الملف</h1>;
  if (!account) return <Auth ready login={false} busy={false} back={() => {}} switchMode={() => {}} onSocial={() => {}} onDemo={() => {}} onPrivacy={() => {}} onPhoneVerified={() => {}}
    submit={(email, _password, agreements, proof) => {
      if (!proof?.phoneProof) throw Error('Missing test SMS confirmation');
      const account = { email, agreements, id: crypto.randomUUID() };
      sessionStorage.setItem('qa-account', JSON.stringify(account));
      setAccount(account);
    }}/>;
  return <GuidedApplication initial={null} previouslyApproved={false} busy={false} back={() => {}} onPrivacy={() => {}}
    portraitSource={portraitSource} defaultContact={account.email} accountAgreements={account.agreements} draftOwner={account.id} draftRef={draft}
    interviewAuth={{ token: account.id }} save={(profile, portrait, _policy, provenance, readiness) => {
      Object.assign(window, {__submitted: {account: {id: account.id, email: account.email}, profile: {...profile, _answerProvenance:provenance, _membershipReadiness:readiness}, photo: portrait && {blur: portrait.blur, revealPolicy: portrait.revealPolicy}, photoStatus: portrait?.staged?.status}});
      setSubmitted(true);
    }}/>;
}
createRoot(document.getElementById('root')!).render(<div className="phone-app" lang="ar" dir="rtl"><Registration/></div>);
