import { cloud } from '../cloud';
import type { ProfilePortrait } from '../types';
import type { PortraitDraft, PortraitStage } from './portraitPreparation';
import { captureForPhoto, verifyUploadedPhoto } from './verifyPhoto';

async function stageAction(id: string, action: string) {
  if (!cloud) throw Error('خدمة الصور غير متاحة.');
  const result = await cloud.rpc('marriage_portrait_stage_action', { photo: id, action });
  if (result.error) throw Error(/[\u0600-\u06ff]/.test(result.error.message) ? result.error.message : 'تعذّر تجهيز الصورة. حاول مجددًا.');
  return result.data;
}

/** Upload once, without publishing. Keep the receipt even if camera matching fails. */
export async function stageOnboardingPortrait(draft: PortraitDraft, gender: 'man' | 'woman', consented: boolean): Promise<PortraitDraft> {
  if (!cloud || !consented) throw Error('وافق على استخدام صورتك أولًا.');
  if (draft.staged) return draft;
  const prepared = await cloud.rpc('marriage_portrait_stage_prepare', { blur_level: draft.blur, policy: draft.revealPolicy, gender, photo_consent: true });
  if (prepared.error || !prepared.data) throw Error('تعذّر تجهيز رفع الصورة. حاول مجددًا.');
  const photo = prepared.data as ProfilePortrait & { clearPath?: string };
  try {
    const uploaded = await cloud.storage.from('nisfayn-profile-portraits').upload(photo.path, draft.blob, { contentType: 'image/jpeg', upsert: false });
    if (uploaded.error) throw uploaded.error;
    if (draft.clearBlob && photo.clearPath) {
      const clear = await cloud.storage.from('nisfayn-profile-portraits').upload(photo.clearPath, draft.clearBlob, { contentType: 'image/jpeg', upsert: false });
      if (clear.error) throw clear.error;
    }
    return { ...draft, staged: await stageAction(photo.id, 'uploaded') as PortraitStage };
  } catch {
    await cloud.rpc('marriage_photo_discard', { photo: photo.id, photo_kind: 'portrait' });
    throw Error('لم يكتمل رفع الصورة. حاول مجددًا.');
  }
}

export async function retryStagedPortrait(draft: PortraitDraft): Promise<PortraitDraft> {
  if (!draft.staged) throw Error('اختر صورتك مجددًا.');
  const selfie = await captureForPhoto(true, draft.staged.id);
  await verifyUploadedPhoto(draft.staged.id, 'portrait', selfie, true);
  return { ...draft, staged: await stageAction(draft.staged.id, 'status') as PortraitStage };
}
export async function requestPortraitModeration(draft: PortraitDraft): Promise<PortraitDraft> {
  if (!draft.staged) throw Error('اختر صورتك مجددًا.');
  return { ...draft, staged: await stageAction(draft.staged.id, 'moderation') as PortraitStage };
}
export async function finalizeStagedPortrait(draft: PortraitDraft): Promise<ProfilePortrait | null> {
  if (!draft.staged) throw Error('أكمل تجهيز الصورة أولًا.');
  return await stageAction(draft.staged.id, 'finalize') as ProfilePortrait | null;
}
export async function discardStagedPortrait(draft: PortraitDraft | null | undefined): Promise<void> {
  if (draft?.staged && cloud) await cloud.rpc('marriage_photo_discard', { photo: draft.staged.id, photo_kind: 'portrait' });
}

/** Recover an interrupted application without another upload or camera match. */
export async function resumeStagedPortrait(): Promise<PortraitDraft | null> {
  if (!cloud) return null;
  const result = await cloud.rpc('marriage_portrait_stage_resume');
  if (result.error) throw Error('تعذّر استعادة صورتك. حاول مجددًا.');
  if (!result.data) return null;
  const stage = result.data as PortraitStage & { clearPath?: string | null };
  const file = await cloud.storage.from('nisfayn-profile-portraits').download(stage.portrait.path);
  if (file.error || !file.data) throw Error('تعذّر استعادة صورتك. حاول مجددًا.');
  let clearBlob: Blob | undefined;
  if (stage.clearPath) {
    const clear = await cloud.storage.from('nisfayn-profile-portraits').download(stage.clearPath);
    if (clear.error || !clear.data) throw Error('تعذّر استعادة النسخة الخاصة. حاول مجددًا.');
    clearBlob = clear.data;
  }
  return { blob: file.data, url: URL.createObjectURL(file.data), blur: stage.portrait.blur, revealPolicy: stage.portrait.revealPolicy || 'never', ...(clearBlob ? { clearBlob } : {}), staged: { id: stage.id, status: stage.status, portrait: stage.portrait } };
}
