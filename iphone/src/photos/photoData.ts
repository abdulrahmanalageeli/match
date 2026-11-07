import { callRpc, cloud, cloudSessionId } from "../cloud";

export type Photo = { id: string; path: string; expiresAt?: string };
export type PhotoState = { mine: Photo | null; peer: Photo | null; sharedUntil: string | null };
export const emptyPhotos: PhotoState = { mine: null, peer: null, sharedUntil: null };
const bucket = "nisfayn-private-photos";

export async function photoOwner(expected?: string) {
  const id = await cloudSessionId();
  if (!id || expected && id !== expected) throw new Error("انتهت الجلسة. سجّل الدخول مجددًا.");
  return id;
}
export async function photoState(owner: string, requestId?: string, signal?: AbortSignal) {
  return callRpc<PhotoState>("marriage_photo_state", { request_id: requestId ?? null }, owner, signal);
}
export async function loadPhoto(owner: string, photo: Photo, signal: AbortSignal) {
  await photoOwner(owner);
  if (!cloud) throw new Error("خدمة الصور غير متاحة.");
  const { data, error } = await cloud.storage.from(bucket).download(photo.path, { cacheNonce: crypto.randomUUID() }, { cache: "no-store", signal });
  if (error || !data) throw new Error("لم تعد الصورة متاحة. حدّث الصفحة.");
  await photoOwner(owner);
  return data;
}

// A fresh canvas export drops EXIF/GPS and original filenames before uploading.
export async function preparePhoto(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("اختر صورة JPG أو PNG أو WebP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("حجم الصورة كبير. اختر صورة أصغر من ١٢ ميغابايت.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > 40_000_000 || Math.max(width, height) > 12000) throw new Error("اختر نسخة أصغر من الصورة.");
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذّر تجهيز الصورة.");
    context.fillStyle = "#FAF6EE"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .84));
    canvas.width = 0; canvas.height = 0;
    if (!blob || blob.size > 3 * 1024 * 1024) throw new Error("اختر صورة أصغر حجمًا.");
    return blob;
  } catch (error) {
    if (error instanceof Error && /[\u0600-\u06ff]/.test(error.message)) throw error;
    throw new Error("تعذّرت قراءة الصورة. جرّب صورة أخرى.");
  } finally { image.src = ""; URL.revokeObjectURL(url); }
}
export async function uploadPhoto(owner: string, blob: Blob) {
  await photoOwner(owner);
  if (!cloud) throw new Error("خدمة الصور غير متاحة.");
  const photo = await callRpc<Photo>("marriage_photo_prepare", {}, owner);
  const { error } = await cloud.storage.from(bucket).upload(photo.path, blob, { upsert: false, contentType: "image/jpeg", cacheControl: "0" });
  if (error) throw new Error("تعذّر رفع الصورة. حاول مجددًا.");
  return callRpc<PhotoState>("marriage_photo_commit", { photo_id: photo.id }, owner);
}
export async function removePhoto(owner: string) {
  const paths = await callRpc<string[]>("marriage_photo_remove", {}, owner);
  // Metadata revocation is immediate. The server cleanup queue retries blob deletion.
  if (paths.length && cloud) await cloud.storage.from(bucket).remove(paths);
}
export async function sharePhoto(owner: string, requestId: string, share: boolean) {
  return callRpc<PhotoState>("marriage_photo_share", { request_id: requestId, share }, owner);
}
