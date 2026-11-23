import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { call, client, friendly } from './client';
import {MemberSignals} from './LaunchAnalytics';
import {personalityQuestionsFor} from '../../src/compatibility/personality';
import './MemberOperations.css';

type Grant = { tier: string; start?: string; end: string };
type Ticket = { revision:number; response:string|null; id: string; subject: string; status: string; assignee: string | null; approved: string | null };
type Account = {
  fieldDates:{field:string;at:string;source:string}[]; filterResult:{at:string;mode:string;before:number;after:number}|null;
  questionPrompts:string[];personalityKeys:string[]; id: string; name: string | null; signup: string; lastSignIn: string | null; providers: string[] | null;
  emailVerified: boolean; phoneVerified: boolean; stage: string | null; paused: boolean|null; suspended: boolean|null;
  hasProfile: boolean; city: string|null; draft: { step: string; updated: string } | null; tier: string|null;
  grant: Grant|null; scheduled: Grant|null; expectedEnd: string|null; appleEnd: string|null; lastAppleCheck: string|null;
  connections: number;slotLimit:number;outgoing:number;pending:number; repeatReview: boolean; reports: number; sessions: number; lastConfirmation: string|null;
  portrait: {id:string;policy:string}|null; pushEnabled:boolean; push:{kind:string;at:string;outcome:string;attempts:number}[];
  audit:{action:string;actor:string;at:string}[];checks:{ticket:string;kind:string;ok:boolean}[];safetyHistory:{id:string;member:string;at:string;closed:boolean}[];privatePhotos:{id:string;grants:number}[];photoHistory:{kind:string;at:string;until:string}[];
  tickets: Ticket[]; history:{ticket:string;kind:string;note:string;at:string;actor:string}[];
};
const labels:Record<string,string> = {
  request_filters:'طلب تشخيص نتائج اكتشاف العضو',visibility:'إحصاء نتائج الاكتشاف',offer_export:'إتاحة نسخة البيانات للعضو',verification:'تأكيد ملكية الحساب',verify_identity:'التحقق لتصحيح بيان الهوية',verify_phone:'التحقق لتحديث الجوال',restart_luna:'إعادة فتح قسم لونا كاملًا',request_edit:'طلب إعادة تأكيد حقل من العضو',private_withdraw:'سحب أذونات صورة خاصة',member_confirm:'تأكيد العضو',member_confirmed:'أكّد العضو',export:'فتح العضو نسخته',shared:'مشاركة',extended:'تمديد',withdrawn:'سحب',open_case:'فتح طلب متابعة', assign:'إسناد الطلب', reply:'الرد على العضو', note:'ملاحظة داخلية', contact:'عرض وسيلة الاتصال الموثقة',
  recovery:'إرسال رابط استعادة كلمة المرور', recovery_address:'طلب رابط استعادة', grant:'منح أو تمديد عضوية',
  revoke_grant:'إلغاء منحة', apple_check:'إعادة التحقق من Apple', city:'تصحيح المدينة', resume:'إعادة فتح قسم التسجيل',
  pair_refresh:'تحديث المحادثة للطرفين',refresh:'تحديث الملف والتوافق', revoke_sessions:'تسجيل الخروج من كل الأجهزة', hide_photo:'سحب صورة الملف', retry_push:'إعادة محاولة الإشعارات المؤهلة',
  request_deletion:'طلب تأكيد الحذف من العضو', delete:'تنفيذ حذف الحساب', free:'المجانية', premium:'المميزة',seriousness:'وسام الجدية',
  draft:'مسودة',pending:'قيد المراجعة',approved:'معتمد',accepted:'مقبول',queued:'في الانتظار', failed:'تعذّر الإرسال',
  declined:'مرفوض',closed:'مغلق',cancelled:'ملغى',none:'لم يبدأ', proposed:'بانتظار الموافقة',family:'تواصل عائلي',
  expired:'انتهت الصلاحية',invalid:'عنوان غير صالح',revoked:'أُلغيت الصلاحية', identity:'الأساسيات',story:'حياتك',details:'تفاصيلك',
  avatar:'الصورة',criteria:'معايير الشريك',compatibility:'جلسة التوافق',personality:'الشخصية',preferences:'التفضيلات',readiness:'الجاهزية',review:'المراجعة',
  never:'دون كشف تلقائي',matched:'بعد القبول',serious:'بعد الاتفاق',request:'طلب تعارف',message:'رسالة',mutual:'قبول متبادل'
};
const label=(s:string|null|undefined)=>s?(labels[s]??s):'—';
const date=(s:string|null|undefined)=>s?new Date(s).toLocaleString('ar-SA-u-ca-gregory',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}):'—';
function inspect<T>(command:string,input:Record<string,unknown>){return call<T>('marriage_ops_inspect',{command,input});}
const steps=['identity','story','details','avatar','criteria','compatibility','personality','preferences','readiness','review'];
const idPattern='[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}';
const numberFormat = new Intl.NumberFormat('ar-SA');
function Facts({items}:{items:[string,string|number][]}){return <dl className="mo-facts">{items.map(([key,value])=><div key={key}><dt>{key}</dt><dd><bdi>{typeof value==='number'?numberFormat.format(value):value}</bdi></dd></div>)}</dl>}

export function MemberOperations({initialMemberId,demo=false}:{initialMemberId?:string|null;demo?:boolean}){
  const [query,setQuery]=useState(''),[selected,select]=useState(initialMemberId??''),[hits,setHits]=useState<{id:string;label:string;status:string}[]|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{select(initialMemberId??'');},[initialMemberId]);
  if(demo)return <section className="panel"><h2>متابعة الحسابات</h2><p className="muted">تتطلب إجراءات المتابعة اتصالًا ببيئة الأعضاء.</p></section>;
  return <div className="mo-stack mo-workspace"><section className="panel mo-search"><form className="mo-inline" onSubmit={async e=>{
    e.preventDefault();if(busy)return;setBusy(true);setError('');setHits(null);select('');
    try{const rows=await inspect<NonNullable<typeof hits>>('lookup',{query:query.trim()});setHits(rows);if(rows.length===1)select(rows[0].id);}
    catch(problem){setError(friendly(problem));}finally{setBusy(false);}
  }}><label>البحث عن حساب<span className="mo-query"><Search size={18} aria-hidden="true"/><input required minLength={2} maxLength={254} dir="auto" placeholder="الاسم أو المعرّف أو البريد أو الجوال" value={query} onChange={e=>setQuery(e.target.value)}/></span></label><button className="primary" disabled={busy}>بحث</button></form>
  {error&&<p className="notice error" role="alert">{error}</p>}{hits?.length===0&&<p role="status">لم يظهر حساب بهذه البيانات.</p>}
  {hits&&hits.length>1&&<div className="mo-results">{hits.map(hit=><button className="secondary" key={hit.id} onClick={()=>select(hit.id)}>{hit.label} · {label(hit.status)}<small dir="ltr">{hit.id}</small></button>)}</div>}</section>
  {selected&&<MemberWorkspace key={selected} id={selected} onDeleted={()=>{select('');setHits(null);setQuery('');}}/>}
  <StaffAccess/></div>;
}

function MemberWorkspace({id,onDeleted}:{id:string;onDeleted:()=>void}){
 const [account,setAccount]=useState<Account|null>(null),[revision,refresh]=useState(0),[ticket,setTicket]=useState(''),[command,setAction]=useState('note');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(''),[memo,setMemo]=useState(''),[subject,setSubject]=useState(''),[category,setCategory]=useState('help');
 const [tier,setTier]=useState('premium'),[days,setDays]=useState(7),[grantMode,setGrantMode]=useState('extend'),[source,setSource]=useState('current'),[value,setValue]=useState(''),[chapter,setChapter]=useState('identity'),[confirm,setConfirm]=useState(''),[code,setCode]=useState('');
 const [staffRows,setStaffRows]=useState<{id:string;name:string;role:string;active:boolean}[]>([]),[assignee,setAssignee]=useState(''),[replyStatus,setReplyStatus]=useState('in_review');
 const [contact,setContact]=useState<{email:string|null;phone:string|null}|null>(null),[diagnostic,setDiagnostic]=useState(''),[peer,setPeer]=useState('');
 const [diagBusy,setDiagBusy]=useState(false);const req=useRef<{key:string;id:string} | null>(null);
 useEffect(()=>{let live=true;setError('');inspect<Account>('member',{member:id}).then(next=>{if(live){setAccount(next);if(!next.tickets.some(t=>t.status!=='resolved'))setAction('open_case');setTicket(cur=>next.tickets.some(t=>t.id===cur&&t.status!=='resolved')?cur:(next.tickets.find(t=>t.status!=='resolved')?.id??''));}},e=>{if(live)setError(friendly(e));});return()=>{live=false;};},[id,revision]);
 function action(next:string){if(next==='assign')void inspect<typeof staffRows>('staff',{}).then(setStaffRows,e=>setError(friendly(e)));setAction(next);if(next==='request_edit')setChapter('details');if(next==='restart_luna')setChapter('compatibility');setContact(null);setResult('');setError('');setValue('');setConfirm('');setCode('');}
 async function diagnose(kind:'pair'|'visibility'){
  if(diagBusy)return;setDiagBusy(true);setDiagnostic('');
  try{
   if(kind==='visibility'){const r=await inspect<{available:number;eligible:number}>(kind,{member:id});setDiagnostic('الملفات المتاحة بحسب حدود الظهور: '+r.available+' · المؤهلة بحسب شروط الطرفين: '+r.eligible);}
   else {const r=await inspect<{status:string;agreement:string;firstSigned:string|null;secondSigned:string|null;canChat:boolean;occupiesSlot:boolean}|null>(kind,{member:id,peer});
    setDiagnostic(r?'الطلب: '+label(r.status)+' · اتفاق التواصل: '+label(r.agreement)+' · توقيع الطرف الأول: '+date(r.firstSigned)+' · الطرف الثاني: '+date(r.secondSigned)+' · التواصل: '+(r.canChat?'متاح':'غير متاح')+' · موضع ارتباط: '+(r.occupiesSlot?'مشغول':'حر'):'لا يوجد طلب تعارف بين هذين الحسابين.');}
  }catch(e){setDiagnostic(friendly(e));}finally{setDiagBusy(false);}
 }
 if(!account)return <section className="panel" role="status">{error||'جارٍ فتح الحساب…'} {error&&<button className="secondary" onClick={()=>refresh(n=>n+1)}>تحديث</button>}</section>;
 const a=account,selectedTicket=a.tickets.find(t=>t.id===ticket),chosenGrant=source==='scheduled'?a.scheduled:a.grant;
 const suggestions=chapter==='compatibility'?a.questionPrompts:chapter==='personality'?[...personalityQuestionsFor('personality-v1'),...personalityQuestionsFor('personality-v2')].filter(q=>a.personalityKeys.includes(q.id)).map(q=>q.prompt):[];
 const base=grantMode==='after'?Math.max(Date.now(),Date.parse(a.expectedEnd||'')||0):Math.max(Date.now(),Date.parse(a.grant?.end||'')||0);
 const finish=Number.isInteger(days)&&days>=1&&days<=365?new Date(base+days*86400000).toISOString():null;
 async function run(){
  if(busy)return;setBusy(true);setError('');setResult('');setContact(null);
  const payload={member:id,ticket:ticket||null,reason:memo.trim(),peer:peer.trim(),assignee,response:value.trim(),status:replyStatus,revision:selectedTicket?.revision,category,subject:subject.trim(),tier,days,mode:grantMode,source,end:chosenGrant?.end??null,expectedEnd:a.expectedEnd,value:value.trim(),before:command==='city'?a.city:a.draft?.updated,chapter,photo:command==='private_withdraw'?value:a.portrait?.id,field:command==='restart_luna'?(chapter==='personality'?'قسم الشخصية كاملًا':'قسم التوافق كاملًا'):value.trim(),confirm};
  const key=JSON.stringify([command,payload]);if(req.current?.key!==key)req.current={key,id:crypto.randomUUID()};
  const input={...payload,id:req.current.id};
  try{
   if(command==='delete'){
    if(!client)throw Error('تعذّر التحقق من جلسة الإدارة.');
    const factors=await client.auth.mfa.listFactors();const factor=factors.data?.totp.find(f=>f.status==='verified');
    if(!factor)throw Error('أعد تسجيل الدخول بخطوتين.');
    const checked=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code});if(checked.error)throw Error('تعذّر تأكيد رمز التحقق.');
   }
   if(command==='recovery'){
    const session=(await client?.auth.getSession())?.data.session;if(!session)throw Error('انتهت الجلسة.');
    const res=await fetch('/api/member-recovery',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(input)});
    if(!res.ok){const e=await res.json().catch(()=>null);throw Error(e?.error??'تعذّر طلب رابط الاستعادة.');}
    setResult('قُبل طلب إرسال رابط الاستعادة إلى البريد الموثق.');
   }else{
    const receipt=await call<{ticket?:string;email?:string;phone?:string;queued?:number|boolean;step?:string;ends?:string;tier?:string;deleted?:boolean}>('marriage_ops_action',{command:command==='restart_luna'?'request_edit':command,input});
    if(receipt.ticket)setTicket(receipt.ticket);
    if(command==='contact')setContact({email:receipt.email??null,phone:receipt.phone??null});
    if(receipt.deleted){onDeleted();return;}
    setResult(receipt.ends?'تنتهي المنحة في '+date(receipt.ends):command==='apple_check'?'أُضيفت المعاملة إلى فحص Apple. تحقق من النتيجة بعد المعالجة.':command==='retry_push'?'عدد محاولات الإرسال المعادة: '+receipt.queued:receipt.step?'تبدأ المسودة من '+label(receipt.step):'حُفظ الإجراء. تُعرض حالة الحساب بعد التحديث.');
   }
   req.current=null;setMemo('');setConfirm('');setCode('');refresh(n=>n+1);
  }catch(problem){setError(friendly(problem));}finally{setBusy(false);}
 }
 const available=['open_case','assign','note','reply','contact',...(a.providers?.includes('email')&&a.emailVerified?['recovery']:[]),
  ...(a.stage?['offer_export','request_edit','restart_luna','verify_identity','verify_phone','grant',...(a.grant||a.scheduled?['revoke_grant']:[]),'apple_check']:[]),...(a.hasProfile?['city','refresh','pair_refresh','request_filters']:[]),
  ...(a.draft?['resume']:[]),'revoke_sessions',...(a.portrait?['hide_photo']:[]),...(a.privatePhotos.some(p=>p.grants>0)?['private_withdraw']:[]),'retry_push','request_deletion',...(selectedTicket?.approved?['delete']:[])];
 return <><section className="panel mo-account"><header className="mo-heading"><div><h2>{a.name||'تسجيل غير مكتمل'}</h2><small dir="ltr">{id}</small></div><button className="secondary" disabled={busy} onClick={()=>refresh(n=>n+1)}>تحديث الحالة</button></header>
 <div className="mo-overview"><Facts items={[
  ['حالة الحساب',a.suspended?'معلّق':label(a.stage)],
  ['العضوية',label(a.tier)],
  ['الظهور',a.hasProfile&&a.stage==='approved'&&!a.paused&&!a.suspended?'متاح بحسب الأهلية':'غير متاح'],
  ['البلاغات المفتوحة',a.reports],
 ]}/></div>
 <details className="mo-fact-group"><summary>الحساب والتسجيل</summary><Facts items={[
  ['الدخول',(a.providers??[]).join(' · ')||'—'],['تأكيد الجوال',a.phoneVerified?'مؤكد':'غير مكتمل'],
  ['إنشاء الحساب',date(a.signup)],['آخر دخول',date(a.lastSignIn)],['مسودة التسجيل',label(a.draft?.step)],
  ['أحدث تأكيد إجابة',date(a.lastConfirmation)],['الجلسات المفتوحة',a.sessions],['مراجعة تكرار التسجيل',a.repeatReview?'تحتاج مراجعة':'لا يوجد مؤشر'],
 ]}/></details>
 <details className="mo-fact-group"><summary>العضوية والارتباطات</summary><Facts items={[
  ['الوصول من Apple حتى',date(a.appleEnd)],['آخر فحص Apple',date(a.lastAppleCheck)],
  ['المنحة الحالية حتى',date(a.grant?.end)],['المنحة المجدولة حتى',date(a.scheduled?.end)],
  ['الارتباطات المستخدمة',a.connections+' / '+a.slotLimit],['طلبات صادرة معلّقة',a.pending],['الصادرة المعلّقة والمقبولة',a.outgoing],
 ]}/></details>
 <details><summary>تشخيص الظهور والتواصل والإشعارات</summary><div className="mo-stack"><div className="mo-inline"><button className="secondary" disabled={diagBusy} onClick={()=>void diagnose('visibility')}>فحص الملفات المتاحة</button></div>
 <form className="mo-inline" onSubmit={e=>{e.preventDefault();void diagnose('pair');}}><label>معرّف الطرف الآخر<input dir="ltr" required pattern={idPattern} value={peer} onChange={e=>setPeer(e.target.value)}/></label><button className="secondary" disabled={diagBusy}>فحص الارتباط</button></form>{diagnostic&&<p role="status">{diagnostic}</p>}
 {a.filterResult&&<p>آخر فحص شاركه العضو · {date(a.filterResult.at)} · {a.filterResult.mode==='all'?'الدليل':'الترشيحات'} · قبل تطبيق خيارات البحث {a.filterResult.before} · بعدها {a.filterResult.after}</p>}
 {a.fieldDates.length>0&&<details><summary>آخر تأكيد لكل حقل</summary>{a.fieldDates.map(f=><p key={f.field}><bdi>{f.field}</bdi> · {f.source==='manual'?'إدخال يدوي':'اقتراح لونا أكّده العضو'} · {date(f.at)}</p>)}</details>}<small>إشعارات الحساب {a.pushEnabled?'مفعّلة':'متوقفة'}</small>{a.push.map((p,i)=><div key={i}>{label(p.kind)} · {p.outcome==='accepted'?'قبله مزوّد الإرسال':label(p.outcome)} · {date(p.at)}</div>)}{a.photoHistory.map((h,i)=><small key={i}>{label(h.kind)} · {date(h.at)} · حتى {date(h.until)}</small>)}{a.safetyHistory.length>0&&<details><summary>بلاغات الحساب ومؤشرات التسجيل المرتبطة</summary>{a.safetyHistory.map(h=><p key={h.id}>{h.member===id?'الحساب الحالي':'حساب موقوف يرتبط بمؤشّر سابق'} · {h.closed?'مغلق':'مفتوح'} · {date(h.at)} <bdi>{h.id}</bdi></p>)}</details>}<small>إظهار الصورة الواضحة · {label(a.portrait?.policy)}</small></div></details></section>
 <MemberSignals memberId={id}/><section className="panel mo-actions"><h2>إجراءات المتابعة</h2><form className="mo-stack" onSubmit={e=>{e.preventDefault();void run();}}>
 <label>طلب العضو<select value={ticket} disabled={busy} onChange={e=>{setTicket(e.target.value);action('note');}}><option value="">فتح طلب جديد</option>{a.tickets.filter(t=>t.status!=='resolved').map(t=><option key={t.id} value={t.id}>{t.subject}{t.assignee?' · '+t.assignee:''}</option>)}</select></label>
 <label>الإجراء<select value={command} disabled={busy} onChange={e=>action(e.target.value)}>{available.map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
 {command==='open_case'&&<><label>عنوان يراه العضو<input required minLength={3} maxLength={140} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>نوع الطلب<select value={category} onChange={e=>setCategory(e.target.value)}><option value="help">مساعدة أو خصوصية</option><option value="access">دخول</option><option value="billing">عضوية وفواتير</option><option value="safety">سلامة</option></select></label></>}
 {command==='assign'&&<label>المسؤول<select value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">استلام الطلب بنفسي</option>{staffRows.filter(s=>s.active&&s.role!=='reviewer').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
 {command==='reply'&&<><label>الرد الذي يراه العضو<textarea required minLength={3} maxLength={3000} value={value} onChange={e=>setValue(e.target.value)}/></label><label>حالة الطلب<select value={replyStatus} onChange={e=>setReplyStatus(e.target.value)}><option value="in_review">متابعة مفتوحة</option><option value="resolved">إغلاق بعد التحقق</option></select></label></>}
 {command==='grant'&&<><div className="mo-inline"><label>الفئة<select value={tier} onChange={e=>setTier(e.target.value)}><option value="premium">المميزة</option><option value="seriousness">وسام الجدية</option></select></label><label>الأيام<input type="number" min={1} max={365} value={days} onChange={e=>setDays(Number(e.target.value))} required/></label></div><label>توقيت الوصول<select value={grantMode} onChange={e=>setGrantMode(e.target.value)}><option value="extend">البدء الآن أو تمديد المنحة الحالية</option><option value="after">بعد نهاية الاستحقاق أو المنحة المجدولة</option></select></label><p className="quiet-box">النهاية بعد التنفيذ · {date(finish)}</p></>}
 {command==='revoke_grant'&&<label>المنحة<select value={source} onChange={e=>setSource(e.target.value)}><option value="current">الحالية</option><option value="scheduled">المجدولة</option></select></label>}
 {command==='city'&&<label>المدينة الحالية: {a.city} · المدينة الجديدة<input value={value} onChange={e=>setValue(e.target.value)} required/></label>}
 {command==='pair_refresh'&&<label>معرّف الطرف الآخر<input value={peer} pattern={idPattern} dir="ltr" required onChange={e=>setPeer(e.target.value)}/><small>تستخدم المحادثة طلب التعارف نفسه. يُعاد فحص الاتفاق وتحديث الجهازين دون تعديل اختياراتهما.</small></label>}
 {(command==='request_edit'||command==='verify_identity')&&<label>اسم الحقل كما يظهر للعضو<input maxLength={120} minLength={2} required list="mo-question-prompts" value={value} onChange={e=>setValue(e.target.value)}/><datalist id="mo-question-prompts">{[...new Set(suggestions)].map(q=><option key={q} value={q}/>)}</datalist></label>}
 {command==='restart_luna'&&<label>القسم الذي سيعيد العضو مراجعته<select value={chapter} onChange={e=>setChapter(e.target.value)}><option value="compatibility">التوافق</option><option value="personality">الشخصية</option></select><small>يفتح العضو القسم من أوله ويعيد تأكيد اختياراته. تبقى إجاباته الحالية محفوظة إلى حين تعديلها.</small></label>}
 {command==='private_withdraw'&&<label>الصورة الخاصة<select required value={value} onChange={e=>setValue(e.target.value)}><option value="">اختر الصورة</option>{a.privatePhotos.filter(p=>p.grants>0).map(p=><option key={p.id} value={p.id}>{p.id.slice(0,8)} · {p.grants} أذونات سارية</option>)}</select></label>}
 {(command==='resume'||command==='request_edit')&&<label>القسم عند استئناف المسودة<select value={chapter} onChange={e=>setChapter(e.target.value)}>{steps.filter(s=>command!=='request_edit'||s!=='identity').map(s=><option key={s} value={s}>{label(s)}</option>)}</select><small>تُحفظ جميع الإجابات المدخلة.</small></label>}
 {command==='delete'&&<><p className="notice error">سيُحذف الحساب نهائيًا وتنتهي ارتباطاته. عدد الارتباطات الحالية {a.connections}. ينتهي الوصول المسجل من Apple في {date(a.appleEnd)}.</p><label>أعد كتابة معرّف الحساب<input dir="ltr" value={confirm} onChange={e=>setConfirm(e.target.value)} pattern={id} required/></label><label>رمز تطبيق التحقق<input dir="ltr" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={e=>setCode(e.target.value)} required/></label></>}
 <label>سبب الإجراء · داخلي<textarea value={memo} minLength={3} maxLength={500} required rows={2} onChange={e=>setMemo(e.target.value)}/></label>
 <button className="primary" disabled={busy||!available.includes(command)||(!ticket&&command!=='open_case')||memo.trim().length<3}>{busy?'جارٍ التنفيذ…':label(command)}</button></form>
 {contact&&<Facts items={[['البريد الموثق',contact.email??'—'],['الجوال الموثق',contact.phone??'—']]}/>}
 {result&&<p className="notice" role="status">{result}</p>}{error&&<p className="notice error" role="alert">{error}</p>}</section>
 <section className="panel"><h2>التحقق من أثر المعالجة</h2>{a.checks.length?a.checks.map((c,i)=><p key={i}>{label(c.kind)} · {c.ok?'تحقّق الأثر':'بانتظار التحقق'}</p>):<p className="muted">لا توجد معالجة بانتظار التحقق.</p>}</section><section className="panel"><h2>سجل المتابعة</h2><details><summary>عمليات الاطلاع والتعديل السابقة</summary>{a.audit.map((row,i)=><p key={i}>{label(row.action.replace(/^ops_/,''))} · {row.actor} · {date(row.at)}</p>)}</details>{a.history.length===0?<p>لا توجد ملاحظات على الحساب.</p>:a.history.map((h,i)=><article className="mo-note" key={i}><b>{label(h.kind)}</b><span>{h.actor} · {date(h.at)}</span><p>{h.note}</p></article>)}</section></>;
}

function StaffAccess(){
 const [rows,setRows]=useState<{id:string;name:string;role:string;active:boolean}[]>([]),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 async function load(){setRows(await inspect<typeof rows>('staff',{}));}
 return <details className="panel mo-access"><summary>صلاحيات فريق الإدارة</summary><button className="secondary" disabled={busy} onClick={()=>void load().catch(e=>setMsg(friendly(e)))}>عرض الفريق</button>{rows.length>0&&<label>سبب سحب الصلاحية<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>}
 {rows.map(r=><div className="mo-note" key={r.id}><b>{r.name}</b><span>{r.active?'مفعّل':'متوقف'}</span>{r.active&&r.role!=='owner'&&<button className="secondary" disabled={busy||reason.trim().length<3} onClick={async()=>{setBusy(true);try{await call('marriage_ops_action',{command:'revoke_staff',input:{member:r.id,reason:reason.trim(),id:crypto.randomUUID()}});await load();setReason('');}catch(e){setMsg(friendly(e));}finally{setBusy(false);}}}>سحب صلاحية {r.name}</button>}</div>)}{msg&&<p role="status">{msg}</p>}</details>;
}
