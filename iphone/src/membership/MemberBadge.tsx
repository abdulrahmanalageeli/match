import type {CSSProperties} from 'react';
import './membership.css';

/** Shared artwork from the membership details screen. */
export function MembershipMark({serious=false}:{serious?:boolean}) {
  return <img className="wd-membership-mark" src={serious?'/brand/wudayn-seriousness-seal.png':'/brand/wudayn-member-seal.png'} alt="" width="24" height="24"/>;
}

/** Membership is distinct from identity verification. */
export function MemberBadge({active=false,tier,labeled=false}:{active?:boolean;tier?:'free'|'premium'|'seriousness';labeled?:boolean}) {
 const serious=tier==='seriousness';
 return (tier ? tier !== 'free' : active) ? <span className={"wd-member-badge"+(labeled?" wd-member-badge-labeled":"")} data-tier={serious?'seriousness':'premium'} role="img" aria-label={serious?'وسام الجدية':'عضوية وُدَين المميزة'} style={{'--seal-image':`url("${serious?'/brand/wudayn-seriousness-seal.png':'/brand/wudayn-member-seal.png'}")`} as CSSProperties}><MembershipMark serious={serious}/>{labeled&&<span>{serious?'وسام الجدية':'مميز'}</span>}</span> : null;
}
