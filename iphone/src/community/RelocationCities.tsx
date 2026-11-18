import {useEffect,useState} from 'react';
import {cityOptions} from '../profile/profileOptions';
import type {CommunitySource} from './data';

export function RelocationCities({source,onSaved}:{source:CommunitySource;onSaved:()=>void}) {
  const [cities,setCities]=useState<string[]|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    let active=true;
    source.relocationCities?.().then(value=>{if(active)setCities(value);})
      .catch(()=>{if(active)setMessage('تعذّر تحميل مدن الانتقال. أعد فتح التصفية للمحاولة.');});
    return ()=>{active=false;};
  },[source]);
  if(!source.relocationCities)return null;
  async function save(){
    if(!cities || !source.relocationCities || busy)return;
    setBusy(true);setMessage('');
    try{setCities(await source.relocationCities(cities));setMessage('حُفظت مدن الانتقال في تفضيلاتك.');onSaved();}
    catch{setMessage('تعذّر حفظ مدن الانتقال. حاول مرة أخرى.');}
    finally{setBusy(false);}
  }
  return <details><summary>مدن الانتقال في تفضيلاتي الدائمة</summary>
    <p>إذا اخترت «مدينة نتفق عليها» في الاستبيان، حدّد المدن التي تقبل الانتقال إليها. تبقى مدينتك الحالية ضمن الخيارات. تظهر هذه القائمة لك وحدك وتبقى بعد مسح فلاتر البحث.</p>
    {cities && <fieldset disabled={busy}><legend>مدن يمكنني الانتقال إليها</legend>
      <select aria-label="إضافة مدينة للانتقال" value="" disabled={cities.length>=20} onChange={e=>{if(e.target.value)setCities([...cities,e.target.value]);setMessage('');}}>
        <option value="">اختر مدينة</option>{cityOptions.filter(o=>!o.value.startsWith('مدينة أخرى')&&!cities.includes(o.value)).map(o=><option key={o.value} value={o.value}>{o.value}</option>)}
      </select>
      {cities.map(city=><button type="button" key={city} aria-label={'إزالة '+city} onClick={()=>{setCities(cities.filter(c=>c!==city));setMessage('');}}>{city} ×</button>)}
      <button type="button" className="btn-secondary" onClick={()=>void save()}>حفظ مدن الانتقال</button></fieldset>}
    {message&&<small role="status">{message}</small>}
  </details>;
}
