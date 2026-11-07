import { blurPixels } from './portraitBlur';
import type { PortraitRevealPolicy } from '../types';
export { blurPixels } from './portraitBlur';
export type PortraitDraft = { blob: Blob; url: string; blur: number; revealPolicy: PortraitRevealPolicy; clearBlob?: Blob };

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

export async function preparePortrait(file: File, blur: number, revealPolicy: PortraitRevealPolicy = 'never'): Promise<PortraitDraft> {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('اختاري صورة JPG أو PNG أو WebP.');
  if (file.size > 12 * 1024 * 1024) throw Error('اختاري صورة أصغر من ١٢ ميغابايت.');
  if (!Number.isInteger(blur) || blur < 0 || blur > 100) throw Error('راجعي درجة التمويه.');
  if (!['never','matched','serious','family'].includes(revealPolicy)) throw Error('اختاري موعدًا صحيحًا لإزالة التمويه.');
  // An already-clear public image needs no separately retained clear copy.
  const policy = blur > 0 ? revealPolicy : 'never';
  const original = URL.createObjectURL(file), image = new Image();
  try {
    image.src = original; await image.decode();
    const w=image.naturalWidth,h=image.naturalHeight;
    if (!w||!h||w*h>40_000_000||Math.max(w,h)>12000) throw Error('اختاري نسخة أصغر من الصورة.');
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=800;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('تعذّر تجهيز الصورة.');
    ctx.fillStyle='#faf6ee';ctx.fillRect(0,0,640,800);
    const cw=Math.min(w,h*.8),ch=cw/ .8;
    ctx.drawImage(image,(w-cw)/2,(h-ch)*.35,cw,ch,0,0,640,800);
    const encode = () => new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
    const clearBlob = policy !== 'never' ? await encode() : undefined;
    if (policy !== 'never' && !clearBlob) throw Error('تعذّر تجهيز النسخة الواضحة. أعيدي اختيار الصورة.');
    if(blur){const pixels=ctx.getImageData(0,0,640,800);await blurPortraitPixels(pixels.data,640,800,Math.max(1,Math.round(blur*.3)));ctx.putImageData(pixels,0,0);}
    const blob=await encode();
    canvas.width=0;canvas.height=0;if(!blob)throw Error('تعذّر تجهيز الصورة.');
    return {blob,blur,revealPolicy:policy,...(clearBlob ? {clearBlob} : {}),url:URL.createObjectURL(blob)};
  } finally {image.src='';URL.revokeObjectURL(original);}
}
