import { useEffect, useRef, useState } from 'react';
import { Check, Phone, ShieldCheck, X } from "../BrandIcons";
import type { CommunitySource, Connection } from './data';
import './call-permission.css';
import { HelpButton } from '../help/HelpCenter';
import { SuccessNotice } from './SuccessNotice';

type Permission = {status:'none'|'pending'|'accepted'|'declined';direction?:'incoming'|'outgoing'};
export function CallPermissionButton({source,connection,disabled,onCall}:{source:CommunitySource;connection:Connection;disabled:boolean;onCall:()=>void}) {
 const [permission,setPermission]=useState<Permission|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 const offered=useRef(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let alive=true,inflight=false;
  const refresh=async()=>{if(!source.callPermission||inflight)return;inflight=true;try{const p=await source.callPermission(connection.id);if(alive){setPermission(p);if(p.status==='pending'&&p.direction==='incoming'&&!offered.current){offered.current=true;setOpen(true);}if(p.status!=='pending')offered.current=false;}}catch{if(alive)setError('تعذّر تحديث إذن المكالمات. أعد المحاولة.');}finally{inflight=false;}};
  void refresh();const stop=source.watch(()=>void refresh());return()=>{alive=false;stop();};
 },[source,connection.id,retry]);
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();},[open]);
 async function act(action:'invite'|'accept'|'decline'){
  if(busy||!source.requestCallPermission)return;setBusy(true);setError('');
  try{setPermission(await source.requestCallPermission(connection.id,action));if(action==='decline')setOpen(false);}catch(e){setError(e instanceof Error?e.message:'تعذّر حفظ اختيارك.');}finally{setBusy(false);}
 }
 const allowed=!source.callPermission||permission?.status==='accepted';
 const incoming=permission?.status==='pending'&&permission.direction==='incoming';
 return <>
  <button className={'icon-btn cm-call-button'+(incoming?' cm-call-invited':'')} aria-label={allowed?'بدء مكالمة صوتية':incoming?'طلب إذن المكالمات الوارد':'إذن المكالمات'} disabled={disabled} onClick={()=>allowed?onCall():setOpen(true)}><Phone size={19}/>{incoming&&<i aria-hidden="true"/>}</button>
  {open&&<dialog ref={dialog} className="cm-call-permission" dir="rtl" aria-labelledby="call-permission-title" onCancel={()=>setOpen(false)}>
   <button className="icon-btn cm-permission-close" aria-label="إغلاق" onClick={()=>setOpen(false)}><X size={20}/></button>
   <span className="cm-permission-seal"><ShieldCheck size={30}/></span>
   <p className="cm-permission-eyebrow">خطوة بموافقتكما</p>
   <h2 id="call-permission-title">{incoming?'هل تسمح بالمكالمات؟':permission?.status==='accepted'?'المكالمات متاحة لكما':permission?.status==='pending'?'الدعوة وصلت':'نسمع بعض، حين نكون مستعدين'}</h2>
   <p>{incoming?`${connection.person.alias} يدعوك لتفعيل المكالمات الصوتية بينكما.`:permission?.status==='accepted'?'يمكن لأي منكما بدء مكالمة عندما يناسبكما الوقت.':permission?.status==='pending'?'بانتظار موافقة الطرف الآخر على إذن المكالمات.':permission?.status==='declined'?'لم تُقبل الدعوة السابقة. يمكنك اقتراحها مجددًا حين تكونان مستعدين.':'أرسل دعوة لتفعيل المكالمات الصوتية مع '+connection.person.alias+'.'}</p>
   {permission?.status==='accepted'?<SuccessNotice title="أصبح للصوت مكان بينكما" detail="تفعّل الإذن. لكل مكالمة قبول أو رفض مستقل."/>:<div className="cm-permission-note"><Check size={17}/><span>الموافقة مرة واحدة. بعدها يستطيع أي منكما الاتصال، ولكل مكالمة قبول أو رفض منفصل.</span></div>}
   {error&&<div><p role="alert" className="form-error">{error}</p><button className="btn-text" onClick={()=>{setError('');setRetry(n=>n+1);}}>تحديث إذن المكالمات</button></div>}
   {incoming?<div className="cm-permission-actions"><button className="btn-primary" disabled={busy} onClick={()=>void act('accept')}>السماح بالمكالمات</button><button className="btn-text" disabled={busy} onClick={()=>void act('decline')}>ليس الآن</button></div>:permission?.status==='accepted'?<button className="btn-primary" disabled={disabled} onClick={()=>{setOpen(false);onCall();}}>بدء مكالمة</button>:<button className="btn-primary" disabled={busy||!permission||permission.status==='pending'} onClick={()=>void act('invite')}>{busy?'جارٍ الإرسال…':permission?.status==='pending'?'بانتظار الموافقة':'إرسال دعوة للمكالمات'}</button>}
   <HelpButton topic="chat" label="الصوت، الميكروفون، وإذن الاتصال"/>
  </dialog>}
 </>;
}
