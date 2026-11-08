import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Eye, ImagePlus, LockKeyhole, Sparkles, Trash2 } from 'lucide-react';
import { AvatarPicker } from './AvatarPicker';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { preparePortrait, type PortraitDraft } from '../photos/portraitPreparation';
import type { PublicAvatar } from '../compatibility/appearance';
import type { ProfilePortrait, PortraitRevealPolicy } from '../types';
import type { CommunitySource } from '../community/data';
import './profile-photo-choice.css';

export function ProfilePhotoChoice({avatar,onAvatar,inferred,change,onChange,existing,source,consented,onConsent,consentError,sensitiveAllowed,onSensitiveConsent,onBusy,revealPolicy,onPolicyChange}:{
  avatar?:PublicAvatar|null;onAvatar:(v:PublicAvatar|null)=>void;inferred:PublicAvatar;change:PortraitDraft|null|undefined;onChange:(v:PortraitDraft|null)=>void;
  existing?:ProfilePortrait|null;source?:CommunitySource|null;consented:boolean;onConsent:(v:boolean)=>void;consentError?:string;sensitiveAllowed:boolean;onSensitiveConsent:()=>void;onBusy:(v:boolean)=>void;
  revealPolicy?:PortraitRevealPolicy;onPolicyChange?:(policy:PortraitRevealPolicy)=>void;
}) {
  const [mode,setMode]=useState<'photo'|'avatar'>(change||existing?'photo':'avatar');
  const [file,setFile]=useState<File|null>(null),[blur,setBlur]=useState(change?.blur??existing?.blur??65),[preparing,setPreparing]=useState(false),[error,setError]=useState('');
  const [policy,setPolicy]=useState<PortraitRevealPolicy>(revealPolicy??change?.revealPolicy??existing?.revealPolicy??'never');
  const input=useRef<HTMLInputElement>(null),callbacks=useRef({onChange,onBusy});callbacks.current={onChange,onBusy};
  useEffect(()=>{if(!file)return;let active=true;setPreparing(true);callbacks.current.onBusy(true);
    const timer=setTimeout(()=>{void preparePortrait(file,blur,policy).then(result=>{if(active){callbacks.current.onChange(result);setError('');}else URL.revokeObjectURL(result.url);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'تعذّر تجهيز الصورة.');}).finally(()=>{if(active){setPreparing(false);callbacks.current.onBusy(false);}});},140);
    return()=>{active=false;clearTimeout(timer);callbacks.current.onBusy(false);};
  },[file,blur,policy]);
  const showingExisting=change===undefined&&existing;
  const canReveal=Boolean(file||change?.clearBlob||(change===undefined&&existing?.hasClear));
  function choosePolicy(next:PortraitRevealPolicy){
    if(next!=='never'&&(!canReveal||blur===0))return;
    setPolicy(next);onPolicyChange?.(next);setError('');
    if(!file&&change){const {clearBlob,...draft}=change;onChange({...draft,revealPolicy:next,...(next!=='never'&&clearBlob?{clearBlob}:{})});}
  }
  function removePhoto(){setFile(null);setPreparing(false);setPolicy('never');onPolicyChange?.('never');onChange(null);onConsent(false);}
  return <section className="nf-photo-choice" data-field="portrait" tabIndex={-1} aria-label="صورتك وخصوصيتك">
    <div className="nf-photo-mode" role="group" aria-label="طريقة ظهورك"><button type="button" aria-pressed={mode==='photo'} onClick={()=>setMode('photo')}><Camera size={18}/> صورة بتمويه اختياري</button><button type="button" aria-pressed={mode==='avatar'} onClick={()=>setMode('avatar')}><Sparkles size={18}/> صورة رمزية</button></div>
    {mode==='photo'?<>
      <p className="nf-photo-intro">لمحة أقرب لكِ، بالقدر الذي ترتاحين له. يمكنكِ إظهار انطباع عن حضورك مع اختيار درجة التمويه، أو الاكتفاء بصورة رمزية.</p>
      <div className="nf-photo-stage">{change?<img src={change.url} alt="صورتك كما ستظهر للأعضاء"/>:showingExisting?<PortraitPhoto portrait={existing!} source={source} alt="صورة ملفك الحالية"/>:<div><Camera size={34}/><span>صورتك، باختيارك</span></div>}{preparing&&<span className="nf-photo-processing" role="status">تجهيز التمويه…</span>}</div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const selected=e.target.files?.[0];if(selected){setError('');setFile(selected);}e.target.value='';}}/>
      <button type="button" className="btn-secondary" onClick={()=>input.current?.click()}><ImagePlus size={17}/>{change||showingExisting?'اختيار صورة أخرى':'اختيار صورتي'}</button>
      {(file||change||showingExisting)&&<><div className="nf-photo-blur"><label htmlFor="portrait-blur">درجة التمويه <strong>{new Intl.NumberFormat('ar-SA').format(blur)}٪</strong></label><input id="portrait-blur" type="range" min="0" max="100" step="5" value={blur} disabled={!file} onChange={e=>{const next=Number(e.target.value);setBlur(next);if(next===0){setPolicy('never');onPolicyChange?.('never');}}} aria-valuetext={blur===0?'دون تمويه':new Intl.NumberFormat('ar-SA').format(blur)+' بالمئة'}/><div><span>واضحة</span><span>تمويه أعلى</span></div>{!file&&<small>لتعديل درجة التمويه اختاري الصورة مجددًا.</small>}</div>
      <section className="nf-photo-reveal" aria-label="إزالة التمويه تلقائيًا"><header><span><Eye size={20}/></span><div><h3>وضوح أكبر، في الوقت المناسب</h3><p>أنتِ تختارين متى تُرى صورتك بوضوح.</p></div></header>
        <label htmlFor="portrait-reveal">إزالة التمويه تلقائيًا<select id="portrait-reveal" value={policy} disabled={blur===0} onChange={e=>choosePolicy(e.target.value as PortraitRevealPolicy)}>
          <option value="never">إبقاء التمويه دائمًا</option><option value="matched" disabled={!canReveal}>بعد قبول التعارف من الطرفين</option><option value="serious" disabled={!canReveal}>عند النقاش الجاد حول الزواج</option><option value="family" disabled={!canReveal}>عند الخطوة الرسمية أو العائلية</option>
        </select></label>
        {blur===0?<p className="nf-photo-reveal-note">صورتك واضحة بالفعل للأعضاء المؤهلين. اختاري تمويهًا أعلى لتخصيص وقت إزالته.</p>:!canReveal?<p className="nf-photo-reveal-note">الصورة الحالية محفوظة بتمويه فقط. أعيدي اختيار الصورة لتفعيل الإزالة التلقائية؛ لا يمكن استعادة التفاصيل من النسخة المموّهة.</p>:<p className="nf-photo-reveal-note">{policy==='never'?'تبقى الصورة بالتمويه الذي اخترته للجميع. لا نحتفظ بنسخة واضحة لهذا الخيار.':'تظهر النسخة الواضحة للطرف الذي وصل معكِ إلى هذا الموعد فقط. يبقى التمويه ظاهرًا لبقية الأعضاء. مراحل المسار تحتاج اتفاقكما معًا.'}</p>}
        {policy!=='never'&&<div className="nf-photo-reveal-detail"><LockKeyhole size={15}/><span>باختيار هذا الموعد، توافقين على حفظ نسخة واضحة خاصة ومشاركتها تلقائيًا مع الطرف المؤهل. يعود التمويه عند التراجع عن المرحلة أو إنهاء التعارف أو إلغاء هذا الخيار. لا يمكن سحب صورة حفظها الطرف الآخر سابقًا.</span></div>}
        <small>يسري اختيارك بعد مراجعة اختياراتك وحفظ التغييرات.</small>
      </section></>}
      {(change||showingExisting)&&<><label className="nf-photo-consent"><input type="checkbox" data-field="consent" checked={consented} aria-invalid={Boolean(consentError)||undefined} aria-describedby={consentError?'nf-intake-error':undefined} onChange={e=>onConsent(e.target.checked)}/><span>هذه صورتي ولدي حق استخدامها. أوافق على عرض النسخة المعروضة بدرجة التمويه المختارة، وعلى إعداد إزالة التمويه الذي حددته.</span></label><button type="button" className="nf-appearance-clear" onClick={removePhoto}><Trash2 size={14}/> إزالة صورة الملف</button></>}
      {error&&<p role="alert" className="nf-intake-error">{error}</p>}
      <p className="nf-photo-safety"><LockKeyhole size={16}/><span>نرفع النسخة المعروضة بعد الحفظ، ونسخة واضحة خاصة فقط عند اختيار الإزالة التلقائية. نزيل بيانات الموقع من الصور. التمويه يقلّل التفاصيل ولا يضمن إخفاء الهوية أو منع حفظ الصورة.</span></p>
    </>:<>
      {sensitiveAllowed?<AvatarPicker value={avatar===undefined?inferred:avatar} onChange={v=>{onAvatar(v);if(v)removePhoto();}}/>:<div className="nf-photo-avatar-gate"><Sparkles size={26}/><h3>بديل بلا صورة شخصية</h3><p>يمكننا اقتراح رسم حسب اللباس ودرجة البشرة اللذين تختارينهما بنفسك. تخصيص هذه التفاصيل اختياري ويحتاج موافقتك.</p><button className="btn-secondary" type="button" onClick={onSensitiveConsent}>مراجعة اختيار التفاصيل الحساسة</button></div>}
      {sensitiveAllowed&&avatar===undefined&&<p className="nf-photo-safety"><Check size={16}/> اقتُرح الرسم من اختياراتك عن اللباس والبشرة. يمكنك تغييره أو المتابعة دون صورة.</p>}
      {sensitiveAllowed&&(change||showingExisting)&&<button type="button" className="btn-secondary" onClick={()=>{removePhoto();onAvatar(inferred);}}>استخدام الصورة الرمزية بدل صورتي</button>}
    </>}
  </section>;
}
