import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { call, friendly } from './client';
import './LaunchAnalytics.css';

type Gender = 'total' | 'man' | 'woman' | 'unknown';
type Counts = Partial<Record<Gender,number>>;
type Queue = 'applications'|'operations'|'reports';
type Summary = {calibration:{minimum:number|null;regular:number|null};incidents:{step:string;platform:string;build:string;affected:number;first_at:string;last_at:string;last_success:string|null}[];metrics:Record<string,Counts>;waits:Record<string,Counts>;family:number;started:string;campaign:Record<string,boolean>;issues:{key:string;n:number;oldest:string|null;dest:Queue}[]};
type DirectoryRow = {memberId:string;name:string|null;stage:string;step:string|null;lastCompleted:string|null;gender:string;visibility:string;tier:string;stamp:string;blockers:string[]|null;hasProfile:boolean};
type Props = {onMember:(id:string)=>void;onQueue:(page:Queue)=>void;demo?:boolean};
const nf = new Intl.NumberFormat('ar-SA',{maximumFractionDigits:1});
const time = (s:string)=>new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(s));
const elapsed = (stamp:string)=>{const mins=Math.max(0,Math.floor((Date.now()-new Date(stamp).getTime())/60000));return new Intl.RelativeTimeFormat('ar-SA',{numeric:'auto'}).format(mins<60?-mins:-Math.floor(mins/60),mins<60?'minute':'hour');};
const genders:Gender[]=['total','man','woman','unknown'];
const labels:Record<string,string>={total:'الكل',man:'رجال',woman:'نساء',unknown:'غير محدد',created:'حساب جديد',phone_pending:'بانتظار توثيق الجوال',onboarding:'يُكمل التسجيل',pending:'قيد المراجعة',approved:'معتمد',identity:'الهوية والأهلية',compatibility:'جلسة لونا',details:'التفاصيل الشخصية',criteria:'معايير الشريك',preferences:'تفضيلات التعارف',story:'كتابة الملف',avatar:'الصورة والخصوصية',readiness:'الجاهزية',review:'المراجعة والإرسال',free:'مجانية',premium:'مميزة',seriousness:'وسام الجدية',visible:'ظاهر',paused:'الظهور متوقف',suspended:'معلّق',unpublished:'لم يُنشر',sms:'إخفاقات مزوّد الرسائل اليوم',eligibility:'التحقق من الأهلية',personality:'أسئلة الشخصية',beena:'بيننا',render_error:'عرض الشاشة',unhandled_error:'استجابة التطبيق',unhandled_rejection:'طلب لم يكتمل',luna:'تعثر في جلسة لونا اليوم',submission:'تعثر في المراجعة أو الإرسال اليوم',reviews:'طلبات مراجعة تجاوزت ٢٤ ساعة',safety:'بلاغات سلامة مفتوحة',purchase:'شراء ساري يحتاج مطابقة الوصول',repeat_registration:'مراجعة تسجيل متكرر',phone_unverified:'توثيق الجوال',photo_review:'مراجعة الصورة',eligibility_unconfirmed:'التحقق من الأهلية',readiness_unconfirmed:'تأكيد الجاهزية',assessment_unconfirmed:'تأكيد التقييم',consent_unconfirmed:'تأكيد الموافقات',open_safety_report:'بلاغ سلامة',application_changed:'تغيّر الطلب'};
const steps=['identity','eligibility','compatibility','personality','beena','details','criteria','preferences','story','avatar','readiness','review'];
type Row=[string,string,string?];
const groups:Record<string,Row[]> = {
 overview:[['joined','حسابات جديدة'],['phone_verified','وثّقوا الجوال'],['submitted','أرسلوا الطلب'],['approved','اعتمدت عضويتهم'],['stage_created','حسابات جديدة لم تبدأ التسجيل حاليًا'],['stage_phone_pending','بانتظار توثيق الجوال حاليًا'],['stage_onboarding','يُكملون التسجيل حاليًا'],['stage_pending','بانتظار المراجعة حاليًا'],['stage_approved','معتمدون حاليًا']],
 activity:[['dau','نشطون في آخر يوم'],['wau','نشطون في آخر ٧ أيام'],['mau','نشطون في آخر ٣٠ يومًا'],['activity','نشطون في الفترة المختارة'],['onboarding_active','نشطون أثناء التسجيل'],['retention_return_1','عادوا بعد يوم من الاعتماد','retention_due_1'],['retention_return_7','عادوا بعد أسبوع من الاعتماد','retention_due_7'],['discoverable','ظاهرة ملفاتهم حاليًا'],['zero_eligible','بلا أي ملف مؤهل حاليًا','discoverable'],['requests','طلبات التعارف المرسلة'],['accepted_cohort','قُبلت من الطلبات المرسلة','requests'],['communication','اتفاقات التواصل المتبادلة']],
 billing:[['eligible_trial','أهلية مؤكدة من المتجر'],['offer_seen_trial','ظهر لهم عرض تجربة مؤهل'],['chose_free_trial','اختاروا المجانية عند عرض التجربة','offer_seen_trial'],['left_offer_trial','غادروا عرض التجربة بزر الرجوع','offer_seen_trial'],['checkout_trial','بدأوا شراء التجربة','offer_seen_trial'],['no_choice_trial','شاهدوا التجربة بلا قرار مسجّل','offer_seen_trial'],['verified_trial','تجارب أكدها المتجر'],['trial_converted','انتقلوا من التجربة إلى الدفع'],['trial_expired','انتهت تجربتهم دون شراء'],['offer_seen_standard','شاهدوا صفحة الأسعار العادية'],['chose_free_standard','اختاروا المجانية عند عرض الأسعار'],['active_trial','تجربة متجر سارية الآن'],['paid_subscriber','عضوية متجر مدفوعة سارية الآن'],['tier_free','المجانية حاليًا'],['tier_premium','المميزة حاليًا'],['tier_seriousness','وسام الجدية حاليًا'],['grant','وصول ممنوح حاليًا'],['pilot_trial','تجارب تشغيلية سارية'],['renewal_off','أوقفوا التجديد والوصول ساري'],['billing_retry','تعذّر تحصيل التجديد'],['revoked','مشتريات سُحبت صلاحيتها'],['slots','مقاعد عرض الإطلاق المتبقية']],
};
const overviewTotals: Row[] = [
 ['joined','حسابات جديدة خلال الفترة'],
 ['stage_pending','بانتظار المراجعة الآن'],
 ['wau','نشطون آخر ٧ أيام'],
];
const rangeDate = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Riyadh' });
function rangeLabel(from:string,to:string) {
 return rangeDate.formatRange(new Date(from),new Date(to));
}
const panes:Record<string,string>={overview:'الملخص',funnel:'مراحل التسجيل',activity:'الاستخدام والتعارف',billing:'العضويات',directory:'دليل التسجيل',issues:'يحتاج متابعة'};
function day(offset=0){return new Date(Date.now()+3*3600000+offset*86400000).toISOString().slice(0,10);}
function Calibration({policy,refresh}:{policy:Summary['calibration'];refresh:()=>void}) {
 const [minimum,setMinimum]=useState(policy.minimum?.toString()??''),[rate,setRate]=useState(policy.regular?String(Math.round(policy.regular*100)):'');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function change(disable:boolean){
  if(busy)return;setBusy(true);setError('');
  try{await call('marriage_admin_follow_policy',{minimum_count:disable?null:Number(minimum),regular_rate:disable?null:Number(rate)/100});refresh();}
  catch(e){setError(friendly(e));}finally{setBusy(false);}
 }
 return <details className="review-section"><summary>معايرة مستوى المتابعة الداخلي · {policy.minimum?'مفعّل':'متوقّف'}</summary>
 <p className="muted">يُفعّل بعد مراجعة فرص الرد الفعلية. يلزم ٥٠ فرصة مرصودة على الأقل، وخمسة أضعاف الحد الأدنى المختار.</p>
 <form className="la-controls" onSubmit={e=>{e.preventDefault();void change(false);}}><label>الفرص المكتملة لكل عضو<input type="number" min={5} max={100} required value={minimum} onChange={e=>setMinimum(e.target.value)}/></label><label>نسبة الرد المنتظم خلال ٤٨ ساعة ٪<input type="number" min={10} max={100} required value={rate} onChange={e=>setRate(e.target.value)}/></label><button className="secondary" disabled={busy}>حفظ وتفعيل</button>{policy.minimum&&<button type="button" disabled={busy} onClick={()=>void change(true)}>إيقاف المستويات</button>}</form>
 {error&&<p role="alert" className="notice error">{error}</p>}</details>;
}
function Grid({rows,metrics}:{rows:Row[];metrics:Record<string,Counts>}){
 return <div className="la-scroll"><table className="la-table"><thead><tr><th scope="col">المؤشر</th>{genders.map(g=><th scope="col" key={g}>{labels[g]}</th>)}</tr></thead><tbody>{rows.map(([key,label,base])=><tr key={key}><th scope="row">{label}</th>{genders.map(g=>{const n=metrics[key]?.[g]??0,den=base?metrics[base]?.[g]??0:0,total=metrics[key]?.total??0;return <td key={g}>{base&&den===0?'—':nf.format(n)}{base&&den>0&&<small>{nf.format(n*100/den)}٪ · من {nf.format(den)}</small>}{!base&&g!=='total'&&total>0&&<small>{nf.format(n*100/total)}٪ من الإجمالي</small>}</td>;})}</tr>)}</tbody></table></div>;
}
function Directory({onMember,initialStage='all'}:{onMember:Props['onMember'];initialStage?:string}){
 const [draft,setDraft]=useState(''),[query,setQuery]=useState(''),[stage,setStage]=useState(initialStage),[hours,setHours]=useState(0);
 const [records,setRecords]=useState<DirectoryRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[more,setMore]=useState(false),[revision,setRevision]=useState(0);const sequence=useRef(0);
 async function read(before:string|null=null){
  const token=++sequence.current;setBusy(true);setError('');
  try{const rows=await call<DirectoryRow[]>('marriage_admin_launch_directory',{search_value:query,stage_value:stage,stalled_hours:hours,before_id:before});
   if(token===sequence.current){setRecords(old=>before?[...old,...rows]:rows);setMore(rows.length===50);}
  }catch(e){if(token===sequence.current)setError(friendly(e));}finally{if(token===sequence.current)setBusy(false);}
 }
 useEffect(()=>{setRecords([]);setMore(false);void read();return ()=>{sequence.current++;};},[query,stage,hours,revision]);
 return <section className="panel"><h2>دليل التسجيل</h2><form className="la-controls" onSubmit={e=>{e.preventDefault();setQuery(draft.trim());setRevision(v=>v+1);}}>
 <label>البحث<input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="اسم أو معرّف أو جوال أو بريد موثّق"/></label>
 <label>المرحلة<select value={stage} onChange={e=>setStage(e.target.value)}>{initialStage!=='all'&&<option value={initialStage}>حسابات الحالة المحددة</option>}<option value="all">كل المراحل</option>{['created','phone_pending','onboarding','pending','approved'].map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
 <label>آخر تقدّم<select value={hours} onChange={e=>setHours(Number(e.target.value))}><option value={0}>أي وقت</option><option value={24}>متوقف منذ يوم</option><option value={168}>متوقف منذ أسبوع</option></select></label>
 <button className="secondary">بحث</button></form>
 {records.map(row=><article className="la-person" key={row.memberId}><div><strong>{row.name||'حساب أثناء التسجيل'}</strong><small>{labels[row.gender]} · {labels[row.stage]}{row.step?' · '+(labels[row.step]??'التسجيل'):''} · {time(row.stamp)}</small><small>{labels[row.visibility]} · {labels[row.tier]}{row.blockers?.length?' · '+row.blockers.map(b=>labels[b]??'مراجعة الطلب').join('، '):''}</small>{row.lastCompleted&&<small>آخر مرحلة مكتملة · {labels[row.lastCompleted]??row.lastCompleted}</small>}<small dir="ltr">{row.memberId}</small></div><button className="secondary" onClick={()=>onMember(row.memberId)}>فتح الحساب</button></article>)}
 {error&&<p role="alert" className="notice error">{error}</p>}{busy&&<p role="status">جارٍ التحميل…</p>}{!error&&!busy&&!records.length&&<p className="muted">لا توجد حسابات تطابق البحث.</p>}{more&&<button className="secondary" disabled={busy} onClick={()=>void read(records.at(-1)!.memberId)}>عرض المزيد</button>}</section>;
}
export function LaunchAnalytics({onMember,onQueue,demo=false}:Props){
 const [pane,setPane]=useState('overview'),[from,setFrom]=useState(day(-6)),[to,setTo]=useState(day()),[range,setRange]=useState([day(-6),day()]),[data,setData]=useState<Summary|null>(null),[error,setError]=useState('');
 const [directoryFilter,setDirectoryFilter]=useState('all');
 function openAffected(filter:string){setDirectoryFilter(filter);setPane('directory');}
 useEffect(()=>{let valid=true;setError('');setData(null);
 if(!demo){void call<Summary>('marriage_admin_launch_analytics',{date_from:range[0],date_to:range[1]}).then(r=>{if(valid)setData(r);},e=>{if(valid)setError(friendly(e));});}
 return()=>{valid=false;};},[range,demo]);
 const selectDays=(n:number)=>{const a=day(1-n),b=day();setFrom(a);setTo(b);setRange([a,b]);};
 return <div className="la-page">{demo?<section className="panel"><h2>مؤشرات الإطلاق</h2><p>تتوفر إحصاءات الأعضاء في بيئة الحسابات الحقيقية.</p></section>:<>
 <nav className="la-navigation" aria-label="تقارير الإطلاق">{Object.entries(panes).map(([k,v])=><button type="button" aria-pressed={pane===k} onClick={()=>{setDirectoryFilter('all');setPane(k);}} key={k}>{v}</button>)}</nav>
 {pane==='directory'?<Directory onMember={onMember} initialStage={directoryFilter}/>:<>
 <div className="la-period">
  <div className="la-presets" role="group" aria-label="فترة التقرير">
   {[1,7,30].map(n=><button type="button" key={n} aria-pressed={range[0]===day(1-n)&&range[1]===day()} onClick={()=>selectDays(n)}>{n===1?'اليوم':n===7?'٧ أيام':'٣٠ يومًا'}</button>)}
  </div>
  <details className="la-calendar">
   <summary><CalendarDays size={16}/><span>{rangeLabel(range[0],range[1])}</span><ChevronDown size={14}/></summary>
   <form className="la-controls" onSubmit={e=>{e.preventDefault();setRange([from,to]);const details=e.currentTarget.closest('details');if(details){details.open=false;details.querySelector('summary')?.focus();}}}>
    <label>من<input required type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label>
    <label>إلى<input required type="date" min={from} max={day()} value={to} onChange={e=>setTo(e.target.value)}/></label><button className="secondary">تطبيق</button>
   </form>
  </details>
 </div>
 {data&&pane==='overview'&&<dl className="la-totals">{overviewTotals.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{nf.format(data.metrics[key]?.total??0)}</dd></div>)}</dl>}
 {error?<p className="notice error" role="alert">{error}</p>:!data?<p role="status">جارٍ قراءة المؤشرات…</p>:pane==='issues'?<section className="panel">{data.issues.map(i=><div className="la-person" key={i.key}><div><strong>{labels[i.key]}</strong><small>{i.oldest?'الأقدم '+time(i.oldest):'لا توجد حالات مسجلة'}</small></div><span>{nf.format(i.n)}</span><button className="secondary" onClick={()=>i.dest==='applications'?openAffected('issue_'+i.key):onQueue(i.dest)}>فتح المتابعة</button></div>)}<h3>أعطال آخر ٧ أيام</h3>{!data.incidents.length&&<p className="muted">لا توجد أعطال مرصودة.</p>}{data.incidents.map(i=><article className="la-person" key={[i.step,i.platform,i.build].join(':')}><div><strong>{labels[i.step]??i.step} · {nf.format(i.affected)} أعضاء</strong><small><bdi>{i.platform} · {i.build}</bdi></small><small>من {time(i.first_at)} إلى {time(i.last_at)}</small><small>آخر نجاح مرصود {i.last_success?elapsed(i.last_success)+' · '+time(i.last_success):'غير متاح'}</small></div><button className="secondary" onClick={()=>openAffected(['incident',i.step,i.platform,i.build].join(':'))}>الحسابات المتأثرة</button></article>)}</section>:pane==='funnel'?<>
 <section className="panel"><h3>تحقق الجوال قبل الحساب</h3><p className="muted">محاولات مجمّعة. قد يحاول الشخص أكثر من مرة.</p><Grid rows={([['sms_signup_start','فتحوا التسجيل (جلسات)'],['sms_provider_error','إخفاقات المزوّد'],['sms_sending','بدأ التحقق'],['sms_sent','أُرسل الرمز'],['sms_verified','تم التحقق'],['sms_revoked','أُلغيت المحاولة']])} metrics={data.metrics}/></section>
 {steps.filter(k=>k!=='beena'||data.metrics['applicable_'+k]).map(k=><section className="panel" key={k}><h3>{labels[k]}</h3><Grid metrics={data.metrics} rows={[[`reached_${k}`,'وصلوا إلى الخطوة'],[`completed_${k}`,'أكملوها',`applicable_${k}`],[`resumed_${k}`,'استأنفوها'],[`error_${k}`,'ظهر لهم خطأ']]}/></section>)}</>:<section className="panel">
 {pane==='activity'&&<p className="muted">النشاط تصفّح أو بحث أو تواصل. تُحسب طلبات الأزواج مرة واحدة بحسب جنس المرسِل. نسب العودة للأفواج التي اكتملت فترة ملاحظتها.</p>}
 {pane==='billing'&&<p className="muted">حالة عرض الإطلاق · رجال {data.campaign.man?'مفعّل':'متوقف'} · نساء {data.campaign.woman?'مفعّل':'متوقف'}</p>}
 <h2 className="la-table-heading">{pane==='overview'?'التسجيل حسب الجنس':panes[pane]}</h2>
 <Grid metrics={data.metrics} rows={groups[pane]??[]}/>
 {pane==='overview'&&<p className="muted">حسابات الأهل حاليًا · {nf.format(data.family)}</p>}
 {pane==='activity'&&<><Calibration policy={data.calibration} refresh={()=>setRange([...range])}/><h3>الوقت إلى أول طلب</h3><p className="muted">الوسيط بالساعات من الاعتماد حتى أول طلب خلال الفترة، لمن وصلهم طلب أو أرسلوه.</p><div className="la-scroll"><table className="la-table"><thead><tr><th>أول طلب</th>{genders.map(g=><th key={g}>{labels[g]}</th>)}</tr></thead><tbody>{['sent','received'].map(k=><tr key={k}><th>{k==='sent'?'أُرسل':'استُقبل'}</th>{genders.map(g=><td key={g}>{data.waits[k]?.[g]==null?'—':nf.format(data.waits[k][g]!)}</td>)}</tr>)}</tbody></table></div></>}
 </section>}
 {data&&<p className="la-footnote">بتوقيت الرياض · بدأ رصد أحداث التطبيق في {time(data.started)}. العضويات والظهور وحالة المراجعة تُقرأ الآن.</p>}</>}</>}</div>;
}
const signalRows:Row[]=[['sent','أشخاص أرسل لهم طلبًا'],['received','أشخاص وصل منهم طلب'],['acceptedSent','قُبل طلبه'],['acceptedReceived','قبِل طلبهم'],['messaged','أشخاص راسلهم'],['newThreads','محادثات جديدة'],['twoWay','محادثات شارك فيها الطرفان'],['sentMessages','رسائل أرسلها'],['perThread','متوسط الرسائل لكل محادثة راسل فيها'],['steps','خطوات اتفق عليها الطرفان'],['family','مقدمات عائلية أكدها الطرفان'],['closed','محادثات أنهاها العضو صراحة']];
export function MemberSignals({memberId,demo=false}:{memberId:string;demo?:boolean}){
 const [open,setOpen]=useState(false),[days,setDays]=useState(7),[data,setData]=useState<(Record<string,number|null>&{level:string})|null>(null),[error,setError]=useState('');
 useEffect(()=>{let valid=true;setData(null);setError('');if(open&&!demo)void call<NonNullable<typeof data>>('marriage_admin_member_signals',{target:memberId,days}).then(r=>{if(valid)setData(r);},e=>{if(valid)setError(friendly(e));});return()=>{valid=false;};},[open,memberId,days,demo]);
 if(demo)return null;
 return <details className="review-section" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>التفاعل والمتابعة</summary>{open&&<><div className="filters">{[7,30].map(d=><button key={d} aria-pressed={days===d} onClick={()=>setDays(d)}>{nf.format(d)} يومًا</button>)}</div>
 {error?<p className="notice error" role="alert">{error}</p>:!data?<p role="status">جارٍ التحميل…</p>:<><p>الرد خلال ٤٨ ساعة · {nf.format(data.replied??0)} من {nf.format(data.opportunities??0)} فرص مكتملة</p><p className="muted">{{calibrating:'مستوى المتابعة قيد المعايرة',insufficient:'بيانات غير كافية',regular:'متابعة منتظمة',intermittent:'متابعة متقطعة'}[data.level]}</p>
 <dl className="member-facts">{signalRows.map(([k,label])=><div key={k}><dt>{label}</dt><dd>{data[k]==null?'—':nf.format(data[k]!)}</dd></div>)}</dl></>}</>}</details>;
}
