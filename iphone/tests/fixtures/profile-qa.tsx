import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import {MemberProfile} from '../../src/profile/MemberProfile';
import {publicProfile} from '../../src/profile/publicProfile';
import {demoCommunity} from '../../src/community/data';
import { testProfile, type Actor } from '../../src/testing/pair';
import '../../src/design.css';import '../../src/flows.css';import '../../src/screens.css';import '../../src/motion.css';
import { initializeDevicePreferences } from '../../src/settings/preferences';
const actor:Actor=new URLSearchParams(location.search).get('actor')==='abdulrahman'?'abdulrahman':'reham';
const profile={...testProfile(actor),displayName:actor==='reham'?'رهام':'عبدالرحمن',profession:'مهندسة معمارية',bio:'أحب المشي في الصباح والبيوت القديمة. أجد راحتي في وقت الأهل والحديث الذي يجمع الصراحة وخفة الروح.',lookingFor:'شريك واضح وحنون، نتشارك القرار ونساند طموح بعضنا.',valuesStatement:'الاحترام والوضوح والمساحة الشخصية.',lifeTogether:'بيت دافئ، ووقت للأهل، ورحلة جديدة من حين لآخر.',education:'بكالوريوس عمارة',contact:'private-preview-secret@example.invalid'};
const state:any={actor,profileRevision:'v1',matched:true,profiles:{[actor]:profile},messages:[],read:{},delivered:{},stage:0,agree:{},exclusive:false,exclusiveConsent:{},call:null,callPermission:{status:'none'},seriousness:{status:'accepted',days:14,deadline:'2026-12-01T00:00:00Z'}};
const alerts=new URLSearchParams(location.search).has('alerts');
let roomApproved=false;
const targetRoom='c0000000-0000-4000-8000-000000000055';
let eventRows:{id:string;event:string;target:string;createdAt:string;unread:boolean}[]=[];
if(alerts) {
  state.matchCelebration='fixture-match';
  state.matchedAt=new Date().toISOString();
  state.seriousness={status:'none'};
  Object.assign(window, {qaAlerts:{
    add(event:string,id:string,target='00000000-0000-4000-8000-000000000001') {
      eventRows.unshift({id,event,target,createdAt:new Date().toISOString(),unread:true});
      window.dispatchEvent(new Event('wudayn:notification-read'));
    },
    useProposal() { state.seriousness={status:'proposed',days:14,proposalId:'proposal',womanSignedAt:new Date().toISOString()}; },
    useExtension() { state.seriousness={status:'accepted',days:14,deadline:new Date(Date.now()+86400000).toISOString(),extension:{id:'extension',days:7,actor:'abdulrahman'}}; },
    read(id:string) { return eventRows.find(row=>row.id===id)?.unread===false; }
  }});
}
let visits=0,saves=0;const gallery=[{id:'fixture-1'}];const originalFetch=window.fetch;
window.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 if(!url.includes('/functions/v1/pair-test'))return originalFetch(input,init);
 const b=JSON.parse(String(init?.body||'{}'));let result:any={...state};
 if(b.action==='notifications')result=[];
 if(alerts && b.action==='family') {
   if(b.payload?.action==='approve_room'&&b.payload.roomId===targetRoom)roomApproved=true;
   const active=actor==='reham', createdAt=new Date().toISOString();
   const rooms=['c0000000-0000-4000-8000-000000000044',targetRoom].map((id,index)=>({
     id,title:index?'موعد اللقاء العائلي':'مساحة أخرى',status:active?'active':'pending',
     connectionId:'tester-pair',createdAt,needsApproval:!active&&!roomApproved,needsAcceptance:false,
     canRead:active,canSend:active,unread:0,participants:[],
   }));
   result=b.payload?.action==='messages'?[]:{
     role:'member',participantId:'test:'+actor,account:{displayName:profile.displayName},links:[],rooms,
   };
 }
 if(alerts && b.action==='push_updates') {
   if(b.payload?.read_id)eventRows=eventRows.map(row=>row.id===b.payload.read_id?{...row,unread:false}:row);
   result=eventRows;
 }
 if(alerts && ['agreement_accept','agreement_extension_accept'].includes(b.action)) {
   state.seriousness={status:'accepted',days:b.action==='agreement_accept'?14:21,
     deadline:new Date(Date.now()+14*86400000).toISOString(),womanSignedAt:new Date().toISOString(),manSignedAt:new Date().toISOString()};
   result={...state};
 }
 if(alerts && b.action==='match_seen'){state.celebrationSeen={[actor]:state.matchCelebration};result={...state};}
 if(b.action==='gallery_list')result=gallery;
 if(url.includes('action=gallery_download')){
   const image=await createImageBitmap(await (await originalFetch('/demo/portraits/tester-shemagh.webp')).blob());
   const canvas=new OffscreenCanvas(image.width,image.height);canvas.getContext('2d')!.drawImage(image,0,0);image.close();
   return new Response(await canvas.convertToBlob({type:'image/jpeg'}));
 }
 if(b.action==='profile_visit')visits++;
 if(b.action==='profile'){saves++;state.profiles[actor]=b.payload.profile;state.profileRevision='v'+(saves+1);result={...state};}
 document.getElementById('qa-result')!.textContent=`اختبار محلي · زيارات الملف: ${visits} · حفظ: ${saves}`;
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
initializeDevicePreferences();
const root=createRoot(document.getElementById('root')!);
const params=new URLSearchParams(location.search);
const connection=params.get('profileConnection');
if(connection) {
  const source={...demoCommunity(()=>profile),profileReading:async()=>{throw Error('fixture assertion: no report fetch');}};
  const person={...publicProfile(profile,'fixture-peer'),isDemo:true,
    connectionStatus:connection==='accepted'?'accepted' as const:connection==='pending'?'pending' as const:undefined,
    connectionId:connection==='unmatched'?undefined:'fixture-connection'};
  root.render(<div className="phone-app"><MemberProfile person={person} source={source} back={()=>{}} backText="رجوع"/></div>);
} else root.render(<App tester={{actor,session:'f'.repeat(64),profileRevision:'v1',profile}} onTesterExit={()=>{}}/>);
