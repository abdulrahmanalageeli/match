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
