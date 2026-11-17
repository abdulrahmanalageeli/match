import {useEffect, useId, useRef, useState} from 'react';
import './membership.css';

/** Drawn for small display sizes: clean edges and no decorative raster detail. */
export function MembershipMark({serious=false}:{serious?:boolean}) {
  const id=useId();
  const ref=useRef<SVGSVGElement>(null);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    if(!ref.current||typeof IntersectionObserver==='undefined') return;
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));
    observer.observe(ref.current);
    return ()=>observer.disconnect();
  },[]);
  const outline='M16 2.5 20.5 5l5 .9.9 5L29 16l-2.6 4.5-.9 5-5 .9L16 29l-4.5-2.6-5-.9-.9-5L3 16l2.6-4.5.9-5 5-.9Z';
  return <svg ref={ref} className="wd-membership-mark" data-visible={visible||undefined} width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1"><stop className="wd-mark-light"/><stop offset=".55" className="wd-mark-tone"/><stop offset="1" className="wd-mark-deep"/></linearGradient>
      <linearGradient id={`${id}-sheen`}><stop stopColor="#fff4df" stopOpacity="0"/><stop offset=".5" stopColor="#fff4df" stopOpacity=".55"/><stop offset="1" stopColor="#fff4df" stopOpacity="0"/></linearGradient>
      <clipPath id={`${id}-clip`}><path d={outline}/></clipPath>
    </defs>
    <path className="wd-mark-body" style={{fill:`url(#${id}-metal)`}} d={outline}/>
    <path className="wd-mark-rim" d="m16 5 3.7 2.1 4.1.8.8 4.1 2.1 4-2.1 3.7-.8 4.1-4.1.8L16 27l-3.7-2.4-4.1-.8-.8-4.1L5 16l2.4-4 .8-4.1 4.1-.8Z"/>
    {serious?<><path className="wd-mark-symbol" d="M16 23s-7-4.2-7-8.2c0-3.1 3.8-4.5 7-1.4 3.2-3.1 7-1.7 7 1.4 0 4-7 8.2-7 8.2Z"/><path className="wd-mark-detail" d="M11 10c1.5-2 3.4-1.7 5-.2 1.6-1.5 3.5-1.8 5 .2M13 25h6"/></>:<path className="wd-mark-symbol" d="M16 22s-7-4.1-7-8.4c0-3.5 4.4-4.9 7-1.5 2.6-3.4 7-2 7 1.5C23 17.9 16 22 16 22Z"/>}
    <g clipPath={`url(#${id}-clip)`}><path className="wd-mark-sheen" d="M-18-4h12L10 36H-2Z" fill={`url(#${id}-sheen)`}/></g>
  </svg>;
}

/** Membership status only; deliberately distinct from identity verification. */
export function MemberBadge({active=false,tier}:{active?:boolean;tier?:'free'|'premium'|'seriousness'}) {
  const serious=tier==='seriousness';
  const label=serious?'عضوية وسام الجدية':'عضوية وُدَين المميزة';
  return active||tier==='premium'||serious ? <span className="wd-member-badge" data-tier={serious?'seriousness':'premium'} role="img" aria-label={label} title={label}><MembershipMark serious={serious}/></span> : null;
}
