import { Capacitor, registerPlugin } from '@capacitor/core';
import { useEffect, useState } from 'react';
import { ShieldCheck } from '../BrandIcons';
import { pushPrivacy } from '../notifications/push';
import { feedback } from '../feedback/haptics';

type Appearance = {icon:string;supported:boolean;callerName:boolean};
type Privacy = { enabled: boolean; delay: number; available: boolean };
const native = registerPlugin<{
  appearance():Promise<Appearance>;
  setAppearance(options:{icon?:string;callerName?:boolean}):Promise<Appearance>;
  privacyStatus(): Promise<Privacy>;
  privacyConfigure(options: { enabled: boolean; delay: number }): Promise<Privacy>;
}>('PrivateSession');

export function NativePrivacy({owner}:{owner:string|null}) {
  const [appearance,setAppearance]=useState<Appearance|null>(null);
  const [state, setState] = useState<Privacy | null>(null);
  useEffect(()=>{if(Capacitor.getPlatform()==='ios')void native.appearance().then(setAppearance).catch(()=>{});},[]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (Capacitor.getPlatform() === 'ios') void native.privacyStatus().then(value => { if (active) setState(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!state) return null;
  async function configure(enabled: boolean, delay: number) {
    if (busy) return;
    setBusy(true); setError('');
    try { setState(await native.privacyConfigure({ enabled, delay }));feedback('selection'); }
    catch { setError('لم يتم التحقق. بقي إعداد الخصوصية كما هو. حاول مجددًا.'); }
    finally { setBusy(false); }
  }
  async function changeAppearance(options:{icon?:string;callerName?:boolean}) {
    if(busy)return;setBusy(true);setError('');
    try {
      if(options.icon && options.icon!=='default') {
        if(!owner)throw Error();
        await pushPrivacy(owner,'private');window.dispatchEvent(new Event('nisfayn:push-privacy'));options.callerName=false;
      }
      setAppearance(await native.setAppearance(options));feedback('selection');
    }catch{setError('تعذّر تحديث الخصوصية. أعد المحاولة؛ لن نعرض محتوى إشعاراتك تلقائيًا.');}
    finally{setBusy(false);}
  }
  return <section className="st-section" aria-label="خصوصية iPhone">
    <h2>خصوصية iPhone</h2><div className="st-group">
      <button type="button" className="st-row st-switch" role="switch" aria-checked={state.enabled}
        disabled={busy || !state.available} onClick={() => void configure(!state.enabled, state.delay)}>
        <span className="st-icon"><ShieldCheck /></span><span className="st-row-copy"><strong>قفل نصفين</strong>
          <small>{state.available ? 'Face ID أو رمز قفل iPhone. يُطلب التحقق أيضًا لتغيير هذا الإعداد.' : 'فعّل رمز قفل iPhone أولًا لاستخدام قفل التطبيق.'}</small></span>
        <span className="st-switch-track" aria-hidden="true"><i /></span>
      </button>
      {state.enabled && <label className="st-row"><span className="st-row-copy"><strong>القفل بعد مغادرة التطبيق</strong></span>
        <select aria-label="مهلة قفل نصفين" value={state.delay} disabled={busy} onChange={event => void configure(true, Number(event.target.value))}>
          <option value={0}>فورًا</option><option value={60}>بعد دقيقة</option><option value={300}>بعد ٥ دقائق</option>
        </select></label>}
    {appearance && <>
      <button type="button" className="st-row st-switch" role="switch" aria-checked={appearance.callerName} disabled={busy} onClick={()=>void changeAppearance({callerName:!appearance.callerName})}>
        <span className="st-row-copy"><strong>اسم المتصل على شاشة القفل</strong><small>عند إيقافه تظهر «مكالمة نصفين» فقط.</small></span><span className="st-switch-track" aria-hidden="true"><i/></span>
      </button>
      {appearance.supported && <div className="st-row" style={{display:'block'}}><strong>أيقونة هادئة</strong><p className="st-notice">اختيار أيقونة محايدة يخفي محتوى الإشعارات واسم المتصل. يبقى اسم التطبيق نصفين.</p><div style={{display:'flex',gap:16}}>{[['default','نصفين'],['Quiet','هدوء'],['Horizon','أفق']].map(([icon,label])=><button type="button" key={icon} disabled={busy} aria-pressed={appearance.icon===icon} onClick={()=>void changeAppearance({icon})} style={{border:appearance.icon===icon?'2px solid var(--accent-fill)':'1px solid var(--border)',borderRadius:14,padding:10,background:'transparent',minWidth:72}}>{icon!=='default'&&<img src={'/'+icon+'-icon.png'} alt="" width={44} height={44} style={{display:'block',borderRadius:10,margin:'0 auto 6px'}}/>}{label}</button>)}</div></div>}
    </>}
    </div><p className="st-notice">تُخفى محادثاتك تلقائيًا من معاينة التطبيقات عند مغادرة نصفين.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
