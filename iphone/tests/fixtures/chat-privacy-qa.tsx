import { useState } from 'react';
import { VoiceCallsProvider } from '../../src/voice/VoiceCalls';
import { createRoot } from 'react-dom/client';
import { useMemberActivity } from '../../src/notifications/ActivityAlerts';
import { NotificationFeed } from '../../src/notifications/NotificationFeed';
import type { ActivityNotification } from '../../src/community/data';
import { Chat } from '../../src/community/Community';
import { routeUpdate, type ChatSignal } from '../../src/community/updates';
import { CapturePrivacyHost } from '../../src/privacy/CapturePrivacy';
import { resolveReply, demoCommunity, searchMessageRows, type CommunitySource, type Message, type Connection, type SeriousnessAgreement } from '../../src/community/data';
import { testProfile } from '../../src/testing/pair';
import { memberChatDrafts } from '../../src/community/memberChatDrafts';
import '../../src/design.css';import '../../src/flows.css';import '../../src/screens.css';import '../../src/motion.css';
import '../../src/mobile/keyboard.css';import '../../src/community/arrivalDiscovery.css';import '../../src/community/arrivalChat.css';import '../../src/arrivalSurfaces.css';import '../../src/typography.css';
import '../../src/accessibility.css';
import { initializeDevicePreferences } from '../../src/settings/preferences';

const params = new URLSearchParams(location.search), actor = params.get('actor') === 'abdulrahman' ? 'abdulrahman' : 'reham';
const peer = actor === 'reham' ? 'abdulrahman' : 'reham';
const key = 'nisfayn-local-chat-privacy-qa-' + (params.get('case') || 'default');
type Row = Omit<Message,'senderIsMe'> & {sender:string;media?:string};
const time = (minutes:number) => new Date(Date.now() - minutes*60000).toISOString();
const seed:Row[] = [
 {id:'hello',sender:'reham',body:'أحب أن يبقى حديثنا واضحًا ومريحًا للطرفين.',createdAt:time(4)},
 {id:'reply',sender:'abdulrahman',body:'وأنا أيضًا، الخصوصية والوضوح أساس البداية.',createdAt:time(3),deliveredAt:time(3),readAt:time(2)},
 {id:'once',sender:'abdulrahman',body:'صورة لمرة واحدة',createdAt:time(2),attachment:{id:'once-photo',kind:'photo',mime:'image/webp',size:100,viewOnce:true},media:'/demo/portraits/sarah-realistic-v2.webp'},
 {id:'regular',sender:'reham',body:'صورة',createdAt:time(1),attachment:{id:'regular-photo',kind:'photo',mime:'image/webp',size:100},media:'/demo/portraits/sarah-realistic-v2.webp'},
];
if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
let permission: {status:'none'|'pending';direction?:'outgoing'} = {status:'none'};
const listeners = new Set<(signal?: ChatSignal)=>void>();
const read = ():Row[] => JSON.parse(localStorage.getItem(key)||'[]');
const deliveryTest = params.has('delivery');
function wake(before: Row[], after: Row[]) {
  const appended = deliveryTest && after.length === before.length + 1 ? after.at(-1) : undefined;
  listeners.forEach(fn=>fn(appended ? {kind:'message', requestId:connection.id, messageId:appended.id} : undefined));
}
const write = (rows:Row[]) => {const before=read();localStorage.setItem(key,JSON.stringify(rows));wake(before,rows);};
window.addEventListener('storage',event=>{if(event.key===key)wake(JSON.parse(event.oldValue||'[]'),JSON.parse(event.newValue||'[]'));});
const asMessage = (row:Row):Message => {const {sender,media:_,...message}=row;return {...message,senderIsMe:sender===actor, ...(message.reply && {reply:{...message.reply,senderIsMe:sender===actor ? message.reply.senderIsMe : !message.reply.senderIsMe}})};};
const imageUrl = async (path:string) => URL.createObjectURL(await (await fetch(path)).blob());
const base = demoCommunity(()=>testProfile(actor),false);
let agreement: SeriousnessAgreement = {
 status: params.has('renew')?'expired':params.has('agreement')?actor==='reham'?'none':'proposed':'accepted',
 actor,days:14,mineName:actor==='reham'?'نورة':'عبدالله',peerName:actor==='reham'?'عبدالله':'نورة',
 proposalId:'local-proposal',
 womanSignedAt:params.has('agreement')&&actor==='reham'?undefined:time(10),
 manSignedAt:params.has('agreement')?undefined:time(9),
 deadline:params.has('agreement')?undefined:params.has('renew')?time(60):new Date(Date.now()+14*86400000).toISOString(),
 exclusive:params.has('exclusive'),
 hasFamilyContact:params.has('sharedFamilyNumber'),
 ...(params.has('pendingFamily') && {familyProposalId:'previous-family-request',familyAgreed:{[peer]:true}}),
};
let failNextSend = params.has('interrupt');
const source:CommunitySource = {...base,
 drafts: memberChatDrafts(key + '-' + actor),
 conversationPilot: async () => params.has('feedback')
   ? {initialOpen:true, followupOpen:false, followupTalked:null, answer:null, mutualContinue:false}
   : null,
 searchMessages: async (_id, query, before, kind) => searchMessageRows(read().map(asMessage), query, before, kind),
 ...(params.has('interrupt') ? {
   demoAcceptOutgoing: undefined,
   profileVisible: async () => {
     const response = await fetch('/__qa/profile');
     if (!response.ok) throw Object.assign(new Error('تعذّر التحقق'), {status:response.status});
     return response.json();
   }
 } : {}),
 watch:(fn,scope)=>{const listener=routeUpdate(fn,scope);listeners.add(listener);return()=>{listeners.delete(listener);};},
 callPermission:async()=>permission,
 requestCallPermission:async()=>{await new Promise(resolve=>setTimeout(resolve,600));permission={status:'pending',direction:'outgoing'};return permission;},
 setTyping:async()=>{},typingState:async()=>false,
 reactToMessage:async(_room,id,emoji)=>{const rows=read(),row=rows.find(item=>item.id===id);if(!row||row.deletedAt)throw Error('غير متاحة');row.reactions=emoji?[{emoji,count:1,mine:true}]:[];write(rows);return row.reactions;},
 progress:async()=>({stage:params.has('familyStage')?2:0,mine:false,peer:false,exclusive:params.has('exclusive'),
   ...(params.has('exclusiveRequest') && {consentMine: actor==='reham', consentPeer: actor!=='reham'}),
 }),agreement:async()=>params.has('stalledAgreement')?new Promise<SeriousnessAgreement>(()=>{}):({...agreement}),
 ...(params.has('sharedFamilyNumber') && {familyContact:async()=>'+966500000001'}),
 agree:async(_id,action,payload)=>{
  if(action==='propose')agreement={...agreement,status:'proposed',days:payload.days,womanSignedAt:new Date().toISOString()};
  if(action==='accept')agreement={...agreement,status:'accepted',manSignedAt:new Date().toISOString(),deadline:new Date(Date.now()+agreement.days!*86400000).toISOString()};
  return {...agreement};
 },
 thread:async()=>{if(deliveryTest)performance.mark('qa-thread-page');return params.has('agreement')?[]:read().map(asMessage);},
 messageChanges:async(_room,ids)=>{if(deliveryTest)performance.mark('qa-thread-rows',{detail:ids});return read().filter(row=>ids.includes(row.id)).map(asMessage);},
 markRead:async()=>{},unreadCount:async()=>0,
 send:async(_room,body,clientId,replyToId,atSeconds)=>{if(failNextSend){failNextSend=false;throw Error('تعذّر إرسال الرسالة.');}await new Promise(resolve=>setTimeout(resolve,800));const id=crypto.randomUUID(),rows=read(),reply=resolveReply(rows.map(asMessage),replyToId,atSeconds);rows.push({id,clientId,sender:actor,body,createdAt:new Date().toISOString(),...(reply && {reply})});write(rows);setTimeout(()=>{const rows=read(),row=rows.find(item=>item.id===id);if(row){row.deliveredAt=new Date().toISOString();write(rows);}},1400);setTimeout(()=>{const rows=read(),row=rows.find(item=>item.id===id);if(row){row.readAt=new Date().toISOString();write(rows);}},2800);return id;},
 async mediaUrl(_room,id){const row=read().find(item=>item.attachment?.id===id);if(!row?.media||row.deletedAt||row.attachment?.viewOnce)throw Error('الصورة غير متاحة.');return imageUrl(row.media);},
 async openMedia(_room,id){const rows=read(),row=rows.find(item=>item.attachment?.id===id);if(!row?.media||row.deletedAt||row.sender===actor||row.attachment?.openedAt)throw Error('تم فتح هذه الصورة بالفعل.');if(row.attachment?.viewOnce){row.attachment.openedAt=new Date().toISOString();write(rows);}return imageUrl(row.media);},
 async deleteMessage(_room,id){const rows=read(),row=rows.find(item=>item.id===id);if(!row||row.sender!==actor)throw Error('يمكنك حذف رسائلك فقط.');row.deletedAt=new Date().toISOString();row.body='تم حذف هذه الرسالة';row.attachment=null;delete row.media;row.reply=null;for(const other of rows)if(other.reply?.id===id)other.reply={...other.reply,body:'تم حذف هذه الرسالة',deletedAt:row.deletedAt};write(rows);},
 async sendMedia(_room,file,kind,clientId,duration,viewOnce,replyToId,atSeconds){
   const media=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});
   const rows=read(), id=clientId;
   if (!rows.some(row=>row.id===id)) {
     const reply=resolveReply(rows.map(asMessage),replyToId,atSeconds);
     rows.push({id,sender:actor,clientId,...(reply && {reply}),body:kind==='photo'?(viewOnce?'صورة لمرة واحدة':'صورة'):'رسالة صوتية',createdAt:new Date().toISOString(),attachment:{id,kind,mime:file.type,size:file.size,duration,viewOnce},media});
     write(rows);
   }
   return id;
 },
};
const connection:Connection={id:'local-privacy-qa',status:'accepted',direction:'incoming',person:{id:peer,alias:peer==='reham'?'رهام':'عبدالرحمن',age:29,city:'الرياض',occupation:'ملف اختبار',bio:peer==='reham'?'كل جمعة أسوّي فطور لأهلي.':'أحب المشي بعد المغرب.',lifeTogether:peer==='reham'?'ودي يبقى لنا وقت نطبخ فيه سوا.':'أحب نطلع نتمشى آخر اليوم ونسولف.',interests:[],reasons:[]}};
const captures = params.has('captures');
if (deliveryTest) {
  const upload = source.sendMedia!;
  source.sendMedia = async (...args) => {
    const response = await fetch('/__qa/upload/'+args[3],{method:'POST'});
    if (!response.ok) throw Error('تعذّر إرسال المرفق.');
    return upload(...args);
  };
  window.addEventListener('qa-chat-wake',event=>listeners.forEach(fn=>fn((event as CustomEvent<ChatSignal>).detail)));
}
const secondConnection = {...connection, id:'second-room', person:{...connection.person,id:'second-person',alias:'عضو ثانٍ'}};
const connections = [connection, secondConnection];
if (captures) {
 const store = key+'-captures';
 type Capture = {id:string; requestId:string; sender:string; createdAt:string};
 const records = ():Capture[] => JSON.parse(localStorage.getItem(store)||'[]');
 let failFirst = true;
 source.inbox = async () => connections;
 source.reportChatScreenshot = async (requestId,id) => {
   if (failFirst) { failFirst=false; throw Error('Offline'); }
   if (!records().some(row=>row.id===id)) localStorage.setItem(store,JSON.stringify([...records(),{id,requestId,sender:actor,createdAt:new Date().toISOString()}]));
 };
 source.notifications = async ():Promise<ActivityNotification[]> => records().filter(row=>row.sender!==actor).map(row=>({
   id:row.id,requestId:row.requestId,createdAt:row.createdAt,person:connection.person,kind:'screenshot',
 }));
 window.addEventListener('storage',event=>{if(event.key===store)listeners.forEach(fn=>fn());});
}
initializeDevicePreferences();
function Fixture() {
 const activity = useMemberActivity(captures ? source : null);
 const [room,setRoom]=useState<string|null>(null);
 const selected=connections.find(c=>c.id===room);
 return <VoiceCallsProvider source={source} owner={null} demo><div className="phone-app" dir="rtl" lang="ar"><main className="cm-shell">{selected?<Chat key={selected.id} source={source} connection={selected} back={()=>setRoom(null)} close={()=>setRoom(null)} backLabel="رجوع"/>:<section className="cm-view"><h1>تعارف متبادل · اختبار محلي</h1>
   {(captures?connections:[connection]).map(c=><button key={c.id} className="cm-request" onClick={()=>setRoom(c.id)}>فتح المحادثة مع {c.person.alias}</button>)}
   {captures && <NotificationFeed source={source} connections={connections} compatibilityUpdates={activity.changes} onCompatibilityRead={activity.read} onProfile={()=>{}} onRequest={()=>{}} onConversation={setRoom}/>}
 </section>}</main></div></VoiceCallsProvider>;
}
createRoot(document.getElementById('root')!).render(<><Fixture/><CapturePrivacyHost/></>);
