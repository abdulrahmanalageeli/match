import {useLayoutEffect,useRef} from 'react';
import type {MembershipReceiptData} from '../types';
import './membership-receipt.css';
import {MembershipMark} from './MemberBadge';

const day = new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{timeZone:'Asia/Riyadh',dateStyle:'long'});
export function MembershipReceipt({receipt,close}:{receipt:MembershipReceiptData;close:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 useLayoutEffect(()=>{
  const dialog=ref.current;
  dialog?.showModal();
  return ()=>{if(dialog?.open)dialog.close();};
 },[]);
 function dismiss() {
  if(!ref.current?.open)return;
  ref.current.close();
  close();
 }
 const plan=receipt.tier==='seriousness'?'وسام الجدية':'وُدَين المميزة';
 const ended=receipt.kind==='end';
 const apple=receipt.source==='apple';
 const peer=receipt.source==='member';
 const future=Date.parse(receipt.startsAt)>Date.now();
 const title=peer?(ended?'تحديث على هدية عضويتك':future?'هدية عضوية قادمة':'وصلتك هدية عضوية'):ended?(future?'أُلغيت المنحة القادمة':'انتهت منحتك'):future?'منحة قادمة لك':receipt.kind==='extend'?'مُدّدت منحتك':apple?(receipt.promotion?'تفعّل عرض العودة':receipt.appleTrial?'بدأت تجربتك المجانية':'تفعّل اشتراكك'):'هدية عضوية من وُدَين';
 return <dialog ref={ref} dir="rtl" className="wd-membership-receipt" aria-labelledby="wd-receipt-title"
   onCancel={event=>{event.preventDefault();dismiss();}}>
   <MembershipMark serious={receipt.tier==='seriousness'}/>
   <p>{title}</p><h2 id="wd-receipt-title">{plan}</h2>
   <p>{ended?'يمكنك الاطلاع على عضويتك الحالية في الإعدادات.':peer?'دُفعت عضويتك كهدية لمدة ٣٠ يومًا، دون تجديد تلقائي.':apple?'اشتراكك عبر App Store. يمكنك مراجعة التجديد في اشتراكات Apple.':'هذه المنحة على حساب وُدَين، دون رسوم أو تجديد تلقائي للمنحة.'}</p>
   {!ended&&<dl>{future&&<div><dt>تبدأ</dt><dd>{day.format(new Date(receipt.startsAt))}</dd></div>}
    <div><dt>{apple?'الفترة الحالية حتى':'تنتهي'}</dt><dd>{day.format(new Date(receipt.endsAt))}</dd></div></dl>}
   <button type="button" className="f-primary" onClick={dismiss}>متابعة</button>
 </dialog>;
}
