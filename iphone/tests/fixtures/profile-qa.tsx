import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import { testProfile, type Actor } from '../../src/testing/pair';
import '../../src/design.css';import '../../src/flows.css';import '../../src/screens.css';import '../../src/motion.css';
import { initializeDevicePreferences } from '../../src/settings/preferences';
const actor:Actor=new URLSearchParams(location.search).get('actor')==='abdulrahman'?'abdulrahman':'reham';
const profile={...testProfile(actor),displayName:actor==='reham'?'رهام':'عبدالرحمن',profession:'مهندسة معمارية',bio:'أحب المشي في الصباح والبيوت القديمة. أجد راحتي في وقت الأهل والحديث الذي يجمع الصراحة وخفة الروح.',lookingFor:'شريك واضح وحنون، نتشارك القرار ونساند طموح بعضنا.',valuesStatement:'الاحترام والوضوح والمساحة الشخصية.',lifeTogether:'بيت دافئ، ووقت للأهل، ورحلة جديدة من حين لآخر.',education:'بكالوريوس عمارة',contact:'private-preview-secret@example.invalid'};
const state:any={actor,profileRevision:'v1',matched:true,profiles:{[actor]:profile},messages:[],read:{},delivered:{},stage:0,agree:{},exclusive:false,exclusiveConsent:{},call:null,callPermission:{status:'none'},seriousness:{status:'accepted',days:14,deadline:'2026-12-01T00:00:00Z'}};
let visits=0,saves=0;const gallery=[{id:'fixture-1'}];const originalFetch=window.fetch;
window.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 if(!url.includes('/functions/v1/pair-test'))return originalFetch(input,init);
 const b=JSON.parse(String(init?.body||'{}'));let result:any={...state};
 if(b.action==='notifications')result=[];
 if(b.action==='gallery_list')result=gallery;
 if(b.action==='gallery_url')result={url:'/demo/portraits/tester-shemagh.webp'};
 if(b.action==='profile_visit')visits++;
 if(b.action==='profile'){saves++;state.profiles[actor]=b.payload.profile;state.profileRevision='v'+(saves+1);result={...state};}
 document.getElementById('qa-result')!.textContent=`اختبار محلي · زيارات الملف: ${visits} · حفظ: ${saves}`;
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
initializeDevicePreferences();
createRoot(document.getElementById('root')!).render(<App tester={{actor,session:'f'.repeat(64),profileRevision:'v1',profile}} onTesterExit={()=>{}}/>);
