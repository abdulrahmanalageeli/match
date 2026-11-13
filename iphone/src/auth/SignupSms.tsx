import { useEffect,useRef,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShieldCheck,X } from '../BrandIcons';
import { registrationDeviceId,type SignupVerification } from './registrationDevice';
import './signup-sms.css';

export function normalizeSignupPhone(value:string){
 const digits=value.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[\s()-]/g,'');
 const phone=digits.startsWith('05')?'+966'+digits.slice(1):digits.startsWith('5')?'+966'+digits:digits.startsWith('00966')?'+'+digits.slice(2):digits.startsWith('966')?'+'+digits:digits;
 if(!/^\+9665\d{8}$/.test(phone))throw Error('أدخل رقم جوال سعودي صالحًا، مثل 05XXXXXXXX.');return phone;
}
async function api(body:Record<string,unknown>){
 let response:Response;
 try{response=await fetch('https://nisfayn-admin.vercel.app/api/signup-sms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});}
 catch{throw Error('تعذّر الاتصال بخدمة الرسائل. حاول مجددًا.');}
 const value=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(value.error==='wrong_code'?'الرمز غير صحيح. تحقق من الرسالة وأعد المحاولة.':value.error==='rate_limited'?'طلبات كثيرة. انتظر قبل طلب رمز جديد.':value.error==='expired'?'انتهت صلاحية المحاولة أو تجاوزت عدد المحاولات. اطلب رمزًا جديدًا.':'تعذّر إرسال أو تأكيد الرمز حاليًا. حاول لاحقًا.');
 return value;
}
function SmsDialog({email,deviceId,done}:{email:string;deviceId:string;done:(result:SignupVerification|null)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),alive=useRef(true),phoneInput=useRef<HTMLInputElement>(null),codeInput=useRef<HTMLInputElement>(null);
 const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[proof,setProof]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[duplicate,setDuplicate]=useState(false),[cooldown,setCooldown]=useState(0);
 useEffect(()=>{dialog.current?.showModal();return()=>{alive.current=false;};},[]);
 useEffect(()=>{requestAnimationFrame(()=>{(proof?codeInput:phoneInput).current?.focus({preventScroll:true});});},[proof]);
 useEffect(()=>{if(cooldown<=0)return;const timer=setTimeout(()=>setCooldown(n=>n-1),1000);return()=>clearTimeout(timer);},[cooldown]);
 async function send(){
  if(busy||cooldown>0)return;setError('');setBusy(true);
  try{const normalized=normalizeSignupPhone(phone);const value=await api({action:'send',email,phone:normalized,deviceId,consent:true,consentVersion:'signup-sms-device-v1'});if(!alive.current)return;if(value.verified===true){done({phoneProof:value.proof,deviceId});return;}setPhone(normalized);setProof(value.proof);setDuplicate(value.duplicateDevice===true);setCooldown(60);setCode('');}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'تعذّر إرسال الرمز.');}
  finally{if(alive.current)setBusy(false);}
 }
 async function verify(){
  if(busy)return;setBusy(true);setError('');
  try{const value=await api({action:'verify',proof,deviceId,otp:code.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632))});if(value.verified!==true)throw Error('لم يكتمل التحقق.');if(alive.current)done({phoneProof:proof,deviceId});}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'تعذّر تأكيد الرمز.');}
  finally{if(alive.current)setBusy(false);}
 }
 return <dialog ref={dialog} className="nf-sms-dialog" dir="rtl" aria-labelledby="signup-sms-title" aria-describedby="signup-sms-description" onCancel={e=>{e.preventDefault();if(!busy)done(null);}}>
  <button type="button" className="nf-sms-close" aria-label="إلغاء تأكيد الجوال" disabled={busy} onClick={()=>done(null)}><X size={20}/></button>
  <ShieldCheck size={28}/><p className="nf-sms-eyebrow">حسابك · خطوة الأمان</p><h2 id="signup-sms-title">{proof?'رمز واحد، وبداية أوثق':'نؤكّد رقم جوالك'}</h2>
  <p id="signup-sms-description">{proof?'أدخل رمز التحقق الذي وصلك برسالة نصية. رقمك لا يظهر للأعضاء.':'نرسل لك رمزًا برسالة نصية للتأكد من أنك تملك الرقم. رقمك لا يظهر للأعضاء.'}</p>
  {!proof&&<p className="nf-sms-precision">تأكيد الجوال يحمي الحساب، لكنه لا يُعد تحققًا من الهوية الوطنية.</p>}
  {duplicate&&<div className="nf-sms-duplicate" role="status"><strong>سبق التسجيل من هذا الجهاز</strong><span>يمكنك المتابعة وإنشاء حساب آخر خلال فترة الاختبار.</span></div>}
  <form onSubmit={e=>{e.preventDefault();void(proof?verify():send());}}>
   <label>رقم الجوال<input ref={phoneInput} type="tel" dir="ltr" inputMode="tel" autoComplete="tel" enterKeyHint="next" placeholder="05XXXXXXXX" required value={phone} disabled={busy} readOnly={Boolean(proof)} onChange={e=>setPhone(e.target.value)}/></label>
   {proof&&<label>رمز التحقق<input ref={codeInput} className="nf-sms-code" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="done" dir="ltr" value={code} maxLength={8} minLength={4} required disabled={busy} onChange={e=>setCode(e.target.value.replace(/[^0-9٠-٩]/g,''))}/></label>}
   {error&&<p role="alert" className="form-error">{error}</p>}
   <button className="f-primary" disabled={busy||(!proof&&cooldown>0)}>{busy?'لحظات…':!proof&&cooldown>0?`إعادة الإرسال بعد ${cooldown} ث`:proof?'تأكيد وإنشاء حسابي':'إرسال رمز التحقق'}</button>
  </form>
  {proof&&<div className="nf-sms-links"><button type="button" aria-live="polite" disabled={busy||cooldown>0} onClick={()=>void send()}>{cooldown>0?`إعادة الإرسال بعد ${cooldown} ث`:'إرسال رمز جديد'}</button><button type="button" disabled={busy} onClick={()=>{setProof('');setCode('');setError('');}}>تعديل الرقم</button></div>}
 </dialog>;
}
export async function confirmSignupSms(email:string):Promise<SignupVerification|null>{
 const deviceId=await registrationDeviceId();
 return new Promise(resolve=>{const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host),previous=document.activeElement as HTMLElement|null;
  root.render(<SmsDialog email={email} deviceId={deviceId} done={result=>{root.unmount();host.remove();previous?.focus();resolve(result);}}/>);
 });
}
