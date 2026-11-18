export const testMediaLimit = 8 * 1024 * 1024;
export function validateTestMedia(bytes: Uint8Array, supplied: string, durationMs?: string | null) {
 const mime=supplied.split(';')[0].trim().toLowerCase();
 const text=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
 const prefix=(v:number[])=>v.every((n,i)=>bytes[i]===n);
 const valid=(mime==='image/jpeg'&&prefix([255,216,255]))||
  (mime==='image/png'&&prefix([137,80,78,71,13,10,26,10]))||
  (mime==='image/webp'&&text(0,4)==='RIFF'&&text(8,12)==='WEBP')||
  (mime==='audio/webm'&&prefix([0x1a,0x45,0xdf,0xa3]))||
  (mime==='audio/mp4'&&text(4,8)==='ftyp')||
  (mime==='audio/ogg'&&text(0,4)==='OggS')||
  (mime==='audio/wav'&&text(0,4)==='RIFF'&&text(8,12)==='WAVE');
 if(!valid||bytes.length<12||bytes.length>testMediaLimit)throw Error('نوع الملف غير مدعوم أو حجمه أكبر من ٨ ميجابايت.');
 const duration=durationMs ? Number(durationMs)/1000 : undefined;
 if(duration!==undefined&&(!Number.isFinite(duration)||duration<0||duration>60))throw Error('مدة الرسالة الصوتية القصوى دقيقة واحدة.');
 return {mime,size:bytes.length,...(mime.startsWith('audio/')&&duration!==undefined?{duration}:{})};
}

// Validate the complete private object before committing a one-time claim.
export async function validateOncePhoto(blob: Blob, mime: string, size: number) {
 if (!mime.startsWith('image/') || blob.type.split(';')[0] !== mime || blob.size !== size || size > testMediaLimit) {
  throw Error('تعذّر تحميل الصورة كاملة. حاول مجددًا.');
 }
 validateTestMedia(new Uint8Array(await blob.arrayBuffer()), mime);
}
