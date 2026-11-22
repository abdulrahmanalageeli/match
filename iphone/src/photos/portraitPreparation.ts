import { blurPixels } from './portraitBlur';
import type { ProfilePortrait, PortraitRevealPolicy } from '../types';
export { blurPixels } from './portraitBlur';
export type PortraitStage = { id: string; status: 'uploaded' | 'ready' | 'verified' | 'moderation' | 'approved' | 'rejected'; portrait: ProfilePortrait };
export type PortraitDraft = { blob: Blob; url: string; blur: number; revealPolicy: PortraitRevealPolicy; clearBlob?: Blob; staged?: PortraitStage; framing?: {file:File; crop:PortraitCrop} };

export async function blurPortraitPixels(data: Uint8ClampedArray,width:number,height:number,radius:number):Promise<void> {
  if (!radius) return;
  let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  try {
    if(typeof Worker==='undefined')throw Error('worker_unavailable');
    worker=new Worker(new URL('./portraitBlur.worker.ts',import.meta.url),{type:'module'});
    const pixels=await new Promise<ArrayBuffer>((resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('worker_timeout')),5000);
      worker!.onmessage=(event:MessageEvent<unknown>)=>{
        if(!(event.data instanceof ArrayBuffer)||event.data.byteLength!==data.byteLength)reject(Error('invalid_blur_result'));
        else resolve(event.data);
      };
      worker!.onerror=event=>{event.preventDefault();reject(Error('worker_failed'));};
      worker!.onmessageerror=()=>reject(Error('worker_message_failed'));
      // Transfer a copy so an unavailable/failed worker can never lose the
      // source pixels or cause a silently unblurred upload on the fallback.
      const input=data.slice().buffer;
      worker!.postMessage({pixels:input,width,height,radius},[input]);
    });
    data.set(new Uint8ClampedArray(pixels));
  } catch {
    clearTimeout(timer);worker?.terminate();worker=undefined;
    // Older/restricted webviews retain the exact same pixel-level privacy.
    await new Promise<void>(resolve=>setTimeout(resolve,0));
    blurPixels(data,width,height,radius);
  } finally {
    clearTimeout(timer);worker?.terminate();
  }
}

export type PortraitCrop = { x: number; y: number; zoom: number };
export const initialPortraitCrop: PortraitCrop = { x: .5, y: .35, zoom: 1 };

export function matchesPortraitCrop(draft: PortraitDraft | null | undefined, file: File, crop: PortraitCrop) {
  const prior = draft?.framing;
  return prior?.file === file && prior.crop.x === crop.x && prior.crop.y === crop.y && prior.crop.zoom === crop.zoom;
}

export function portraitCropRect(width: number, height: number, crop: PortraitCrop) {
  const w = Math.min(width, height * .8) / crop.zoom;
  const h = w / .8;
  return { x: (width - w) * crop.x, y: (height - h) * crop.y, w, h };
}

export function validatePortraitFile(file: File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('اختاري صورة JPG أو PNG أو WebP.');
  if (file.size > 12 * 1024 * 1024) throw Error('اختاري صورة أصغر من ١٢ ميغابايت.');
}

export function validatePortraitDimensions(w: number, h: number) {
  if (!w || !h || w*h>40_000_000 || Math.max(w,h)>12000) throw Error('اختر نسخة أصغر من الصورة.');
}

export async function preparePortrait(file: File, blur: number, revealPolicy: PortraitRevealPolicy = 'never', crop = initialPortraitCrop): Promise<PortraitDraft> {
  validatePortraitFile(file);
  if (!Number.isInteger(blur) || blur < 0 || blur > 100) throw Error('راجعي درجة التمويه.');
  if (!['never','matched','serious','family'].includes(revealPolicy)) throw Error('اختاري موعدًا صحيحًا لإزالة التمويه.');
  // An already-clear public image needs no separately retained clear copy.
  const policy = blur > 0 ? revealPolicy : 'never';
  const original = URL.createObjectURL(file), image = new Image();
  try {
    image.src = original; await image.decode();
    const w=image.naturalWidth,h=image.naturalHeight;
    validatePortraitDimensions(w,h);
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=800;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('تعذّر تجهيز الصورة.');
    ctx.fillStyle='#faf6ee';ctx.fillRect(0,0,640,800);
    const rect = portraitCropRect(w,h,crop);
    ctx.drawImage(image,rect.x,rect.y,rect.w,rect.h,0,0,640,800);
    const encode = () => new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
    const clearBlob = policy !== 'never' ? await encode() : undefined;
    if (policy !== 'never' && !clearBlob) throw Error('تعذّر تجهيز النسخة الواضحة. أعيدي اختيار الصورة.');
    if(blur){const pixels=ctx.getImageData(0,0,640,800);await blurPortraitPixels(pixels.data,640,800,Math.max(1,Math.round(blur*.3)));ctx.putImageData(pixels,0,0);}
    const blob=await encode();
    canvas.width=0;canvas.height=0;if(!blob)throw Error('تعذّر تجهيز الصورة.');
    // Framing stays in this open form. Staging uploads only the prepared JPEGs.
    return {blob,blur,revealPolicy:policy,...(clearBlob ? {clearBlob} : {}),url:URL.createObjectURL(blob),framing:{file,crop}};
  } finally {image.src='';URL.revokeObjectURL(original);}
}
