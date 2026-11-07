import { Check, X } from 'lucide-react';
import './success-notice.css';
export function SuccessNotice({title,detail,close,quiet=false}:{title:string;detail:string;close?:()=>void;quiet?:boolean}){
 return <div className="nf-success" data-quiet={quiet||undefined} role="status"><span className="nf-success-emblem" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21"/></svg><Check size={20}/><i/><i/><i/></span><div><strong>{title}</strong><p>{detail}</p></div>{close&&<button onClick={close} aria-label="إغلاق تأكيد العملية"><X size={16}/></button>}</div>;
}
