import { useState } from 'react';
import { VoiceCallsProvider } from '../../src/voice/VoiceCalls';
import { createRoot } from 'react-dom/client';
import { Chat } from '../../src/community/Community';
import { demoCommunity, type CommunitySource, type Message, type Connection } from '../../src/community/data';
import { testProfile } from '../../src/testing/pair';
import '../../src/design.css';import '../../src/flows.css';import '../../src/screens.css';import '../../src/motion.css';
import '../../src/mobile/keyboard.css';import '../../src/community/arrivalChat.css';import '../../src/arrivalSurfaces.css';import '../../src/typography.css';
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
const listeners = new Set<()=>void>();
const read = ():Row[] => JSON.parse(localStorage.getItem(key)||'[]');
const write = (rows:Row[]) => {localStorage.setItem(key,JSON.stringify(rows));listeners.forEach(fn=>fn());};
window.addEventListener('storage',event=>{if(event.key===key)listeners.forEach(fn=>fn());});
const asMessage = (row:Row):Message => {const {sender,media:_,...message}=row;return {...message,senderIsMe:sender===actor};};
const imageUrl = async (path:string) => URL.createObjectURL(await (await fetch(path)).blob());
const base = demoCommunity(()=>testProfile(actor),false);
const source:CommunitySource = {...base,
 watch:fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
 callPermission:async()=>permission,
 requestCallPermission:async()=>{await new Promise(resolve=>setTimeout(resolve,600));permission={status:'pending',direction:'outgoing'};return permission;},
 setTyping:async()=>{},typingState:async()=>false,
 reactToMessage:async(_room,id,emoji)=>{const rows=read(),row=rows.find(item=>item.id===id);if(!row||row.deletedAt)throw Error('غير متاحة');row.reactions=emoji?[{emoji,count:1,mine:true}]:[];write(rows);return row.reactions;},
 progress:async()=>({stage:0,mine:false,peer:false}),agreement:async()=>({status:'accepted',actor,days:14,womanSignedAt:time(10),manSignedAt:time(9),deadline:new Date(Date.now()+14*86400000).toISOString()}),
 thread:async()=>read().map(asMessage),
 markRead:async()=>{},unreadCount:async()=>0,
 send:async(_room,body,clientId,replyToId)=>{await new Promise(resolve=>setTimeout(resolve,800));const id=crypto.randomUUID(),rows=read(),original=rows.find(row=>row.id===replyToId);rows.push({id,clientId,sender:actor,body,createdAt:new Date().toISOString(),...(original?{reply:{id:original.id,body:original.deletedAt?'تم حذف هذه الرسالة':original.body,senderIsMe:original.sender===actor}}:{})});write(rows);setTimeout(()=>{const rows=read(),row=rows.find(item=>item.id===id);if(row){row.deliveredAt=new Date().toISOString();write(rows);}},1400);setTimeout(()=>{const rows=read(),row=rows.find(item=>item.id===id);if(row){row.readAt=new Date().toISOString();write(rows);}},2800);return id;},
 async mediaUrl(_room,id){const row=read().find(item=>item.attachment?.id===id);if(!row?.media||row.deletedAt||row.attachment?.viewOnce)throw Error('الصورة غير متاحة.');return imageUrl(row.media);},
 async openMedia(_room,id){const rows=read(),row=rows.find(item=>item.attachment?.id===id);if(!row?.media||row.deletedAt||row.sender===actor||row.attachment?.openedAt)throw Error('تم فتح هذه الصورة بالفعل.');if(row.attachment?.viewOnce){row.attachment.openedAt=new Date().toISOString();write(rows);}return imageUrl(row.media);},
 async deleteMessage(_room,id){const rows=read(),row=rows.find(item=>item.id===id);if(!row||row.sender!==actor)throw Error('يمكنك حذف رسائلك فقط.');row.deletedAt=new Date().toISOString();row.body='تم حذف هذه الرسالة';row.attachment=null;delete row.media;row.reply=null;for(const other of rows)if(other.reply?.id===id)other.reply={...other.reply,body:'تم حذف هذه الرسالة',deletedAt:row.deletedAt};write(rows);},
 async sendMedia(_room,file,kind,clientId,duration,viewOnce){const media=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});const id=crypto.randomUUID(),rows=read();rows.push({id,sender:actor,clientId,body:kind==='photo'?'صورة':'رسالة صوتية',createdAt:new Date().toISOString(),attachment:{id:crypto.randomUUID(),kind,mime:file.type,size:file.size,duration,viewOnce},media});write(rows);return id;},
};
const connection:Connection={id:'local-privacy-qa',status:'accepted',direction:'incoming',person:{id:peer,alias:peer==='reham'?'رهام':'عبدالرحمن',age:29,city:'الرياض',occupation:'ملف اختبار',bio:'شخصية اختبار محلية.',interests:[],reasons:[]}};
initializeDevicePreferences();
function Fixture() {
 const [opened,setOpened]=useState(false);
 return <VoiceCallsProvider source={source} owner={null} demo><div className="phone-app" dir="rtl" lang="ar"><main className="cm-shell">{opened?<Chat source={source} connection={connection} back={()=>setOpened(false)} close={()=>setOpened(false)} backLabel="رجوع"/>:<section className="cm-view"><h1>تعارف متبادل · اختبار محلي</h1><button className="cm-request" onClick={()=>setOpened(true)}>فتح المحادثة مع {connection.person.alias}</button></section>}</main></div></VoiceCallsProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
