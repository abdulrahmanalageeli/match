import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demoCommunity, demoProfile, type CommunitySource } from '../../src/community/data';
import { ReadinessPassportPanel, SharedReadinessPassportPanel } from '../../src/readiness/ReadinessPassport';
import { isOwnerPassport, type SharedReadinessPassport } from '../../src/readiness/model';
import '../../src/design.css';
import '../../src/motion.css';
import '../../src/settings/settings.css';

const source = demoCommunity(() => ({ ...demoProfile, displayName: 'عضو تجريبي' }));
// Only this local QA harness simulates the consenting receiver. It never calls a live service.
const receiver: CommunitySource = { ...source, readiness: async (action, payload) => {
  if (action !== 'view') throw Error('عرض تجريبي فقط');
  const owner = await source.readiness!('get');
  if (!isOwnerPassport(owner)) throw Error('Unexpected test shape');
  const grant = owner.grants.find(item => item.connectionId === payload?.connectionId && Date.parse(item.expiresAt) > Date.now());
  const view: SharedReadinessPassport = { available: Boolean(grant), sections: grant?.sections ?? [] };
  if (!grant) return view;
  view.sharedUntil = grant.expiresAt; view.updatedAt = owner.updatedAt ?? undefined;
  if (grant.sections.includes('timeline')) { view.timeline = owner.timeline; view.family = owner.family; }
  if (grant.sections.includes('preparation')) view.preparation = owner.preparation;
  if (grant.sections.includes('verification')) view.claims = owner.claims;
  return view;
} };
function Fixture() {
  const [shared, setShared] = useState(false);
  function go(value: boolean) { setShared(value); window.scrollTo(0, 0); }
  return <><nav aria-label="اختبار محلي فقط" style={{display:'flex',justifyContent:'center',gap:8,padding:10,background:'#efe0d5',fontSize:12}}><button type="button" onClick={() => go(false)}>جوازي التجريبي</button><button type="button" onClick={() => go(true)}>عرض المستلم التجريبي</button></nav>{shared ? <SharedReadinessPassportPanel source={receiver} connectionId="demo-mutual" name="عضو تجريبي" onBack={() => go(false)} /> : <ReadinessPassportPanel source={source} onBack={() => go(false)} />}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
