import { useEffect, useRef, useState, type FormEvent } from 'react';
import { call, friendly } from './client';
import { RegistrationPhaseAdmin } from './RegistrationPhaseAdmin';
import { MembershipPromotions } from './MembershipPromotions';
import { ReleasePolicyAdmin } from './ReleasePolicyAdmin';
import './launch-admin.css';

const placements={news:'جديد وُدَين',inbox:'صندوق الإشعارات',banner:'تنويه داخل الشاشة',setting:'تحديث محتوى أو ميزة'};
const screens={all:'كل الشاشات',welcome:'الترحيب',register:'التسجيل والتحقق',application:'إكمال الملف',discover:'الاستكشاف',settings:'الإعدادات',membership:'العضوية',inbox:'الإشعارات'};
const destinations={discover:'الاستكشاف',membership:'العضوية',inbox:'الإشعارات',settings:'الإعدادات',application:'إكمال التسجيل'};
const settings:Record<string,string>={'help.intro':'مقدمة دليل وُدَين','luna.example':'مثال لونا للخطوة التالية','pause.luna':'إيقاف بحث لونا مؤقتًا','pause.offer':'إيقاف عرض التجربة مؤقتًا'};
for(let i=0;i<13;i++)for(let factor=0;factor<2;factor++)settings['welcome.'+i+'.'+factor]='سيناريو الترحيب '+(i+1)+' · العبارة '+(factor+1);
const genders={man:'رجال',woman:'نساء'},stages={draft:'قيد التسجيل',pending:'قيد المراجعة',approved:'معتمد'},tiers={free:'مجانية',premium:'المميزة',seriousness:'وسام الجدية'};
type Audience={member?:string;gender?:string;stage?:string;tier?:string;platform?:string;staff?:boolean;percent?:number;build?:number;maxBuild?:number};
type Item={id:string;placement:keyof typeof placements;screen:keyof typeof screens;title:string;body:string;destination:string|null;starts_at:string;ends_at:string;withdrawn_at:string|null;send_push:boolean;setting_key:string|null;audience:Audience;opened:number;queued:number;accepted:number;failed:number};
type Preview={reachable:number;devices:number};
function options(values:Record<string,string>){return Object.entries(values).map(([id,name])=><option key={id} value={id}>{name}</option>);}
function localTime(value:number){return new Date(value+3*3600000).toISOString().slice(0,16);}
const displayTime=(date:string)=>new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(date));
const count=new Intl.NumberFormat('ar-SA');
function publicationStatus(row:Item){
 if(row.withdrawn_at)return 'مسحوب';
 if(Date.parse(row.ends_at)<=Date.now())return 'منتهي';
 return Date.parse(row.starts_at)>Date.now()?'مجدول':'منشور';
}
const publish=(action:string,payload:object={})=>call('wudayn_publish',{action,payload});

export function PublicationAdmin({staffId}:{staffId:string}){
 const [rows,setRows]=useState<Item[]>([]),[placement,setPlacement]=useState<keyof typeof placements>('news'),[screen,setScreen]=useState('all');
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[dest,setDest]=useState(''),[setting,setSetting]=useState('help.intro');
 const [audience,setAudience]=useState<Audience>({}),[testId,setTestId]=useState(staffId),[push,setPush]=useState(false);
 const [start,setStart]=useState(''),[end,setEnd]=useState(()=>localTime(Date.now()+7*86400000)),[preview,setPreview]=useState<Preview|null>(null);
 const [editId,setEditId]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [versions,setVersions]=useState<{id:string;items:{id:number;title:string;body:string;saved_at:string}[]}|null>(null);
 const previewKey=useRef('');
 const [devices,setDevices]=useState<{id:string;platform:string;last:string}[]|null>(null),[testDevice,setTestDevice]=useState('');
 const sending=useRef(false),attempt=useRef(crypto.randomUUID()),form=useRef<HTMLFormElement>(null);
 const config=placement==='setting',pause=config&&setting.startsWith('pause.');
 const args={id:attempt.current,placement,screen:config?'all':screen,title:title.trim(),body:body.trim(),destination:config?null:dest||null,key:config?setting:null,
  audience:pause?{}:audience,push:!config&&push,starts:start?new Date(start+':00+03:00').toISOString():null,ends:end?new Date(end+':00+03:00').toISOString():null};

 useEffect(()=>{setPreview(null);attempt.current=crypto.randomUUID();},[placement,screen,title,body,dest,setting,audience,push,start,end,editId]);
 const signature=JSON.stringify({...args,id:editId});
 async function refresh(){setRows(await call<Item[]>('wudayn_publish',{action:'list'}));}
 useEffect(()=>{void refresh().catch(e=>setError(friendly(e)));},[]);
 async function run(fn:()=>Promise<void>){if(sending.current)return;sending.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(friendly(e));}finally{sending.current=false;setBusy(false);}}
 function filter(k:keyof Audience,v:string){setAudience(prev=>{const next={...prev};delete next[k];if(v)Object.assign(next,{[k]:k==='percent'||k==='build'||k==='maxBuild'?Number(v):k==='staff'?true:v});return next;});}
 function submit(e:FormEvent){e.preventDefault();void run(async()=>{
  if(!preview||previewKey.current!==signature){previewKey.current=signature;setPreview(await call<Preview>('wudayn_publish',{action:'preview',payload:args}));return;}
  await publish(editId?'correct':'publish',{...args,id:editId??attempt.current});
  setNotice(editId?'حُفظ التصحيح داخل التطبيق.':'حُفظ النشر بالموعد المحدد.');setEditId(null);setTitle('');setBody('');setPreview(null);attempt.current=crypto.randomUUID();await refresh();
 });}
 function correct(row:Item){setEditId(row.id);setPlacement(row.placement);setTitle(row.title);setBody(row.body);setSetting(row.setting_key??'help.intro');setScreen(row.screen);setDest(row.destination??'');setAudience(row.audience);
  setStart(localTime(Date.parse(row.starts_at)));setEnd(localTime(Date.parse(row.ends_at)));setPush(row.send_push);form.current?.scrollIntoView({block:'start'});}
 return <div className="wd-admin-sections wd-publishing" dir="rtl"><RegistrationPhaseAdmin/><ReleasePolicyAdmin/><MembershipPromotions/><form className="panel wd-admin-form wd-compose" ref={form} onSubmit={submit}>
 <section className="wd-compose-main"><h2>{editId?'تصحيح المنشور':'إنشاء منشور'}</h2>
 <div className="wd-admin-grid"><label>موضع النشر<select value={placement} disabled={!!editId} onChange={e=>{setPlacement(e.target.value as keyof typeof placements);setBody('');}}>{options(placements)}</select></label>
 {config?<label>المحتوى أو الميزة<select disabled={!!editId} value={setting} onChange={e=>{setSetting(e.target.value);setBody(e.target.value.startsWith('pause.')?'on':'');}}>{options(settings)}</select></label>:placement==='banner'?<label>الشاشة<select disabled={!!editId} value={screen} onChange={e=>setScreen(e.target.value)}>{options(screens)}</select></label>:null}</div>
 <div className="wd-compose-writing"><label>العنوان<input required dir="auto" maxLength={90} value={title} onChange={e=>setTitle(e.target.value)}/></label>
 {pause?<label>حالة الميزة<select value={body} onChange={e=>setBody(e.target.value)}><option value="on">إيقاف مؤقت</option><option value="off">استئناف الخدمة</option></select></label>:<label>النص<textarea rows={3} dir="auto" required maxLength={700} value={body} onChange={e=>setBody(e.target.value)}/></label>}</div>
 {!config&&<label>الانتقال عند الضغط<select value={dest} onChange={e=>setDest(e.target.value)}><option value="">قراءة الإعلان</option>{options(destinations)}</select></label>}
 {!editId&&<><fieldset className="wd-schedule"><legend>موعد النشر <span>بتوقيت الرياض</span></legend><div className="wd-admin-grid"><label>البداية<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/><small>اتركه فارغًا للنشر الآن.</small></label>
 <label>النهاية<input required type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label></div></fieldset>
 {!pause&&<details><summary>تحديد الجمهور</summary><div className="wd-admin-grid">
 {([['gender','الجنس',genders],['stage','مرحلة التسجيل',stages],['tier','العضوية',tiers],['platform','المنصة',{ios:'iPhone',web:'الويب'}]] as const).map(([k,label,values])=><label key={k}>{label}<select value={audience[k]??''} onChange={e=>filter(k,e.target.value)}><option value="">الكل</option>{options(values)}</select></label>)}
 <label>عضو محدد<input dir="ltr" placeholder="معرّف العضو" value={audience.member??''} onChange={e=>filter('member',e.target.value.trim())}/></label>
 <label>نسبة الإتاحة (%)<input type="number" min="1" max="100" value={audience.percent??''} onChange={e=>filter('percent',e.target.value)}/></label>
 <label>أدنى إصدار بناء<input type="number" min="1" max="999999" value={audience.build??''} onChange={e=>filter('build',e.target.value)}/></label>
 <label>أعلى إصدار بناء<input type="number" min={audience.build??1} max="999999" value={audience.maxBuild??''} onChange={e=>filter('maxBuild',e.target.value)}/></label>
 <label><input type="checkbox" checked={!!audience.staff} onChange={e=>filter('staff',e.target.checked?'true':'')}/> الفريق فقط</label></div></details>}
 {!config&&<label><input type="checkbox" checked={push} onChange={e=>setPush(e.target.checked)}/> إرسال إشعار للجمهور المشترك في أخبار وُدَين</label>}</>}
 {push&&!config&&!editId&&<details><summary>إرسال تجريبي لجهازي</summary><p>يظهر «إشعار جديد» على شاشة القفل. نص الإعلان يظهر داخل وُدَين.</p><label>معرّف حساب الاختبار<input dir="ltr" value={testId} onChange={e=>{setTestId(e.target.value);setDevices(null);setTestDevice('');}}/></label>
 <button type="button" className="secondary" disabled={busy} onClick={()=>void run(async()=>{const rows=await call<NonNullable<typeof devices>>('wudayn_publish',{action:'test_devices',payload:{...args,testMember:testId}});setDevices(rows);setTestDevice(rows[0]?.id??'');})}>عرض أجهزة الاختبار</button>{devices&&<label>جهاز الاختبار<select value={testDevice} onChange={e=>setTestDevice(e.target.value)}>{!devices.length&&<option value="">لا يوجد جهاز مشترك</option>}{devices.map(d=><option key={d.id} value={d.id}>{d.platform==='web'?'ويب':'iPhone'} · {displayTime(d.last)} · {d.id.slice(-4)}</option>)}</select></label>}
 <button className="secondary" type="button" disabled={busy||!testDevice} onClick={()=>{if(form.current?.reportValidity())void run(async()=>{const result=await call<{devices:number}>('wudayn_publish',{action:'test',payload:{...args,id:crypto.randomUUID(),testMember:testId,testInstallation:testDevice}});setNotice('أجهزة الاختبار في طابور الإرسال: '+result.devices);await refresh();});}}>إرسال اختبار</button></details>}
 </section><aside className="wd-compose-side" aria-label="معاينة المنشور">
 <section className="wd-proof" data-empty={!title&&!body||undefined}>
 <header><span>{config?'معاينة التحديث':'معاينة العضو'}</span><span>{config?'إعدادات التطبيق':placements[placement]}</span></header>
 {title||body?<>{title&&<h3 dir="auto">{title}</h3>}{body&&<p dir="auto">{pause?(body==='on'?'إيقاف مؤقت':'استئناف الخدمة'):body}</p>}
 {dest&&!config&&<span className="wd-proof-link">فتح {destinations[dest as keyof typeof destinations]} <span aria-hidden="true">←</span></span>}</>:<p className="wd-proof-empty">ستظهر المعاينة هنا عند كتابة المنشور.</p>}
 </section>
 {preview&&push&&!config&&<p className="wd-reach" role="status">الجمهور المتاح الآن: {count.format(preview.reachable)} عضو · {count.format(preview.devices)} جهاز</p>}
 <div className="wd-admin-actions"><button className="primary" disabled={busy}>{busy?'جارٍ التنفيذ…':preview?(editId?'تأكيد التصحيح':'تأكيد النشر'):'معاينة قبل النشر'}</button>{editId&&<button className="secondary" type="button" onClick={()=>{setEditId(null);setTitle('');setBody('');}}>إلغاء التصحيح</button>}</div></aside></form>
 {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
 <section className="panel wd-publishing-log"><h2>سجل النشر</h2>{!rows.length&&<p className="wd-quiet">لا توجد منشورات بعد.</p>}{rows.map(row=><article className="wd-admin-record" key={row.id}><div><div className="wd-record-title"><strong dir="auto">{row.title}</strong><span className="wd-record-state" data-live={publicationStatus(row)==='منشور'||undefined}>{publicationStatus(row)}</span></div><p>{placements[row.placement]} · <time dateTime={row.starts_at}>{displayTime(row.starts_at)}</time></p>
 {row.send_push&&<small>في الطابور {row.queued} · قبلته خدمة الإرسال {row.accepted} · تعذّر {row.failed} · فتح المنشور {row.opened}</small>}</div>
 {!row.withdrawn_at&&<div className="wd-admin-actions"><button className="secondary" onClick={()=>correct(row)}>تصحيح</button><button className="text-button" disabled={busy} onClick={()=>void run(async()=>{setVersions({id:row.id,items:await call('wudayn_publish',{action:'history',payload:{id:row.id}})});})}>النسخ السابقة</button><button className="text-button" disabled={busy} onClick={()=>void run(async()=>{await publish('withdraw',{id:row.id});setNotice('سُحب المنشور داخل التطبيق.');await refresh();})}>سحب</button></div>}{versions?.id===row.id&&<div className="wd-admin-versions">{versions.items.length===0?<small>لا توجد تعديلات سابقة.</small>:versions.items.map(v=><div key={v.id}><strong>{v.title}</strong><p>{v.body}</p><small>{displayTime(v.saved_at)}</small> <button className="secondary" disabled={busy} onClick={()=>void run(async()=>{await publish('rollback',{id:row.id,version:v.id});setVersions(null);await refresh();setNotice('استُعيدت النسخة المحددة.');})}>استعادة النسخة</button></div>)}</div>}</article>)}</section></div>;
}
