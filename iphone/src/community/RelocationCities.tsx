import {useEffect,useState} from 'react';
import {cityOptions} from '../profile/profileOptions';
import {ChevronLeft, X} from '../BrandIcons';
import {SheetChoiceSelect} from '../ui/SheetChoiceSelect';
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
  return <details className="dr-filter-section dr-filter-group"><summary><span>مدن الانتقال في تفضيلاتي الدائمة</span><ChevronLeft size={17} aria-hidden="true"/></summary>
    <div className="dr-refined-fields dr-relocation-fields">
    <p>إذا اخترت «مدينة نتفق عليها»، أضف المدن المناسبة لك. تبقى مدينتك ضمن الخيارات، وتُحفظ هذه القائمة لك حتى بعد مسح الفلاتر.</p>
    {cities && <>
      <SheetChoiceSelect label="إضافة مدينة للانتقال" value="" placeholder="اختر مدينة" disabled={busy || cities.length>=20}
        options={cityOptions.filter(o=>!o.value.startsWith('مدينة أخرى')&&!cities.includes(o.value))}
        onChange={city=>{if(city)setCities([...cities,city]);setMessage('');}}/>
      <div className="dr-selected-filters">{cities.map(city=><button type="button" key={city} disabled={busy} aria-label={'إزالة '+city} onClick={()=>{setCities(cities.filter(c=>c!==city));setMessage('');}}>{city}<X size={13} aria-hidden="true"/></button>)}</div>
      <button type="button" className="btn-text" disabled={busy} onClick={()=>void save()}>حفظ مدن الانتقال</button></>}
    {message&&<small role="status">{message}</small>}
    </div>
  </details>;
}
