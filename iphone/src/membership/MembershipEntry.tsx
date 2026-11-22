import {useEffect,useRef,useState} from 'react';
import {Check,ChevronLeft,X} from '../BrandIcons';
import type {MembershipPlan} from '../membershipPricing';
import {useMembershipAccess} from './access';
import {MembershipMark} from './MemberBadge';

/** One route to the existing subscription screen, driven by current entitlements. */
export function MembershipEntry(){
 const {tier,premium,upgrade}=useMembershipAccess();
 const current=tier??(premium?'premium':'free');
 const serious=current==='seriousness';
 return <button type="button" className="wd-membership-entry" data-tier={current} onClick={()=>upgrade(current==='premium'?'seriousness':undefined)}
  aria-label={`${serious?'وسام الجدية':current==='premium'?'عضويتك المميزة':'عضويتك المجانية'} · ${serious?'إدارة العضوية':'اكتشاف الاشتراكات وترقية العضوية'}`}>
   {current!=='free'&&<span className="wd-entry-insignia"><MembershipMark serious={serious}/></span>}
  <span className="wd-entry-copy"><strong>{serious?'وسام الجدية':current==='premium'?'العضوية المميزة':'المجانية · ترقية'}</strong></span>
  <ChevronLeft size={13}/>
 </button>;
}

type Tier = 'free' | MembershipPlan;
const tierChanges:Record<Tier,[string,string]> = {
 free:['عضويتك الآن مجانية','يمكنك متابعة الاستكشاف وقبول طلبات التعارف.'],
 premium:['تفعّلت عضويتك المميزة','يمكنك الآن قراءة تفاصيل التوافق والمبادرة بطلب تعارف.'],
 seriousness:['تفعّل وسام الجدية','يمكنك الآن البحث مع لونا وطلب تحليل التوافق المعمّق.'],
};

export function MembershipChangeNotice({tier}:{tier:Tier}) {
 const lastTier=useRef(tier);
 const [change,setChange]=useState<{from:Tier;to:Tier}|null>(null);
 useEffect(()=>{
   if(lastTier.current!==tier){
     setChange({from:lastTier.current,to:tier});
     lastTier.current=tier;
   }
 },[tier]);
 if(!change)return null;
 const {from,to}=change;
 const [title,detail]=from==='seriousness'&&to==='premium'
   ? ['عضويتك الآن المميزة','تبقى لك قراءة التوافق وبدء تعارفين في الوقت نفسه.']
   : tierChanges[to];
 return <aside className="feedback wd-tier-change" data-tier={to}>
   {to==='free'?<Check aria-hidden="true" size={22}/>:<MembershipMark serious={to==='seriousness'}/>}
   <div role="status"><strong>{title}</strong><span>{detail}</span></div>
   <button type="button" aria-label="إغلاق إشعار العضوية" onClick={()=>setChange(null)}><X size={17}/></button>
 </aside>;
}
