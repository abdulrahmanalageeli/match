import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LockKeyhole, ArrowLeft, ArrowRight, RotateCcw } from "../BrandIcons";
import App from '../App';
import { Brand } from '../Brand';
import { testProfile,testRequest,testStorage,type Actor,type TestSession } from './pair';
import './testing.css';
export function TesterGate({initialActor}:{initialActor?:Actor}={}){
 const [account,setAccount]=useState<TestSession|null>(null),[actor,setActor]=useState<Actor>(initialActor??'abdulrahman'),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [restoreAttempt,setRestoreAttempt]=useState(0),[restoring,setRestoring]=useState<'checking'|'retry'|null>(()=>{try{return sessionStorage.getItem(testStorage)?'checking':null;}catch{return null;}});
 const restoreGeneration=useRef(0);
 useEffect(()=>{
  let alive=true,pending=false;
  const generation=++restoreGeneration.current;
  let saved:{actor:Actor;session:string};
  try{
   const raw=sessionStorage.getItem(testStorage);if(!raw){setRestoring(null);return;}
   saved=JSON.parse(raw);
   if(!saved||typeof saved.session!=='string'||!saved.session||!['abdulrahman','reham'].includes(saved.actor))throw Error('invalid_saved_session');
   if(initialActor&&saved.actor!==initialActor){setRestoring(null);return;}
  }catch{sessionStorage.removeItem(testStorage);setRestoring(null);setBusy(false);return;}
  const current=()=>alive&&generation===restoreGeneration.current;
  async function restore(){
   if(pending||!current())return;
   if(navigator.onLine===false){setRestoring('retry');setBusy(false);return;}
   pending=true;setBusy(true);setRestoring('checking');setError('');
   try{
    const data=await testRequest<any>('state',saved.session);
    if(current()&&initialActor&&data.actor!==initialActor){setRestoring(null);setBusy(false);alive=false;window.removeEventListener('online',restore);return;}
    if(current()){setAccount({...saved,actor:data.actor,profileRevision:data.profileRevision,profile:testProfile(data.actor,data.profiles[data.actor])});setRestoring(null);setBusy(false);alive=false;window.removeEventListener('online',restore);}
   }catch(cause){
    if(!current())return;
    const status=cause&&typeof cause==='object'&&'status'in cause?cause.status:undefined;
    if(status===401||status===403){sessionStorage.removeItem(testStorage);setRestoring(null);setError('انتهت جلسة الدخول. سجّل الدخول مجددًا للمتابعة.');setBusy(false);alive=false;window.removeEventListener('online',restore);}
    else setRestoring('retry');
   }finally{pending=false;if(current())setBusy(false);}
  }
  void restore();window.addEventListener('online',restore);
  return()=>{alive=false;window.removeEventListener('online',restore);};
 },[restoreAttempt,initialActor]);
 async function login(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const result=await testRequest<any>('login','',{}, {actor,password});const next={actor:result.actor,session:result.session,profileRevision:result.profileRevision,profile:testProfile(result.actor,result.profiles[result.actor])};sessionStorage.setItem(testStorage,JSON.stringify({actor:next.actor,session:next.session}));setPassword('');setAccount(next);}catch(e){setError(e instanceof Error?e.message:'تعذّر الدخول.');}finally{setBusy(false);}}
 const exit=()=>{if(account)void testRequest('logout',account.session).catch(()=>{});sessionStorage.removeItem(testStorage);setAccount(null);};
 if(account)return <App key={account.session} tester={account} onTesterExit={exit}/>;
 if(restoring)return <div className="phone-app" dir="rtl"><main className="nf-test-gate"><Brand/><div className="nf-test-lock"><LockKeyhole size={25}/></div><h1>{restoring==='checking'?'نعود إلى مساحتك':'نكمل من حيث توقفت'}</h1><p role="status">{restoring==='checking'?'نتحقق من جلستك ونجهّز محادثاتك…':'تعذّر الاتصال الآن. جلسة دخولك محفوظة على هذا الجهاز، وسنحاول عند عودة الشبكة.'}</p><button type="button" className="btn-primary" disabled={busy||restoring==='checking'} onClick={()=>setRestoreAttempt(attempt=>attempt+1)}><RotateCcw size={18}/>{restoring==='checking'?'جارٍ الاتصال…':'إعادة الاتصال'}</button><button type="button" className="nf-demo-link" disabled={busy||restoring==='checking'} onClick={()=>{restoreGeneration.current++;sessionStorage.removeItem(testStorage);setRestoring(null);setError('');}}>تسجيل الدخول بحساب آخر<ArrowLeft size={16}/></button></main></div>;
 return <div className="phone-app" dir="rtl"><main className="nf-test-gate"><a className="nf-demo-link" href="./"><ArrowRight size={18} aria-hidden="true"/>العودة لوُدَين</a><Brand/><div className="nf-test-lock"><LockKeyhole size={25}/></div><p className="nf-test-eyebrow">مساحة الاختبار الخاصة</p><h1>أهلًا بكما في وُدَين</h1><p>اختارا الحساب للبدء. عبدالرحمن ورهام متوافقان بالفعل. اتفقا على ميثاق الجدية لبدء التعارف.</p>
 <form onSubmit={login}><fieldset disabled={busy}><legend>الدخول باسم</legend><div className="nf-test-choices">{(['abdulrahman','reham'] as const).map(id=><button type="button" key={id} aria-pressed={actor===id} onClick={()=>{setActor(id);setError('');}}><b>{id==='reham'?'رهام':'عبدالرحمن'}</b><small>{id==='reham'?'تجربة العضوة':'تجربة المشرف'}</small></button>)}</div></fieldset>{actor==='abdulrahman'&&<><label htmlFor="tester-password">كلمة مرور الاختبار</label><input id="tester-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></>}{error&&<p role="alert" className="form-error">{error}</p>}<button className="btn-primary" disabled={busy||(actor==='abdulrahman'&&!password)}>{busy?'جارٍ الدخول…':'دخول التجربة'}<ArrowLeft size={18}/></button></form><small>حسابات اختبار منفصلة عن الأعضاء الحقيقيين. التفاصيل الأولية أمثلة قابلة للتعديل.</small><a className="nf-demo-link" href="?family=1">جسر الأهل · دخول وليّ الأمر أو أحد الأهل</a></main></div>;
}
