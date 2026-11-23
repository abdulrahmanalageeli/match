import { useEffect, useRef, useState } from 'react';
import { call, friendly } from './client';

type Phase = {locked:boolean; announced:boolean; revision:number; subscribers:number; exceptions:{id:string;name:string}[]};
type Command = 'lock'|'open'|'launch'|'exclude'|'include';
const labels: Record<Command,string> = {lock:'فتح التسجيل المبكر',open:'فتح الاكتشاف دون إشعار',launch:'إطلاق وُدَين وإرسال التنبيه',exclude:'السماح بالدخول المبكر',include:'إلغاء الدخول المبكر'};
type Candidate = {id:string;label:string};

function PhaseEditor() {
  const [state,setState] = useState<Phase|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [query,setQuery] = useState('');
  const [hits,setHits] = useState<Candidate[]|null>(null);
  const [confirm,setConfirm] = useState<Command|null>(null);
  const [reload,setReload] = useState(0);
  const pending = useRef(false);
  useEffect(()=>{
    let active = true;
    setError('');
    void call<Phase>('wudayn_registration_phase',{}).then(result=>{if(active)setState(result);})
      .catch(e=>{if(active)setError(friendly(e));});
    return ()=>{active=false;};
  },[reload]);
  async function run(operation:()=>Promise<void>) {
    if(pending.current)return;
    pending.current=true; setBusy(true); setError('');
    try { await operation(); } catch(e){setError(friendly(e));} finally {pending.current=false;setBusy(false);}
  }
  function update(action:Command,member?:string) {
    if(!state)return;
    void run(async()=>{
      const next=await call<Phase>('wudayn_registration_phase',{action,expected_revision:state.revision,member:member??null});
      setState(next);setConfirm(null);setHits(null);setQuery('');
    });
  }
  return <div className="wd-release-editor">
    {state ? <>
      <h3>{state.locked ? 'التسجيل مفتوح · الاكتشاف مغلق' : 'الاكتشاف مفتوح'}</h3>
      <p className="wd-quiet">عند تفعيل التسجيل المبكر، يكتمل التسجيل وتبقى الإعدادات والدعم متاحين.</p>
      {confirm ? <div className="wd-release-review"><p>{confirm==='launch' ? 'سيُفتح الاكتشاف ويُرسل تنبيه لمرة واحدة إلى المشتركين ('+state.subscribers.toLocaleString('ar-SA')+').' : confirm==='lock' ? 'سيتوقف الاكتشاف والتواصل للأعضاء باستثناء قائمة الدخول المبكر.' : 'سيُفتح الاكتشاف للأعضاء وتبقى تنبيهات الإطلاق محفوظة.'}</p>
        <div className="wd-admin-actions"><button className="primary" disabled={busy} onClick={()=>update(confirm)}>تأكيد</button><button className="secondary" disabled={busy} onClick={()=>setConfirm(null)}>تراجع</button></div>
      </div> : <div className="wd-admin-actions">
        <button className="secondary" onClick={()=>setConfirm(state.locked?'open':'lock')}>{labels[state.locked?'open':'lock']}</button>
        {!state.announced && <button className="primary" onClick={()=>setConfirm('launch')}>{labels.launch}</button>}
      </div>}
      <h3>الدخول المبكر</h3>
      <form className="wd-conduct-form" onSubmit={event=>{event.preventDefault();void run(async()=>setHits(await call<Candidate[]>('marriage_ops_inspect',{command:'lookup',input:{query:query.trim()}})));}}>
        <label>اسم عضو أو جوال أو معرّف<input required minLength={2} value={query} onChange={e=>{setQuery(e.target.value);setHits(null);}}/></label>
        <button disabled={busy} className="secondary">بحث عن عضو</button>
      </form>
      {hits?.length===0 && <p role="status">لم نعثر على عضو بهذه البيانات.</p>}
      {hits?.filter(hit=>!state.exceptions.some(item=>item.id===hit.id)).map(hit=><div className="wd-admin-actions" key={hit.id}><span>{hit.label} · <bdi>{hit.id.slice(-8)}</bdi></span>
        <button className="secondary" disabled={busy} onClick={()=>update('exclude',hit.id)}>{labels.exclude}</button></div>)}
      {state.exceptions.map(item=><div className="wd-admin-actions" key={item.id}><span>{item.name} · <bdi>{item.id.slice(-8)}</bdi></span>
        <button className="text-button" disabled={busy} onClick={()=>update('include',item.id)}>{labels.include}</button></div>)}
    </> : !error && <p role="status">جارٍ التحميل…</p>}
    {error && <p className="notice error" role="alert">{error} <button type="button" className="text-button" onClick={()=>{setConfirm(null);setReload(n=>n+1);}}>إعادة تحميل الإعدادات</button></p>}
  </div>;
}
export function RegistrationPhaseAdmin() {
 const [open,setOpen]=useState(false);
 return <details className="panel wd-release" onToggle={e=>setOpen(e.currentTarget.open)}><summary>التسجيل المبكر والإطلاق</summary>{open&&<PhaseEditor/>}</details>;
}
