import {useRef,useState} from 'react';
import type {AdminApi,MemberDetail} from './types';
import {call,friendly} from './client';

const names:Record<string,string>={free:'مجانية',premium:'المميزة',seriousness:'وسام الجدية',actual:'العضوية الفعلية'};
export function MembershipControls({member,api,completed,live=false}:{live?:boolean;member:MemberDetail;api:AdminApi;completed:()=>void}) {
  const [tier,setTier]=useState(member.membershipGrant?.tier??'actual');
  const [days,setDays]=useState(30),[blocked,setBlocked]=useState(member.lunaSearch?.blocked??false);
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const intent=useRef<{key:string;id:string}|null>(null);
  if(member.accountSource==='pair_test') return null;
  return <section className="review-section account-controls"><h3>العضوية والبحث مع لونا</h3>
    <p>العضوية الحالية · {names[member.membershipTier??'free']}</p>
    {member.membershipGrant&&<p>المنحة · {names[member.membershipGrant.tier]} · حتى {new Date(member.membershipGrant.expiresAt).toLocaleDateString('ar-SA')}</p>}
    {member.membershipTesting&&<p>اختبار المالك مفعّل · {names[member.membershipTesting]}</p>}
    <p>عمليات بحث لونا اليوم · {member.lunaSearch?.requestsToday??0} / 30</p>
    {member.lunaSearch?.lastUsedAt&&<p>آخر بحث · {new Date(member.lunaSearch.lastUsedAt).toLocaleString('ar-SA')}</p>}
    {live?<form onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');try{await call('wudayn_admin_luna_block',{target:member.memberId,blocked,reason:reason.trim()});completed();}catch(e){setError(friendly(e));}finally{setBusy(false);}}}>
      <label><input type="checkbox" checked={blocked} onChange={e=>setBlocked(e.target.checked)}/> إيقاف بحث لونا لهذا العضو</label><label>سبب التغيير<input required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {error&&<p className="notice error" role="alert">{error}</p>}<button className="secondary" disabled={busy||blocked===(member.lunaSearch?.blocked??false)||reason.trim().length<3}>حفظ إعداد البحث</button></form>:api.membership?<form onSubmit={async event=>{
      event.preventDefault();if(busy||!api.membership)return;
      const key=JSON.stringify([member.memberId,tier,days,blocked,member.revision,reason]);
      if(intent.current?.key!==key)intent.current={key,id:crypto.randomUUID()};
      setBusy(true);setError('');
      try{await api.membership(member.memberId,tier,days,blocked,member.revision,reason,intent.current.id);completed();}
      catch(problem){setError(friendly(problem));}finally{setBusy(false);}
    }}>
      <label>منحة العضوية<select disabled={busy} value={tier} onChange={event=>setTier(event.target.value)}><option value="actual">إزالة المنحة والعودة للاستحقاق الفعلي</option><option value="premium">المميزة</option><option value="seriousness">وسام الجدية</option></select></label>
      {tier!=='actual'&&<label>المدة بالأيام<input required type="number" min={1} max={365} value={days} disabled={busy} onChange={event=>setDays(Number(event.target.value))}/></label>}
      <label><input type="checkbox" checked={blocked} disabled={busy} onChange={event=>setBlocked(event.target.checked)}/> إيقاف البحث مع لونا لهذا العضو</label>
      <label>سبب الإجراء<textarea required minLength={3} maxLength={500} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)}/></label>
      <p className="muted">المنحة تمنح مزايا مؤقتة، وتُسجّل مع سبب الإجراء في سجل الإدارة. إدارة فواتير الاشتراك عبر Apple.</p>
      {error&&<p role="alert" className="notice error">{error}</p>}<button className="primary" disabled={busy||reason.trim().length<3}>{busy?'جارٍ الحفظ…':'حفظ العضوية وإعدادات لونا'}</button>
    </form>:<p className="muted">إدارة العضوية متاحة في بيئة الحسابات المتصلة.</p>}
  </section>;
}

export function MemberLookup({open}:{open:(id:string)=>void}) {
  const [id,setId]=useState('');
  return <form className="panel" onSubmit={event=>{event.preventDefault();open(id.trim());}}><label>فتح عضو بالمعرّف<input dir="ltr" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" placeholder="معرّف العضو من الإعدادات" value={id} onChange={event=>setId(event.target.value.trim())}/></label><button className="secondary">فتح الملف</button></form>;
}
