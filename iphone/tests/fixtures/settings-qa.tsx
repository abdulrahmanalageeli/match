import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Settings} from '../../src/settings/Settings';
import {Membership,Policy,Frame} from '../../src/Screens';
import {demoCommunity} from '../../src/community/data';
import {testProfile} from '../../src/testing/pair';
import {initializeDevicePreferences} from '../../src/settings/preferences';
import type {AccountState} from '../../src/types';
import '../../src/design.css';import '../../src/flows.css';import '../../src/screens.css';import '../../src/motion.css';import '../../src/arrivalSurfaces.css';import '../../src/typography.css';
import '../../src/accessibility.css';
const profile=testProfile('reham');
const base=demoCommunity(()=>profile);
// No live services or mutations are permitted in this visual fixture.
const blocked=()=>{throw Error('QA mutation blocked');};
const source={...base,gallery:async()=>[{id:'qa-photo'}],galleryUrl:async()=>'/demo/portraits/tester-shemagh.webp',addGallery:blocked,removeGallery:blocked,readiness:async(action:string,payload?:Record<string,unknown>)=>{if(action!=='get')return blocked();return base.readiness!(action,payload);},family:async(action:string,payload?:Record<string,unknown>)=>{if(action!=='state')return blocked();return base.family!(action,payload);}} as typeof base;
initializeDevicePreferences();
const fixtureState:AccountState={
  user:{id:'qa-member',email:null,appAccountToken:'qa',paused:false,applicationStatus:'pending',profileReviewPending:true},
  profile:{...profile,displayName:'مسودة للاختبار'},
  membership:{active:true,status:'paid',canStart:false,expiresAt:null},introduction:null,
};
function MemberFixture(){
  return <div className="phone-app" dir="rtl"><Settings state={fixtureState} demo={false} paused={false}
    busy={false} source={source} onEdit={blocked} onMembership={blocked} onToggle={blocked} onDelete={blocked}
    onExit={blocked} onPrivacy={blocked}/></div>;
}
function Fixture(){const [view,setView]=useState('settings');return <div className="phone-app" dir="rtl">{view==='membership'?<Membership back={()=>setView('settings')} active demo price={null} canStart canBuy={false} busy={false} buy={blocked} restore={blocked} manage={blocked} refresh={blocked} expiry={null} onPolicy={()=>setView('policy')}/>:view==='policy'?<Frame title="الخصوصية" back={()=>setView('settings')}><Policy/></Frame>:<Settings state={null} demoMember={profile} demo paused={false} busy={false} source={source} onEdit={blocked} onMembership={()=>setView('membership')} onToggle={blocked} onDelete={blocked} onExit={blocked} onPrivacy={()=>setView('policy')}/>}</div>}
createRoot(document.getElementById('root')!).render(location.search==='?member'?<MemberFixture/>:<Fixture/>);
