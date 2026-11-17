import './membership.css';

/** Membership status only; deliberately distinct from identity verification. */
export function MemberBadge({active=false}:{active?:boolean}) {
  return active ? <span className="wd-member-badge" role="img" aria-label="عضوية وُدَين المميزة" title="عضوية وُدَين المميزة"><img src="/brand/wudayn-member-seal.png" alt="" width="22" height="22"/></span> : null;
}
