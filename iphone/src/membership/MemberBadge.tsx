import './membership.css';

/** Membership status only; deliberately distinct from identity verification. */
export function MemberBadge({active=false,tier}:{active?:boolean;tier?:'free'|'premium'|'seriousness'}) {
  const serious=tier==='seriousness';
  const label=serious?'عضوية وسام الجدية':'عضوية وُدَين المميزة';
  return active ? <span className="wd-member-badge" role="img" aria-label={label} title={label}><img src={serious?'/brand/wudayn-seriousness-seal.png':'/brand/wudayn-member-seal.png'} alt="" width="22" height="22"/></span> : null;
}
