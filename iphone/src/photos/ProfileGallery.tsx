import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, Trash2, X } from 'lucide-react';
import type { CommunitySource, GalleryPhoto } from '../community/data';
import { preparePhoto } from './photoData';
import './gallery.css';
import { SuccessNotice } from '../community/SuccessNotice';
import { HelpButton } from '../help/HelpCenter';

type ImageItem = GalleryPhoto & { url: string };
export function ProfileGallery({ source, subject, name, editable = false, onChanged }: { source: CommunitySource; subject?: string; name?: string; editable?: boolean; onChanged?:()=>void }) {
  const [photos, setPhotos] = useState<ImageItem[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved,setSaved]=useState<'added'|'removed'|null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let live = true; const urls: string[] = [];
    setLoading(true); setError('');
    (async () => {
      try {
        const list = await source.gallery?.(subject) ?? [];
        const items = await Promise.all(list.slice(0,3).map(async p => {
          const url = await source.galleryUrl!(p); urls.push(url);
          if (!live && url.startsWith('blob:')) URL.revokeObjectURL(url);
          return {...p, url};
        }));
        if(live)setPhotos(items);
      } catch { urls.filter(u=>u.startsWith('blob:')).forEach(u=>URL.revokeObjectURL(u)); if(live)setError('تعذّر تحميل المعرض. حاول مجددًا.'); }
      finally { if(live)setLoading(false);else urls.filter(u=>u.startsWith('blob:')).forEach(u=>URL.revokeObjectURL(u)); }
    })();
    return () => {live=false;};
  }, [source, subject, refresh]);
  // Keep displayed blobs alive until the next set has actually rendered.
  useEffect(()=>()=>{photos.forEach(p=>{if(p.url.startsWith('blob:'))URL.revokeObjectURL(p.url);});},[photos]);
  useEffect(()=>{if(selected!==null)dialog.current?.showModal();else dialog.current?.close();},[selected]);
  async function upload(file?: File) {
    if(!file||busy||!source.addGallery)return;setBusy(true);setError('');
    try {await source.addGallery(await preparePhoto(file));setRefresh(n=>n+1);setSaved('added');if(editable)onChanged?.();}catch(e){setError(e instanceof Error?e.message:'تعذّر رفع الصورة.');}finally{setBusy(false);if(input.current)input.current.value='';}
  }
  async function erase(photo: GalleryPhoto) {
    if(busy||!source.removeGallery)return;setBusy(true);setError('');
    try{await source.removeGallery(photo);setRemove(null);setRefresh(n=>n+1);setSaved('removed');if(editable)onChanged?.();}catch(e){setError(e instanceof Error?e.message:'تعذّر حذف الصورة.');}finally{setBusy(false);}
  }
  if(!source.gallery||(!editable&&!photos.length&&!loading&&!error))return null;
  return <section className="pg-section" aria-label={editable?'معرض ملفي':'معرض الصور'}>
    <header className="pg-heading"><div><span className="df-section-eyebrow">{editable?'لمحات تعبّر عنك':'من عالم '+(name||'الشخص')}</span><h2>{editable?'معرض ملفي':'حياة وراء الكلمات'}</h2></div><span><Camera size={16}/>{photos.length} / 3</span></header>
    {editable&&<p className="pg-caption">حتى ثلاث صور إضافية تظهر في ملفك للأعضاء المؤهلين لعرضه. إضافة الصور اختيارية، وتختلف عن الصور الخاصة داخل المحادثة. إضافة صورة إلى ملف معتمد تُحسب ضمن تعديله المتاح مرة كل ٣٠ يومًا وتحتاج مراجعة. يمكنك حذف الصور في أي وقت.</p>}
    {saved&&<SuccessNotice key={saved+refresh} title={saved==='added'?'لمحة جديدة في ملفك':'أُزيلت الصورة من المعرض'} detail={saved==='added'?'حُفظت صورتك، وتظهر للأعضاء المؤهلين بعد اعتماد مراجعة الملف.':'الصور المرسلة سابقًا داخل المحادثات لا تتأثر.'} quiet={saved==='removed'} close={()=>setSaved(null)}/>}
    {loading&&!photos.length?<div className="pg-loading" role="status"><LoaderCircle size={20}/> تحميل المعرض</div>:<div className="pg-strip">
      {photos.map((p,i)=><div className="pg-tile" key={p.id}>
        <button type="button" className="pg-open" onClick={()=>setSelected(i)} aria-label={'تكبير الصورة '+(i+1)}><img src={p.url} alt={'صورة من الملف '+(i+1)} loading="lazy"/><span>0{i+1}</span></button>
        {editable&&(remove===p.id?<div className="pg-delete-confirm"><span>حذف الصورة؟</span><button disabled={busy} onClick={()=>void erase(p)}>حذف</button><button onClick={()=>setRemove(null)}>تراجع</button></div>:<button className="pg-remove" disabled={busy} aria-label={'حذف الصورة '+(i+1)} onClick={()=>setRemove(p.id)}><Trash2 size={15}/></button>)}
      </div>)}
      {editable&&photos.length<3&&<button className="pg-add" disabled={busy} onClick={()=>input.current?.click()}><span>{busy?<LoaderCircle className="pg-spin"/>:<ImagePlus/>}</span><strong>{busy?'جارٍ الرفع…':'أضف صورة'}</strong><small>لحظة · هواية · مكان تحبّه</small></button>}
    </div>}
    {editable&&<input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0])}/>}
    {editable&&<><small className="pg-format-note">JPG، PNG، WebP · حتى ١٢ ميغابايت قبل التجهيز · تُحذف بيانات الموقع من الصورة المرفوعة.</small><HelpButton topic="profile" label="من يستطيع رؤية صوري؟"/></>}
    {error&&<p className="pg-error" role="alert">{error}<button className="btn-text" onClick={()=>setRefresh(n=>n+1)}>إعادة المحاولة</button></p>}
    <dialog ref={dialog} className="pg-lightbox" aria-label="عرض الصورة" onCancel={e=>{e.preventDefault();setSelected(null);}}>
      <button className="pg-close" onClick={()=>setSelected(null)} aria-label="إغلاق الصورة"><X/></button>
      {selected!==null&&photos[selected]&&<img key={photos[selected].id} src={photos[selected].url} alt={'صورة الملف '+(selected+1)}/>}
      <div className="pg-lightbox-controls"><button disabled={selected===0} aria-label="الصورة السابقة" onClick={()=>setSelected(i=>Math.max(0,(i??0)-1))}><ChevronRight/></button><span>{(selected??0)+1} / {photos.length}</span><button disabled={selected===photos.length-1} aria-label="الصورة التالية" onClick={()=>setSelected(i=>Math.min(photos.length-1,(i??0)+1))}><ChevronLeft/></button></div>
    </dialog>
  </section>;
}
