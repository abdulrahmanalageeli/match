import {ChevronLeft} from '../BrandIcons';
import {useMembershipAccess} from './access';
import {MembershipMark} from './MemberBadge';

/** One route to the existing subscription screen, driven by current entitlements. */
export function MembershipEntry(){
 const {tier,premium,upgrade}=useMembershipAccess();
 const current=tier??(premium?'premium':'free');
 const serious=current==='seriousness';
 return <button type="button" className="wd-membership-entry" data-tier={current} onClick={upgrade}
  aria-label={`${serious?'وسام الجدية':current==='premium'?'عضويتك المميزة':'عضويتك المجانية'} · ${serious?'إدارة العضوية':'اكتشاف الاشتراكات وترقية العضوية'}`}>
   {current!=='free'&&<span className="wd-entry-insignia"><MembershipMark serious={serious}/></span>}
  <span className="wd-entry-copy"><strong>{serious?'وسام الجدية':current==='premium'?'العضوية المميزة':'العضوية المجانية'}</strong></span>
  <ChevronLeft size={13}/>
 </button>;
}
