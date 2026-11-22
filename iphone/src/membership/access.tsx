import {createContext,useContext} from 'react';
import type {MembershipPlan} from '../membershipPricing';
export const MembershipAccess = createContext<{premium:boolean;demo?:boolean;tier?:'free'|'premium'|'seriousness';connectionLimit?:number;upgrade:(plan?:MembershipPlan)=>void}>({premium:false,upgrade:()=>{}});
export const useMembershipAccess=()=>useContext(MembershipAccess);

export function MembershipPrompt({detail='بادر بطلب تعارف، واكتشف تفاصيل التوافق مع العضوية المميزة.'}:{detail?:string}) {
  const {premium,upgrade}=useMembershipAccess();
  if(premium)return null;
  return <button type="button" className="wd-upgrade-prompt" onClick={()=>upgrade('premium')}><img src="/brand/wudayn-member-seal.png" alt="" width="30" height="30"/><span><strong>وُدَين المميزة</strong><small>{detail}</small></span><span className="wd-upgrade-link">عرض العضوية ←</span></button>;
}
