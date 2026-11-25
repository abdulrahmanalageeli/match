import { Gift } from "lucide-react";
import { useEffect, useRef, useState } from 'react';
import { NativePushAction } from './NativePushAction';
import { NewsPreference } from '../publishing/NewsPreference';
import { Bell, MessageCircle, Route, Settings2, ShieldCheck } from "../BrandIcons";
import { disablePush, enablePush, getPushPreference, nativePush, openPushSettings, pushConfigured, pushStatus, pushSupported, pushPrivacy, type PushPreview, pushControls, defaultPushControls, type PushControls } from './push';
import { needsHomeScreen } from './webPush';
import { feedback } from '../feedback/haptics';

export function PushSettings({ owner, demo, testerSession, folded=false }: { owner: string | null; demo: boolean; testerSession?: string; folded?: boolean }) {
  owner = testerSession && nativePush ? 'tester:' + testerSession : owner;
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState('prompt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview,setPreview]=useState<PushPreview|null>(null);
  const [controls,setControls] = useState<PushControls | null>(null);
  const soundPreview=useRef<HTMLAudioElement|null>(null);
  useEffect(()=>()=>soundPreview.current?.pause(),[]);
  function playPreview(cue:string) {
    soundPreview.current?.pause();
    soundPreview.current=new Audio(`/brand/wudayn-${cue}.wav`);
    void soundPreview.current.play().catch(()=>setError('تعذّر تشغيل معاينة الصوت.'));
  }
  const available = Boolean(owner && (!demo || (testerSession && nativePush)) && pushSupported() && pushConfigured);
  useEffect(() => {
    let active = true;
    setControls(null); setEnabled(false); setPreview(null); setError('');
    const refreshPrivacy=()=>{
      if (available && owner && nativePush) void pushPrivacy(owner).then(value=>{if(active)setPreview(value.preview);},
        ()=>{if(active)setPreview(null);});
    };
    if (available && owner) {
      void pushControls(owner).then(value=>{if(active)setControls(value);}).catch(()=>{if(active)setError('تعذّر تحميل تفضيلات التنبيهات.');});
      refreshPrivacy();
      void Promise.all([getPushPreference(owner), pushStatus()]).then(([setting, device]) => {
        if (active) { setEnabled(setting.enabled); setPermission(device.permission); }
      }, () => { if (active) setError('تعذّر تحميل إعداد الإشعارات.'); });
    }
    window.addEventListener('nisfayn:push-privacy',refreshPrivacy);
    return () => { active = false;window.removeEventListener('nisfayn:push-privacy',refreshPrivacy); };
  }, [available, owner]);
  async function toggle() {
    if (!available || !owner || busy) return;
    setBusy(true); setError('');
    try {
      const setting = enabled ? await disablePush(owner) : await enablePush(owner);
      setEnabled(setting.enabled);
      feedback('selection');
      setPermission((await pushStatus()).permission);
    } catch (cause) {
      setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : 'تعذّر تحديث الإشعارات. حاول مجددًا.');
      void pushStatus().then(state => setPermission(state.permission)).catch(() => {});
    } finally { setBusy(false); }
  }
  async function saveControls(patch:Partial<PushControls>) {
    if (!owner || busy) return;
    setBusy(true); setError('');
    try { setControls(await pushControls(owner,patch)); feedback('selection'); }
    catch { setError('لم تُحفظ تفضيلات التنبيهات. حاول مجددًا.'); }
    finally { setBusy(false); }
  }
  const switches = [
    ['connections','طلبات التوافق والقبول'], ['message','رسائل المحادثات'], ['family','رسائل جسر الأهل'],
    ['reminder','تذكير بالموعد المتفق عليه'], ['agreement','ميثاق ومسار التعارف'],
    ['account','الحساب والأمان والدعم'], ['membership','العضوية والهدايا'], ['interest','اهتمام بملفك'], ['screenshot','لقطات الشاشة'], ['analysis','دعوات التحليل وجاهزية التقرير'],
    ['sound','صوت التنبيهات'], ['quiet','ساعات الهدوء'],
  ] as const;
  const contents = <>
    <div className="st-group">
      <button className="st-row st-switch" type="button" role="switch" aria-label="إشعارات التعارف والرسائل" aria-checked={enabled}
        disabled={!available || busy} onClick={() => void toggle()}>
        <span className="st-icon" aria-hidden="true"><Bell /></span>
        <span className="st-row-copy"><strong>إشعارات التعارف والرسائل</strong><small>{demo && !(testerSession && nativePush) ? 'تنبيهات داخل التجربة فقط؛ لا تُرسل إشعارات نظام.' : !nativePush && needsHomeScreen() ? 'على iPhone: من قائمة المشاركة اختر «إضافة إلى الشاشة الرئيسية»، وافتح وُدَين منها لتفعيل الإشعارات.' : !pushConfigured ? 'لم تُفعّل خدمة الإشعارات بعد.' : !pushSupported() ? 'هذا المتصفح لا يدعم الإشعارات. تبقى تنبيهاتك متاحة داخل وُدَين.' : 'يسري على أجهزتك.'}</small></span>
        <span className="st-switch-track" aria-hidden="true"><i /></span>
      </button>
      {owner && !demo && <NewsPreference key={owner} owner={owner}/>}
      {nativePush && available && enabled && owner && <NativePushAction key={owner} owner={owner} settings/>}
      {!nativePush && available && enabled && permission==='prompt' && <button type="button" className="st-row" disabled={busy} onClick={async()=>{
        if(!owner)return;
        setBusy(true);setError('');
        try { await enablePush(owner);setPermission((await pushStatus()).permission); }
        catch { setPermission((await pushStatus()).permission);setError('تحقق من إذن الإشعارات لهذا الجهاز.'); }
        finally { setBusy(false); }
      }}>تفعيل التنبيهات على هذا الجهاز</button>}
      {nativePush&&available&&enabled&&<><label className="st-row"><span className="st-row-copy"><strong>المعاينة على شاشة القفل</strong></span>
        <select aria-label="معاينة الإشعارات" value={preview??''} disabled={busy} onChange={async event=>{
          const next=event.target.value as PushPreview;if(!owner)return;setBusy(true);setError('');
          try{setPreview((await pushPrivacy(owner,next)).preview);}catch{setError('لم يُحفظ إعداد المعاينة. حاول مجددًا.');}finally{setBusy(false);}
        }}><option value="" disabled>اختر المعاينة</option><option value="private">إشعار خاص</option><option value="event">نوع الإشعار</option><option value="name">الاسم فقط</option><option value="content">الاسم والرسالة</option></select>
      </label>
      {preview&&<div className="st-lock-preview" role="status" aria-label="مثال لإشعار على شاشة القفل">
        <small><Bell size={14} aria-hidden="true"/> وُدَين · مثال توضيحي</small>
        <strong>{preview==='private'?'إشعار جديد':preview==='event'?'لديك رسالة جديدة': 'رسالة من نورة'}</strong>
        {preview==='content'&&<span>يسعدني أن نتعرّف أكثر.</span>}
      </div>}</>}
      {available && enabled && controls && <div className="st-push-controls" role="group" aria-labelledby="st-push-groups-title">
        <p className="st-push-controls-title" id="st-push-groups-title">ما يصلك</p>
        {switches.filter(([key])=>key!=='analysis'||!testerSession).map(([key,label])=><button key={key} type="button" className="st-row st-switch"
          role="switch" aria-label={label} aria-checked={controls[key]} disabled={busy}
          onClick={()=>void saveControls(key==='quiet' ? {quiet:!controls.quiet,zone:Intl.DateTimeFormat().resolvedOptions().timeZone || defaultPushControls.zone} : {[key]:!controls[key]})}>
          <span className="st-row-copy"><strong>{label}</strong></span>
          <span className="st-switch-track" aria-hidden="true"><i /></span>
        </button>)}
        <details className="st-sound-preview"><summary>معاينة أصوات وُدَين</summary>
          {([
            ['message','الرسائل والمكالمات',MessageCircle],
            ['step','ميثاق ومسار التعارف',Route],
            ['account','الحساب والدعم',ShieldCheck],
            ['celebration','القبول والهدايا',Gift],
          ] as const).map(([cue,label,Icon])=><button key={cue} type="button" className="st-row st-sound-sample" data-cue={cue} onClick={()=>playPreview(cue)}>
            <span className="st-icon"><Icon size={16} aria-hidden="true"/></span><span>{label}</span><small>استمع</small>
          </button>)}
        </details>
        {controls.quiet && <>{(['start','end'] as const).map(key=><label key={key} className="st-row">
          <span className="st-row-copy">{key==='start'?'بداية الهدوء':'نهاية الهدوء'}</span>
          <select disabled={busy} aria-label={key==='start'?'بداية الهدوء':'نهاية الهدوء'} value={controls[key]}
            onChange={e=>void saveControls({[key]:Number(e.target.value)})}>
            {Array.from({length:24},(_,h)=><option key={h} value={h} disabled={h===controls[key==='start'?'end':'start']}>{new Intl.NumberFormat('ar-SA',{minimumIntegerDigits:2}).format(h)}:٠٠</option>)}
          </select>
        </label>)}<small className="st-push-zone">بتوقيت {controls.zone==='Asia/Riyadh'?'الرياض':controls.zone}</small></>}
      </div>}
      {nativePush && available && (enabled || permission === 'denied') && <button type="button" className="st-row" onClick={() => void openPushSettings().catch(() => setError('تعذّر فتح إعدادات الجهاز.'))}>
        <span className="st-icon"><Settings2 /></span><span className="st-row-copy"><strong>إعدادات إشعارات iPhone</strong><small>إذن الإشعارات ومعايناتها على هذا الجهاز.</small></span>
      </button>}
      {!nativePush && available && permission === 'denied' && <p className="st-notice" role="status">السماح بالإشعارات متوقف في إعدادات جهازك أو متصفحك. غيّر الإذن لوُدَين، ثم فعّله هنا.</p>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </>;
  if(folded)return <details className="st-section st-fold st-hub"><summary><span><strong>الإشعارات</strong><small>{enabled?'مفعّلة · اختر ما يصلك وخصوصية المعاينة':'تحكم في تنبيهات التعارف والرسائل'}</small></span></summary>{contents}</details>;
  return <section className="st-section" aria-labelledby="st-push-title"><h2 id="st-push-title">الإشعارات</h2>{contents}</section>;
}
