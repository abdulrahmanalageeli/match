import { useEffect, useId, useRef, useState } from 'react';
import { Bell, Check, ChevronLeft, Phone } from '../BrandIcons';
import { feedback } from '../feedback/haptics';
import type { CommunitySource, Connection, SeriousnessAgreement } from './data';
import { latinPhoneDigits, normalizeFamilyPhone } from './familyPhone';
import { Sheet } from './Sheet';
import './family-contact.css';

export function RematchChoice({checked,change,disabled}:{checked:boolean;change:(value:boolean)=>void;disabled:boolean}) {
  return <label className="cm-rematch-choice"><input type="checkbox" checked={checked} onChange={event=>change(event.target.checked)} disabled={disabled}/><span><strong>السماح بالتعارف مجددًا</strong><small>{checked?'يمكن لأي منكما إرسال طلب جديد؛ لن يبدأ التعارف إلا بعد قبول الطرف الآخر.':'لن تتمكّنا من إرسال طلب تعارف جديد لبعضكما.'}</small></span></label>;
}

export function FamilyContactReveal({source, requestId}:{source:CommunitySource;requestId:string}) {
  const [phone,setPhone]=useState('');
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const ticket=useRef(0);
  useEffect(()=>{
    function hide(){ticket.current++;setPhone('');setPending(false);setError('');}
    const visibility=()=>{if(document.hidden)hide();};
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',hide);
    return ()=>{ticket.current++;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',hide);};
  },[source,requestId]);
  useEffect(()=>{
    if(!phone)return;
    return source.watch(()=>{ticket.current++;setPhone('');setPending(false);},'nonChat');
  },[source,phone]);
  async function reveal(){
    if(!source.familyContact || pending)return;
    const current=++ticket.current;
    setPending(true);setError('');
    try{
      const result=normalizeFamilyPhone(await source.familyContact(requestId) ?? '');
      if(current!==ticket.current)return;
      if(result)setPhone(result);else setError('رقم الأهل لم يعد متاحًا.');
    }catch{if(current===ticket.current)setError('تعذّر عرض الرقم. حاول مرة ثانية.');}
    finally{if(current===ticket.current)setPending(false);}
  }
  if(!source.familyContact)return null;
  return <div className="wd-family-contact">
    {phone ? <><a className="wd-family-number" href={'tel:'+phone}><Phone size={17} aria-hidden="true"/><span>الاتصال بالأهل</span><bdi dir="ltr">{phone}</bdi></a>
      <button className="wd-family-hide" type="button" onClick={()=>setPhone('')}>إخفاء الرقم</button></>
    : <button className="wd-family-reveal" type="button" disabled={pending} onClick={()=>void reveal()}><Phone size={16} aria-hidden="true"/>{pending?'جارٍ عرض الرقم…':'عرض رقم الأهل'}<ChevronLeft size={14} aria-hidden="true"/></button>}
    {error&&<p role="alert" className="form-error">{error}</p>}
  </div>;
}

type DecisionProps={
  source:CommunitySource;
  connection:Connection;
  mode:'share'|'close';
  initialContext?:'general'|'pact';
  viewerGender?:'man'|'woman';
  dismiss:()=>void;
  onClosed:()=>void;
};
export function PactDecisionSheet({source,connection,mode,initialContext='general',viewerGender,dismiss,onClosed}:DecisionProps){
  const closing=mode==='close';
  const alias=connection.person.alias;
  const [pact,setPact]=useState<SeriousnessAgreement|null>(null);
  const [lookupFailed,setLookupFailed]=useState(false);
  const [retry,setRetry]=useState(0);
  const [attach,setAttach]=useState(!closing);
  const [raw,setRaw]=useState('');
  const [rematch,setRematch]=useState(false);
  const [reason,setReason]=useState(initialContext);
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState(false);
  const [invalid,setInvalid]=useState(false);
  const [error,setError]=useState('');
  const lock=useRef(false), field=useRef<HTMLInputElement>(null);
  const id=useId();
  useEffect(()=>{
    if(!closing || !source.agreement)return;
    let live=true;
    setLookupFailed(false);
    source.agreement(connection.id).then(a=>{if(live)setPact(a);},()=>{if(live)setLookupFailed(true);});
    return ()=>{live=false;};
  },[source,connection.id,closing,retry]);
  const signed=Boolean(pact?.womanSignedAt && pact.manSignedAt && ['accepted','expired','family'].includes(pact.status));
  const context=(signed || (!pact && initialContext==='pact'))?reason:'general';
  const offer=Boolean(viewerGender!=='man' && source.shareFamilyContact && source.familyContactAvailable?.(connection.id)!==false &&
    signed && pact?.actor==='reham' && !pact.hasFamilyContact);
  const sharing=attach && (!closing || offer);
  async function submit(){
    if(lock.current)return;
    const phone=sharing?normalizeFamilyPhone(raw):null;
    if(sharing&&!phone){setInvalid(true);field.current?.focus();return;}
    lock.current=true;setBusy(true);setError('');
    try{
      if(closing && source.closeIntroduction){
        await source.closeIntroduction(connection.id,{context,allowRematch:rematch,...(phone?{familyPhone:phone}:{})});
      }else if(sharing && phone){
        if(!source.shareFamilyContact)throw Error('مشاركة الرقم غير متاحة لهذا التعارف.');
        await source.shareFamilyContact(connection.id,phone,{closeNow:closing,allowRematch:closing && rematch});
      }else await source.act(connection.id,'cancel',undefined,rematch);
      feedback('success');
      if(closing)onClosed();
      else{setRaw('');setSent(true);}
    }catch(e){setError(e instanceof Error && /[\u0600-\u06ff]/.test(e.message)?e.message:'تعذّر حفظ اختيارك. حاول مرة ثانية.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <Sheet title={closing?'إنهاء التعارف':'مشاركة رقم الأهل'} onClose={dismiss} dismissDisabled={busy} className="wd-pact-decision">
    {sent ? <div className="wd-family-sent" role="status"><Check size={22} aria-hidden="true"/><h3>شاركتِ رقم الأهل مع {alias}</h3><p>يقدر يعرض الرقم من الميثاق ويتصل بأهلك للخطوة الرسمية.</p><button type="button" className="btn-primary" onClick={dismiss}>تم</button></div> :
    <form noValidate onSubmit={event=>{event.preventDefault();void submit();}}>
      {closing&&<p className="wd-pact-lead">بعد التأكيد، تتوقف رسائلك ومكالماتك مع <bdi>{alias}</bdi>.</p>}
      {closing&&source.agreement&&!pact&&!lookupFailed&&<small className="wd-pact-loading" role="status">جارٍ التحقق من خيارات الميثاق…</small>}
      {closing&&signed&&source.closeIntroduction&&<fieldset className="wd-close-reason" disabled={busy}>
        <legend>سبب الإنهاء</legend>
        <div>{([['general','قرار شخصي'],['pact','إنهاء الميثاق']] as const).map(([value,label])=><label key={value}>
          <input type="radio" name={id+'-reason'} value={value} checked={reason===value} onChange={()=>setReason(value)}/><span>{label}</span>
        </label>)}</div>
      </fieldset>}
      {closing&&offer&&<label className="wd-decision-option"><strong>إرفاق رقم الأهل للخطوة الرسمية</strong><input className="wd-decision-toggle" type="checkbox" checked={attach} disabled={busy} onChange={e=>{setAttach(e.target.checked);setInvalid(false);setError('');}}/></label>}
      {lookupFailed&&<button className="btn-text" type="button" disabled={busy} onClick={()=>setRetry(n=>n+1)}>إعادة التحقق من الميثاق</button>}
      {sharing&&<div className="wd-family-entry">
        {!closing&&<p>يقدر <bdi>{alias}</bdi> يتواصل مع أهلك على هذا الرقم للخطوة الرسمية.</p>}
        <label htmlFor={id}>رقم الوالد أو أحد من الأهل</label>
        <div className="wd-family-field"><Phone size={17} aria-hidden="true"/><input ref={field} id={id} dir="ltr" type="tel" inputMode="tel" autoComplete="off" maxLength={24} placeholder="05X XXX XXXX" value={raw} disabled={busy} aria-invalid={invalid||undefined} aria-describedby={id+'-help'+(invalid?' '+id+'-error':'')} onChange={e=>{setRaw(latinPhoneDigits(e.target.value));setInvalid(false);setError('');}}/></div>
        {invalid&&<p className="form-error" id={id+'-error'} role="alert">أدخلي رقم جوال أو هاتف ثابت سعودي بصيغة صحيحة.</p>}
        <small id={id+'-help'}>أنتِ مسؤولة عن صحة الرقم وموافقة صاحبه على التواصل.</small>
      </div>}
      {closing&&<label className="wd-decision-option wd-rematch-option"><span><strong>السماح بالتعارف مجددًا</strong>
        <small>{rematch?'أي طلب جديد يحتاج موافقة الطرف الآخر.':'بعد الإنهاء، ما يقدر أي منكما يرسل طلبًا جديدًا للآخر.'}</small></span>
        <input className="wd-decision-toggle" type="checkbox" checked={rematch} disabled={busy} onChange={e=>setRematch(e.target.checked)}/></label>}
      {closing&&source.closeIntroduction&&<div className="wd-closure-notice" aria-live="polite"><Bell size={16} aria-hidden="true"/><p>
        {context==='pact'?'يوصل إشعار بأنك أنهيت التعارف ضمن الميثاق.':'يوصل إشعار بأنك أنهيت التعارف.'}
        {(sharing||pact?.hasFamilyContact)&&' رقم الأهل متاح داخل «التعارفات السابقة».'}
      </p></div>}
      {error&&<p role="alert" className="form-error">{error}</p>}
      <div className="wd-decision-actions"><button type="submit" className="btn-primary" disabled={busy}>{busy?'جارٍ الحفظ…':closing?sharing?'مشاركة الرقم وإنهاء التعارف':'تأكيد إنهاء التعارف':'مشاركة رقم الأهل'}</button>
        <button type="button" className="btn-text" disabled={busy} onClick={dismiss}>{closing?'تراجع':'رجوع'}</button></div>
    </form>}
  </Sheet>;
}
