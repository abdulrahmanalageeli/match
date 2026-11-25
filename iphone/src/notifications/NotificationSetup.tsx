import { useEffect, useState } from 'react';
import { Bell, MessageCircle, ShieldCheck, UsersRound } from '../BrandIcons';
import { Frame } from '../Screens';
import { defaultPushControls, pushControls, pushPrivacy, type PushControls, type PushPreview } from './push';
import './notification-setup.css';

const previewChoices: {value:PushPreview;title:string;example:string}[] = [
  {value:'private',title:'خاص',example:'إشعار جديد'},
  {value:'name',title:'الاسم فقط',example:'رسالة من نورة'},
  {value:'content',title:'معاينة الرسالة',example:'نورة: يسعدني أن نتعرّف أكثر.'},
];

const groups: {key:keyof Pick<PushControls,'connections'|'message'|'family'|'reminder'>;label:string;detail:string;icon:typeof Bell}[] = [
  {key:'connections',label:'طلبات التعارف',detail:'الطلبات الجديدة والقبول',icon:ShieldCheck},
  {key:'message',label:'المحادثات',detail:'الرسائل الجديدة',icon:MessageCircle},
  {key:'family',label:'جسر الأهل',detail:'الدعوات والرسائل',icon:UsersRound},
  {key:'reminder',label:'المواعيد',detail:'تذكير بالموعد المتفق عليه',icon:Bell},
];

export function NotificationSetup({owner,onDone,onExit}:{owner:string;onDone:()=>void;onExit:()=>void}) {
  const [preview,setPreview]=useState<PushPreview|null>(null);
  const [controls,setControls]=useState<PushControls>(defaultPushControls);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    Promise.all([pushPrivacy(owner),pushControls(owner)]).then(([privacy,saved])=>{
      if(!active)return;
      if(privacy.configured){onDone();return;}
      setPreview(privacy.preview);
      setControls(saved);
      setLoading(false);
    }).catch(()=>{if(active){setError('تعذّر تحميل إعدادات التنبيهات.');setLoading(false);}});
    return()=>{active=false;};
  },[owner,onDone]);

  async function save(){
    if(!preview||busy)return;
    setBusy(true);setError('');
    try{
      await Promise.all([pushPrivacy(owner,preview),pushControls(owner,{
        connections:controls.connections,message:controls.message,family:controls.family,reminder:controls.reminder,
      })]);
      onDone();
    }catch{setError('لم تُحفظ اختياراتك. حاول مجددًا.');}
    finally{setBusy(false);}
  }

  return <Frame title="تنبيهاتك" back={onExit} backDisabled={busy} className="nf-notification-setup">
    {loading?<p className="flow-note" role="status">جارٍ تجهيز اختياراتك…</p>:<div className="ns-body">
      <header className="ns-intro"><span className="ns-bell"><Bell size={24}/></span><h1>كيف تحب أن تصلك التنبيهات؟</h1><p>اختر ما يظهر على شاشة القفل وما يهمك متابعته. يمكنك تغييره لاحقًا.</p></header>
      <fieldset className="ns-previews" role="radiogroup"><legend>معاينة شاشة القفل</legend>{previewChoices.map(choice=><button key={choice.value} type="button" role="radio" aria-checked={preview===choice.value} className={preview===choice.value?'is-selected':''} onClick={()=>setPreview(choice.value)}>
        <span><strong>{choice.title}</strong><small>{choice.value==='private'?'لا يظهر الاسم أو المحتوى':choice.value==='name'?'يظهر المرسل فقط':'يظهر المرسل ونص الرسالة'}</small></span><em>{choice.example}</em>
      </button>)}</fieldset>
      <fieldset className="ns-groups"><legend>ما يصلك</legend>{groups.map(group=>{const Icon=group.icon;return <button key={group.key} type="button" role="switch" aria-checked={controls[group.key]} onClick={()=>setControls(current=>({...current,[group.key]:!current[group.key]}))}>
        <span className="ns-group-icon"><Icon size={19}/></span><span><strong>{group.label}</strong><small>{group.detail}</small></span><i aria-hidden="true"/>
      </button>;})}</fieldset>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <button type="button" className="btn-primary" disabled={!preview||busy} onClick={()=>void save()}>{busy?'جارٍ الحفظ…':'حفظ ومتابعة'}</button>
    </div>}
  </Frame>;
}
