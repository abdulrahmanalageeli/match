import { Capacitor, registerPlugin } from '@capacitor/core';

const viewer = registerPlugin<{
  available(): Promise<{ available: boolean }>;
  show(options: { data: string }): Promise<void>;
  close(): Promise<void>;
}>('PrivatePhoto');

export const nativePrivatePhoto = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

// Check before redeeming the one-time download. Unsupported platforms and old
// native builds must not consume a photo or fall back to the HTML viewer.
export async function preparePrivatePhoto() {
  if (!nativePrivatePhoto()) throw Error('افتح هذه الصورة في تطبيق وُدَين على الآيفون. لن تُحتسب المشاهدة هنا.');
  if (!Capacitor.isPluginAvailable('PrivatePhoto')) throw Error('حدّث تطبيق وُدَين من TestFlight لفتح الصور لمرة واحدة بأمان.');
  if (!(await viewer.available()).available) throw Error('أوقف تسجيل الشاشة أو مشاركتها، ثم حاول مجددًا.');
}

export async function showPrivatePhoto(url: string, stillValid: () => boolean) {
  const response = await fetch(url);
  const blob = await response.blob();
  if (!response.ok || blob.type !== 'image/jpeg' || blob.size > 8 * 1024 * 1024) throw Error('تعذّر فتح الصورة.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(Error('تعذّر فتح الصورة.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
  if (document.hidden || !stillValid()) return;
  await viewer.show({ data });
}

export function closePrivatePhoto() {
  if (nativePrivatePhoto() && Capacitor.isPluginAvailable('PrivatePhoto')) void viewer.close().catch(() => {});
}
