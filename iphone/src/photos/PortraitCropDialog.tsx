import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { initialPortraitCrop, portraitCropRect, validatePortraitDimensions, validatePortraitFile, type PortraitCrop } from './portraitPreparation';
import './portrait-crop.css';

function CropPreview({ image, crop }: { image: HTMLImageElement; crop: PortraitCrop }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const rect = portraitCropRect(image.naturalWidth, image.naturalHeight, crop);
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#faf6ee';
    ctx.fillRect(0, 0, 320, 400);
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, 320, 400);
  }, [image, crop]);
  return <canvas ref={canvas} width={320} height={400} aria-hidden="true"/>;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function PortraitCropDialog({ file, initialCrop = initialPortraitCrop, apply, cancel }: { file: File; initialCrop?: PortraitCrop; apply: (crop: PortraitCrop) => void; cancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; crop: PortraitCrop } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [crop, setCrop] = useState(initialCrop);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    let live = true, url: string | undefined;
    async function load() {
      try {
        validatePortraitFile(file);
        const photo = new Image();
        url = URL.createObjectURL(file);
        photo.src = url;
        await photo.decode();
        validatePortraitDimensions(photo.naturalWidth, photo.naturalHeight);
        if (live) setImage(photo);
      } catch (e) {
        if (live) setError(e instanceof Error && /[\u0600-\u06ff]/.test(e.message) ? e.message : 'تعذّرت قراءة الصورة.');
      }
    }
    void load();
    return () => { live = false; node?.close(); if (url) URL.revokeObjectURL(url); };
  }, [file]);

  return <dialog ref={dialog} className="portrait-crop" aria-label="ضبط إطار الصورة" dir="rtl" onCancel={e => {e.preventDefault(); cancel();}}>
    <h2>ضبط إطار الصورة</h2>
    {image && <>
      <p>حرّك الصورة ليظهر وجهك داخل الإطار. هذا هو القصّ المستخدم في ملفك.</p>
      <div className="portrait-crop-stage" tabIndex={0} role="group" aria-label="موضع الصورة، استخدم مفاتيح الأسهم"
        onPointerDown={e => {
          if (!e.isPrimary || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {id:e.pointerId, x:e.clientX, y:e.clientY, crop};
        }}
        onLostPointerCapture={() => {drag.current = null;}}
        onPointerMove={e => {
          const start = drag.current;
          if (!start || start.id !== e.pointerId) return;
          const rect = portraitCropRect(image.naturalWidth, image.naturalHeight, start.crop);
          const scale = e.currentTarget.clientWidth / rect.w;
          const dx = (image.naturalWidth - rect.w) * scale, dy = (image.naturalHeight - rect.h) * scale;
          setCrop({...start.crop, x:dx > 0 ? clamp(start.crop.x - (e.clientX-start.x)/dx) : start.crop.x,
            y:dy > 0 ? clamp(start.crop.y - (e.clientY-start.y)/dy) : start.crop.y});
        }}
        onKeyDown={e => {
          const offsets: Record<string, [number, number]> = {ArrowRight:[-.05,0], ArrowLeft:[.05,0], ArrowUp:[0,.05], ArrowDown:[0,-.05]};
          const offset = offsets[e.key];
          if (offset) { e.preventDefault(); setCrop(c => ({...c, x:clamp(c.x+offset[0]), y:clamp(c.y+offset[1])})); }
        }}>
        <CropPreview image={image} crop={crop}/>
      </div>
      <label className="portrait-crop-zoom">التكبير<input type="range" min="1" max="2.5" step=".05" value={crop.zoom} aria-valuetext={new Intl.NumberFormat('ar-SA',{style:'percent'}).format(crop.zoom)} onChange={e => setCrop({...crop, zoom:Number(e.target.value)})}/><output>{new Intl.NumberFormat('ar-SA',{style:'percent'}).format(crop.zoom)}</output></label>
      <div className="portrait-crop-previews">
        <figure><CropPreview image={image} crop={crop}/><figcaption>الملف الشخصي</figcaption></figure>
        <figure><CropPreview image={image} crop={crop}/><figcaption>الصورة المصغّرة</figcaption></figure>
      </div>
    </>}
    {error ? <p role="alert">{error}</p> : !image && <p role="status">جارٍ فتح الصورة…</p>}
    <div className="portrait-crop-actions"><button type="button" className="btn-primary" disabled={!image} onClick={() => apply(crop)}>اعتماد الإطار</button><button type="button" className="btn-secondary" onClick={cancel}>إلغاء</button></div>
  </dialog>;
}
