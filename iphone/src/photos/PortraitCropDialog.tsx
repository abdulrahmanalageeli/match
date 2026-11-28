import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
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
type Point = {x:number; y:number};

function measurePointers(points: Map<number, Point>) {
  const [a,b] = points.values();
  return b ? {x:(a.x+b.x)/2, y:(a.y+b.y)/2, span:Math.hypot(a.x-b.x,a.y-b.y)} : {...a, span:0};
}

export function PortraitCropDialog({ file, initialCrop = initialPortraitCrop, apply, cancel }: { file: File; initialCrop?: PortraitCrop; apply: (crop: PortraitCrop) => void; cancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const anchor = useRef<{x:number; y:number; span:number; crop:PortraitCrop} | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [crop, commitCrop] = useState(initialCrop);
  const currentCrop = useRef(initialCrop);
  function setCrop(next: PortraitCrop) { currentCrop.current = next; commitCrop(next); }
  function reanchor() {
    anchor.current = pointers.current.size ? {...measurePointers(pointers.current), crop:currentCrop.current} : null;
  }
  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    if (pointers.current.delete(event.pointerId)) reanchor();
  }
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
      <p>حرّك الصورة لضبط الإطار، وباعد بين إصبعين للتكبير.</p>
      <div className="portrait-crop-stage" tabIndex={0} role="group" aria-label="موضع الصورة، استخدم مفاتيح الأسهم"
        onPointerDown={e => {
          if (e.button !== 0 || pointers.current.size >= 2) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, {x:e.clientX, y:e.clientY});
          reanchor();
        }}
        onPointerUp={finishPointer} onPointerCancel={finishPointer} onLostPointerCapture={finishPointer}
        onPointerMove={e => {
          const start = anchor.current;
          if (!start || !pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, {x:e.clientX, y:e.clientY});
          const point = measurePointers(pointers.current);
          const zoom = start.span > 0 ? Math.max(1, Math.min(2.5, start.crop.zoom * point.span / start.span)) : start.crop.zoom;
          const stage = e.currentTarget.getBoundingClientRect();
          if (!stage.width || !stage.height) return;
          const {naturalWidth:w, naturalHeight:h} = image;
          const before = portraitCropRect(w,h,start.crop);
          const after = portraitCropRect(w,h,{...start.crop,zoom});
          // Keep the same source pixel under the fingertips as they move apart or pan.
          const x = before.x + ((start.x-stage.left)*before.w - (point.x-stage.left)*after.w) / stage.width;
          const y = before.y + ((start.y-stage.top)*before.h - (point.y-stage.top)*after.h) / stage.height;
          setCrop({zoom, x:w > after.w ? clamp(x / (w-after.w)) : start.crop.x,
            y:h > after.h ? clamp(y / (h-after.h)) : start.crop.y});
        }}
        onKeyDown={e => {
          const offsets: Record<string, [number, number]> = {ArrowRight:[-.05,0], ArrowLeft:[.05,0], ArrowUp:[0,.05], ArrowDown:[0,-.05]};
          const offset = offsets[e.key];
          if (offset) { e.preventDefault(); setCrop({...crop, x:clamp(crop.x+offset[0]), y:clamp(crop.y+offset[1])}); }
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
