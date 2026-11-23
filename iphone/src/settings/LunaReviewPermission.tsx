import { useEffect, useState } from 'react';
import { callRpc } from '../cloud';
import { currentRegistrationReceipt, type SignupAgreements } from '../auth/signupReturn';

export function LunaReviewPermission({owner}:{owner:string}) {
  const [receipt, setReceipt] = useState<SignupAgreements | null>(null);
  const [saving, setSaving] = useState<'safety' | 'transcript' | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live=true;
    setReceipt(null);
    setError('');
    void callRpc<SignupAgreements|null>('wudayn_registration_agreements',{command:'read'},owner)
      .then(value=>{if(live)setReceipt(value);})
      .catch(()=>{if(live)setError('تعذّر تحميل أذونات الخصوصية.');});
    return ()=>{live=false;};
  }, [owner,retry]);

  const transcriptAllowed = receipt?.transcript === true && !receipt.withdrawnAt;
  async function toggle(purpose: 'safety' | 'transcript') {
    if (!receipt || saving) return;
    const command = purpose === 'safety' ? (receipt.safetyTextReview ? 'withdrawSafety' : 'allowSafety') : (transcriptAllowed ? 'withdraw' : 'allowTranscript');
    setSaving(purpose);
    setError('');
    try {
      const saved=await callRpc<SignupAgreements>('wudayn_registration_agreements',{command},owner);
      setReceipt(saved);
      if (purpose==='transcript') window.dispatchEvent(new Event('wudayn:entry-agreements'));
    } catch {setError('تعذّر حفظ اختيارك. حاول مرة أخرى.');}
    finally {setSaving(null);}
  }

  return <>
    {receipt && <div className="st-row"><div className="st-row-copy"><strong>الفرز الآلي لبلاغات رسائلي</strong>
      <small>إذا أبلغ المستلم عن إحدى رسائلك المستقبلية وطلب فرزها، يمكن إرسال مقتطف منها إلى OpenAI بعد حجب بيانات التواصل لتحديد أولوية المراجعة. القرار للفريق.</small>
      <button type="button" className="f-link" disabled={saving!==null} onClick={()=>void toggle('safety')}>{receipt.safetyTextReview?'سحب إذن فرز الرسائل المُبلّغ عنها':'السماح بفرز الرسائل المُبلّغ عنها'}</button></div></div>}
    {currentRegistrationReceipt(receipt) && <div className="st-row"><div className="st-row-copy"><strong>مراجعة حواري مع لونا</strong>
      <small>يمكنك السماح لمراجع العضوية بقراءة رسائلك وردود لونا في الجلسات التي تبدأ بعد إذنك. يُسجَّل سبب الاطلاع، ويُحذف الحوار بعد ٣٠ يومًا من آخر تعديل. يمكنك سحب الإذن متى شئت.</small>
      <button type="button" className="f-link" disabled={saving!==null} onClick={()=>void toggle('transcript')}>{transcriptAllowed?'سحب إذن الاطلاع':'السماح بمراجعة الجلسات الجديدة'}</button></div></div>}
    {error && <p role="alert">{error} {!receipt && <button className="f-link" type="button" onClick={()=>setRetry(value=>value+1)}>إعادة المحاولة</button>}</p>}
  </>;
}
