import { createRoot } from 'react-dom/client';
import { Membership } from '../../src/Screens';
import { membershipPriceLabel,seriousnessPriceLabel } from '../../src/membershipPricing';
import '../../src/design.css';
import '../../src/flows.css';
import '../../src/screens.css';
import '../../src/motion.css';
import '../../src/arrivalSurfaces.css';
import '../../src/typography.css';

// Actual paywall component with catalog pricing; no billing calls or entitlement changes.
const gender = new URLSearchParams(location.search).get('gender') === 'woman' ? 'woman' : 'man';
const params=new URLSearchParams(location.search);
const noop=()=>{};
// Local catalog mock only; never invokes StoreKit or grants access.
const loadOffer=async(gender?:'man'|'woman')=>({price:seriousnessPriceLabel(gender),currency:'SAR',trialEligible:false});
createRoot(document.getElementById('root')!).render(<div className="phone-app"><Membership
  active={params.get('active')==='true'} demo={false} canStart={params.get('canStart')!=='false'} canBuy={params.get('native')!=='false'} busy={params.get('busy')==='true'} expiry={null}
  currentTier={params.get('plan')==='seriousness'?'seriousness':undefined} loadOffer={loadOffer} gender={gender} currency="SAR" trialEligible={params.get('trial')!=='false'}
  price={params.get('unavailable')==='true'?null:membershipPriceLabel(gender)} back={noop} buy={noop} restore={noop}
  manage={noop} refresh={noop} onPolicy={noop}
/></div>);
