import { useEffect, useState } from 'react';
import { callRpc } from '../cloud';
import { currentRegistrationReceipt, type SignupAgreements } from '../auth/signupReturn';

export function LunaReviewPermission({owner}:{owner:string}) {
  const [state,setState]=useState<'closed'|'ready'|'busy'|'withdrawn'>('closed');
  const [error,setError]=useState('');
  const [safety,setSafety]=useState<boolean|null>(null),[savingSafety,setSavingSafety]=useState(false);
  useEffect(()=>{
    let live=true;
    void callRpc<SignupAgreements|null>('wudayn_registration_agreements',{command:'read'},owner).then(receipt=>{
      if(live && receipt)setSafety(receipt.safetyTextReview===true);
      if(live && currentRegistrationReceipt(receipt))setState('ready');
    }).catch(()=>{ if(live){setState('ready');setError('تعذّر التحقق من الإذن. يمكنك طلب إيقاف الاطلاع أدناه.');} });
    return()=>{live=false;};
  },[owner]);
  async function withdraw() {
    setState('busy');setError('');
    try {
      await callRpc('wudayn_registration_agreements',{command:'withdraw'},owner);
      setState('withdrawn');
      window.dispatchEvent(new Event('wudayn:entry-agreements'));
    } catch {setState('ready');setError('تعذّر سحب الإذن. حاول مرة أخرى.');}
  }
  async function changeSafety(){
    if(savingSafety)return;
    setSavingSafety(true);setError('');
    try {const receipt=await callRpc<SignupAgreements>('wudayn_registration_agreements',{command:safety?'withdrawSafety':'allowSafety'},owner);setSafety(receipt?.safetyTextReview===true);}
    catch {setError('تعذّر حفظ اختيارك. حاول مرة أخرى.');}
    finally {setSavingSafety(false);}
  }
  return <>{safety!==null&&<div className="st-row"><div className="st-row-copy"><strong>الفرز الآلي لبلاغات رسائلي</strong>
    <small>عند تفعيل الإذن، يمكن إرسال مقتطف من رسالة مستقبلية إلى OpenAI، بعد حجب وسائل التواصل، فقط إذا أبلغ عنها المستلم وطلب فرزها.</small>
    <button type="button" className="f-link" disabled={savingSafety} onClick={()=>void changeSafety()}>{safety?'سحب إذن فرز الرسائل المُبلّغ عنها':'السماح بفرز الرسائل المُبلّغ عنها'}</button></div></div>}
    {error&&<p role="alert">{error}</p>}
    {state==='withdrawn'? <p className="flow-note" role="status">تم إيقاف اطلاع فريق العضوية على حوار لونا.</p> : state!=='closed' && <div className="st-row"><div className="st-row-copy"><strong>خصوصية حواري مع لونا</strong>
    <small>يمكنك إيقاف اطلاع فريق العضوية على حوارك المحفوظ.</small>
    <button type="button" className="f-link" disabled={state==='busy'} onClick={()=>void withdraw()}>سحب إذن الاطلاع</button>
    </div></div>}</>;
}
