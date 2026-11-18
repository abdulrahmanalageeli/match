import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, Trash2, X } from "../BrandIcons";
import type { CommunitySource, GalleryPhoto } from '../community/data';
import { preparePhoto } from './photoData';
import './gallery.css';
import { SuccessNotice } from '../community/SuccessNotice';
import { HelpButton } from '../help/HelpCenter';

type ImageItem = GalleryPhoto & { url: string };
export function ProfileGallery({ source, subject, name, editable = false, onChanged }: { source: CommunitySource; subject?: string; name?: string; editable?: boolean; onChanged?:()=>void }) {
  const [album, setAlbum] = useState<{source: CommunitySource; subject?: string; items: ImageItem[]} | null>(null);
  const photos = album?.source === source && album.subject === subject ? album.items : [];
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved,setSaved]=useState<'added'|'removed'|null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = photos.findIndex(photo => photo.id === selectedId);
  const [remove, setRemove] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!source.gallery || !source.galleryUrl) return;
    const listGallery = source.gallery, download = source.galleryUrl;
    let live = true, generation = 0, pending = false, again = false;
    let current: ImageItem[] = [];
    const revoke = (item: ImageItem) => { if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url); };
    function clear() {
      current.forEach(revoke);
      current = [];
      if (live) { setAlbum(null); setSelectedId(null); }
    }
    async function check() {
      if (!live || document.hidden) return;
      if (pending) { again = true; return; }
      pending = true;
      const revision = generation;
      const valid = () => live && revision === generation && !document.hidden;
      const fresh: ImageItem[] = [];
      try {
        const list = (await listGallery(subject)).slice(0,3);
        if (!valid()) return;
        const retained = current.filter(item => list.some(p => p.id === item.id && p.path === item.path));
        if (retained.length !== current.length) {
          current.filter(item => !retained.includes(item)).forEach(revoke);
          current = retained;
          setAlbum({source, subject, items: retained});
          setSelectedId(id => retained.some(p => p.id === id) ? id : null);
        }
        // Only new or replaced photos require bytes. Recheck access even when the lightbox is open.
        for (const photo of list) {
          if (retained.some(p => p.id === photo.id)) continue;
          fresh.push({...photo, url: await download(photo)});
          if (!valid()) return;
        }
        const available = [...retained, ...fresh];
        const ordered = list.map(photo => available.find(p => p.id === photo.id)!);
        if (ordered.some((p,i) => p !== current[i])) {
          current = ordered;
          setAlbum({source, subject, items: ordered});
        }
        fresh.length = 0;
        setError('');
      } catch {
        if (valid()) { clear(); setError('تعذّر تحميل المعرض. حاول مجددًا.'); }
      } finally {
        fresh.forEach(revoke); pending = false;
        if (valid()) setLoading(false);
        if (again) { again = false; void check(); }
      }
    }
    function visibility() {
      if (document.hidden) { generation++; clear(); }
      else void check();
    }
    setLoading(true); setError(''); setAlbum(null); setSelectedId(null);
    void check();
    const stop = source.watch(() => { generation++; void check(); });
    const timer = window.setInterval(check, 15000);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      live = false; generation++; clear(); stop(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [source, subject, refresh]);
  useEffect(()=>{if(selected>=0)dialog.current?.showModal();else dialog.current?.close();},[selected]);
  async function upload(file?: File) {
    if(!file||busy||!source.addGallery)return;setBusy(true);setError('');
    try {await source.addGallery(await preparePhoto(file));setRefresh(n=>n+1);setSaved('added');if(editable)onChanged?.();}catch(e){setError(e instanceof Error?e.message:'تعذّر رفع الصورة.');}finally{setBusy(false);if(input.current)input.current.value='';}
  }
  async function erase(photo: GalleryPhoto) {
    if(busy||!source.removeGallery)return;setBusy(true);setError('');
    try{await source.removeGallery(photo);setRemove(null);setRefresh(n=>n+1);setSaved('removed');if(editable)onChanged?.();}catch(e){setError(e instanceof Error?e.message:'تعذّر حذف الصورة.');}finally{setBusy(false);}
  }
  if(!source.gallery||!source.galleryUrl||(!editable&&!photos.length&&!loading&&!error))return null;
  return <section className="pg-section" aria-label={editable?'معرض ملفي':'معرض الصور'}>
    <header className="pg-heading"><div><span className="df-section-eyebrow">{editable?'لمحات تعبّر عنك':'من عالم '+(name||'الشخص')}</span><h2>{editable?'معرض ملفي':'حياة وراء الكلمات'}</h2></div>{(editable||photos.length>0)&&<span><Camera size={16}/>{editable?`${photos.length} / 3`:['','صورة واحدة','صورتان','٣ صور'][photos.length]}</span>}</header>
    {editable&&<p className="pg-caption">حتى ثلاث صور إضافية تظهر في ملفك للأعضاء المؤهلين لعرضه. إضافة الصور اختيارية، وتختلف عن الصور الخاصة داخل المحادثة. إضافة صورة إلى ملف معتمد تُحسب ضمن تعديله المتاح مرة كل ٣٠ يومًا وتحتاج مراجعة. يمكنك حذف الصور في أي وقت.</p>}
    {saved&&<SuccessNotice key={saved+refresh} title={saved==='added'?'لمحة جديدة في ملفك':'أُزيلت الصورة من المعرض'} detail={saved==='added'?'حُفظت صورتك، وتظهر للأعضاء المؤهلين بعد اعتماد مراجعة الملف.':'الصور المرسلة سابقًا داخل المحادثات لا تتأثر.'} quiet={saved==='removed'} close={()=>setSaved(null)}/>}
    {loading&&!photos.length?<div className="pg-loading" role="status"><LoaderCircle size={20}/> تحميل المعرض</div>:<div className="pg-strip">
      {photos.map((p,i)=><div className="pg-tile" key={p.id}>
        <button type="button" className="pg-open" onClick={()=>setSelectedId(p.id)} aria-label={'تكبير الصورة '+(i+1)}><img src={p.url} alt={'صورة من الملف '+(i+1)} loading="lazy"/><span>0{i+1}</span></button>
        {editable&&(remove===p.id?<div className="pg-delete-confirm"><span>حذف الصورة؟</span><button disabled={busy} onClick={()=>void erase(p)}>حذف</button><button onClick={()=>setRemove(null)}>تراجع</button></div>:<button className="pg-remove" disabled={busy} aria-label={'حذف الصورة '+(i+1)} onClick={()=>setRemove(p.id)}><Trash2 size={15}/></button>)}
      </div>)}
      {editable&&photos.length<3&&<button className="pg-add" disabled={busy} onClick={()=>input.current?.click()}><span>{busy?<LoaderCircle className="pg-spin"/>:<ImagePlus/>}</span><strong>{busy?'جارٍ الرفع…':'أضف صورة'}</strong><small>لحظة · هواية · مكان تحبّه</small></button>}
    </div>}
    {editable&&<input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0])}/>}
    {editable&&<><small className="pg-format-note">JPG، PNG، WebP · حتى ١٢ ميغابايت قبل التجهيز · تُحذف بيانات الموقع من الصورة المرفوعة.</small><HelpButton topic="profile" label="من يستطيع رؤية صوري؟"/></>}
    {error&&<p className="pg-error" role="alert">{error}<button className="btn-text" onClick={()=>setRefresh(n=>n+1)}>إعادة المحاولة</button></p>}
    <dialog ref={dialog} className="pg-lightbox" aria-label="عرض الصورة" onCancel={e=>{e.preventDefault();setSelectedId(null);}}>
      <button className="pg-close" onClick={()=>setSelectedId(null)} aria-label="إغلاق الصورة"><X/></button>
      {selected>=0&&<img key={photos[selected].id} src={photos[selected].url} alt={'صورة الملف '+(selected+1)}/>}
      <div className="pg-lightbox-controls"><button disabled={selected<=0} aria-label="الصورة السابقة" onClick={()=>setSelectedId(photos[selected-1].id)}><ChevronRight/></button><span>{selected+1} / {photos.length}</span><button disabled={selected<0||selected===photos.length-1} aria-label="الصورة التالية" onClick={()=>setSelectedId(photos[selected+1].id)}><ChevronLeft/></button></div>
    </dialog>
  </section>;
}
