import {useEffect,useState} from 'react';
import {call,friendly} from './client';

const products:Record<string,string>={men:'المميزة · الرجال',women:'المميزة · النساء',seriousness:'وسام الجدية · الرجال','seriousness.women':'وسام الجدية · النساء'};
type Policy={offer:string|null;ends:string|null;revision:number};
function Campaign({product}:{product:string}) {
 const productId='com.blindmatch.marriage.monthly.'+product;
 const [saved,setSaved]=useState<Policy|null>(null);
 const [offer,setOffer]=useState(''),[ends,setEnds]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false),[generation,setGeneration]=useState(0);
 function apply(p:Policy) {
  setSaved(p);setOffer(p.offer??'');
  setEnds(p.ends?new Date(Date.parse(p.ends)+3*3600000).toISOString().slice(0,16):'');
 }
 useEffect(()=>{
  let active=true;
  setError('');setSaved(null);
  void call<Policy>('wudayn_admin_promotion',{product_id:productId}).then(p=>{if(active)apply(p);}).catch(e=>{if(active)setError(friendly(e));});
  return ()=>{active=false};
 },[productId,generation]);
 async function save(disable:boolean){
  if(!saved||busy)return;
  const until=disable?null:new Date(ends+':00+03:00');
  if(!disable&&(!/^[A-Za-z0-9._-]{1,64}$/.test(offer.trim())||!until||!Number.isFinite(until.getTime())||until.getTime()<=Date.now())){
   setError('أدخل معرّف العرض وموعد انتهاء قادمًا.');return;
  }
  setBusy(true);setError('');setNotice('');
  try{
   const p=await call<Policy>('wudayn_admin_promotion',{product_id:productId,expected_revision:saved.revision,offer_identifier:disable?null:offer.trim(),ends:until?.toISOString()??null});
   apply(p);setNotice(disable?'أُوقف العرض.':'حُفظ عرض العودة.');
  }catch(e){setError(friendly(e));}finally{setBusy(false);}
 }
 return <>{saved&&<form className="wd-conduct-form" onSubmit={e=>{e.preventDefault();void save(false);}}>
  <p className="wd-quiet">لأصحاب اشتراكات Apple السابقة المنتهية، مرة لكل عرض وباقة. يعرض التطبيق السعر والمدة من App Store.</p>
  {saved.offer&&<p>العرض {Date.parse(saved.ends!)>Date.now()?'المفعّل':'المنتهي'} · <bdi>{saved.offer}</bdi></p>}
  <div className="wd-admin-grid"><label>معرّف العرض في App Store Connect<input required dir="ltr" value={offer} onChange={e=>setOffer(e.target.value)} maxLength={64}/></label>
  <label>انتهاء العرض بتوقيت الرياض<input type="datetime-local" required value={ends} onChange={e=>setEnds(e.target.value)}/></label></div>
  <div className="wd-admin-actions"><button className="primary" disabled={busy}>حفظ عرض العودة</button>
   {saved.offer&&<button type="button" className="secondary" disabled={busy} onClick={()=>void save(true)}>إيقاف العرض</button>}</div>
 </form>}{error&&<p role="alert" className="notice error">{error} <button type="button" onClick={()=>setGeneration(v=>v+1)}>تحديث البيانات</button></p>}
 {notice&&<p role="status">{notice}</p>}</>;
}

export function MembershipPromotions(){
 const [product,setProduct]=useState('men'),[open,setOpen]=useState(false);
 return <details className="panel wd-release" onToggle={e=>setOpen(e.currentTarget.open)}><summary>عروض العودة والخصومات</summary>
  {open&&<><label>باقة الاشتراك<select value={product} onChange={e=>setProduct(e.target.value)}>{Object.entries(products).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <Campaign key={product} product={product}/></>}
 </details>;
}
