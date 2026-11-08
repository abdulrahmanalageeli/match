import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { LockKeyhole, ArrowLeft, ArrowRight } from 'lucide-react';
import App from '../App';
import { Brand } from '../Brand';
import { Welcome } from '../Welcome';
import { LegalNotice } from '../legal/LegalNotice';
import { welcomeNavigation } from '../welcomeNavigation';
import { testProfile,testRequest,testStorage,type Actor,type TestSession } from './pair';
import './testing.css';
let readyOnboarding:typeof import('../onboarding/OnboardingSandbox').OnboardingSandbox|undefined;
const loadOnboarding=()=>import('../onboarding/OnboardingSandbox').then(module=>{readyOnboarding=module.OnboardingSandbox;return {default:module.OnboardingSandbox};});
const OnboardingSandbox=lazy(loadOnboarding);
type EntryPage='welcome'|'accounts'|'onboarding'|'privacy';
export function TesterGate(){
 const [page,setPage]=useState<EntryPage>('welcome');
 const navigationIntent=useRef(0);
 useEffect(()=>{if(page==='welcome')void loadOnboarding().catch(()=>{});},[page]);
 const [account,setAccount]=useState<TestSession|null>(null),[actor,setActor]=useState<Actor>('abdulrahman'),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;const raw=sessionStorage.getItem(testStorage);if(raw){setBusy(true);try{const saved=JSON.parse(raw);void testRequest<any>('state',saved.session).then(data=>{if(alive)setAccount({...saved,actor:data.actor,profileRevision:data.profileRevision,profile:testProfile(data.actor,data.profiles[data.actor])});}).catch(()=>sessionStorage.removeItem(testStorage)).finally(()=>{if(alive)setBusy(false);});}catch{sessionStorage.removeItem(testStorage);setBusy(false);}}return()=>{alive=false};},[]);
 async function login(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const result=await testRequest<any>('login','',{}, {actor,password});const next={actor:result.actor,session:result.session,profileRevision:result.profileRevision,profile:testProfile(result.actor,result.profiles[result.actor])};sessionStorage.setItem(testStorage,JSON.stringify({actor:next.actor,session:next.session}));setPassword('');setAccount(next);}catch(e){setError(e instanceof Error?e.message:'تعذّر الدخول.');}finally{setBusy(false);}}
 const navigate=(next:EntryPage)=>{
  const intent=++navigationIntent.current;
  const open=()=>{if(intent===navigationIntent.current)welcomeNavigation(()=>setPage(next),next==='welcome'?'back':'forward',next==='welcome'?'.nf-join':'.phone-app main h1');};
  // Keep the welcome in place until the first question can render, avoiding a blank handoff.
  if(next==='onboarding'&&!readyOnboarding){void loadOnboarding().then(open,open);return;}
  open();
 };
 const Onboarding=readyOnboarding??OnboardingSandbox;
 const exit=()=>{if(account)void testRequest('logout',account.session).catch(()=>{});sessionStorage.removeItem(testStorage);setAccount(null);setPage('welcome');};
 if(account)return <App key={account.session} tester={account} onTesterExit={exit}/>;
 if(page==='welcome')return <div className="phone-app" dir="rtl"><Welcome onRegister={()=>navigate('onboarding')} onLogin={()=>navigate('accounts')} onDemo={()=>navigate('accounts')} onDemoIntake={()=>navigate('onboarding')} onPrivacy={()=>navigate('privacy')}/></div>;
 if(page==='onboarding')return <div className="phone-app" dir="rtl"><Suspense fallback={<main className="flow-frame" dir="rtl"><p role="status">جارٍ تجهيز رحلتك…</p></main>}><Onboarding startAtForm returnLabel="العودة للبداية" close={()=>navigate('welcome')}/></Suspense></div>;
 if(page==='privacy')return <div className="phone-app" dir="rtl"><main className="flow-frame"><header className="flow-header"><button type="button" className="f-icon" aria-label="العودة للبداية" onClick={()=>navigate('welcome')}><ArrowRight size={22}/></button><span>الخصوصية وشروط الاستخدام</span><Brand compact/></header><div className="flow-body"><LegalNotice preview/></div></main></div>;
 return <div className="phone-app" dir="rtl"><main className="nf-test-gate"><button type="button" className="nf-demo-link" onClick={()=>navigate('welcome')}><ArrowRight size={18} aria-hidden="true"/>العودة للبداية</button><Brand/><div className="nf-test-lock"><LockKeyhole size={25}/></div><p className="nf-test-eyebrow">مساحة الاختبار الخاصة</p><h1>أهلًا بكما في نصفين</h1><p>اختارا الحساب للبدء. عبدالرحمن ورهام متوافقان بالفعل. اتفقا على ميثاق الجدية لبدء التعارف.</p>
 <form onSubmit={login}><fieldset disabled={busy}><legend>الدخول باسم</legend><div className="nf-test-choices">{(['abdulrahman','reham'] as const).map(id=><button type="button" key={id} aria-pressed={actor===id} onClick={()=>{setActor(id);setError('');}}><b>{id==='reham'?'رهام':'عبدالرحمن'}</b><small>{id==='reham'?'تجربة العضوة':'تجربة المشرف'}</small></button>)}</div></fieldset>{actor==='abdulrahman'&&<><label htmlFor="tester-password">كلمة مرور الاختبار</label><input id="tester-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></>}{error&&<p role="alert" className="form-error">{error}</p>}<button className="btn-primary" disabled={busy||(actor==='abdulrahman'&&!password)}>{busy?'جارٍ الدخول…':'دخول التجربة'}<ArrowLeft size={18}/></button></form><small>حسابات اختبار منفصلة عن الأعضاء الحقيقيين. التفاصيل الأولية أمثلة قابلة للتعديل.</small><a className="nf-demo-link" href="?family=1">جسر الأهل · دخول وليّ الأمر أو أحد الأهل</a></main></div>;
}
