import { validateTestMedia } from './test-media.ts';

export const portraitLimit = 3 * 1024 * 1024;
export const portraitRequestLimit = portraitLimit * 2 + 65536;
export const portraitPolicies = ['never', 'matched', 'serious', 'family'] as const;

/** Only an explicit reveal choice accepts a second, normalized JPEG. */
export async function parsePortraitUpload(bytes: Uint8Array, contentType: string, blur: number, policy: string) {
  if (!portraitPolicies.includes(policy as typeof portraitPolicies[number]) || !Number.isInteger(blur) || blur < 0 || blur > 100)
    throw Error('راجعي إعدادات تمويه الصورة.');
  if (policy !== 'never' && blur === 0) throw Error('الصورة واضحة بالفعل. اختاري التمويه قبل تفعيل الكشف التلقائي.');
  let blurred: Uint8Array, clear: Uint8Array | undefined;
  if (contentType.toLowerCase().startsWith('multipart/form-data;')) {
    if (bytes.length > portraitRequestLimit) throw Error('حجم الصور أكبر من الحد المسموح.');
    const form = await new Response(bytes.slice().buffer as ArrayBuffer, { headers: { 'Content-Type': contentType } }).formData();
    if ([...form.keys()].some(key => !['blurred', 'clear'].includes(key)) || form.getAll('blurred').length !== 1 || form.getAll('clear').length > 1)
      throw Error('ملفات الصورة غير صالحة.');
    const read = async (name: string) => {
      const item = form.get(name);
      if (!(item instanceof Blob) || item.type !== 'image/jpeg' || !item.size || item.size > portraitLimit)
        throw Error('استخدمي صور JPEG بحجم لا يتجاوز ٣ ميغابايت للصورة.');
      return new Uint8Array(await item.arrayBuffer());
    };
    blurred = await read('blurred');
    if (policy === 'never' && form.has('clear')) throw Error('لم يُسمح بحفظ نسخة واضحة لهذه الصورة.');
    if (policy !== 'never') clear = await read('clear');
  } else {
    if (contentType.split(';')[0].trim().toLowerCase() !== 'image/jpeg' || policy !== 'never') throw Error('أعيدي اختيار الصورة لتجهيز نسختي التمويه والكشف.');
    blurred = bytes;
  }
  for (const image of [blurred, clear]) if (image) {
    if (image.length > portraitLimit) throw Error('حجم الصورة أكبر من ٣ ميغابايت.');
    validateTestMedia(image, 'image/jpeg');
  }
  return { blurred, clear };
}
