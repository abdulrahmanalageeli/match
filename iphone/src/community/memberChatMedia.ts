import { cloud, cloudSessionId } from '../cloud';
import { marriageProjectUrl, marriagePublishableKey } from '../deployment';
import type { CommunitySource } from './data';

export function memberChatMediaSource(owner: string): Pick<CommunitySource, 'sendMedia' | 'mediaUrl' | 'openMedia'> {
  async function request(action: 'upload' | 'download', body: BodyInit, headers: Record<string,string> = {}) {
    if (!cloud || await cloudSessionId() !== owner) throw Error('يرجى تسجيل الدخول مجددًا.');
    const { data: { session } } = await cloud.auth.getSession();
    if (!session || session.user.id !== owner) throw Error('يرجى تسجيل الدخول مجددًا.');
    const response = await fetch(`${marriageProjectUrl}/functions/v1/member-chat-media?action=${action}`, {
      method: 'POST', headers: { apikey: marriagePublishableKey, Authorization: `Bearer ${session.access_token}`, ...headers },
      body, cache: 'no-store', signal: AbortSignal.timeout(action === 'upload' ? 60000 : 20000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw Error(typeof error?.error === 'string' ? error.error : 'تعذّر إرسال أو فتح الملف. حاول مجددًا.');
    }
    return response;
  }
  async function download(requestId: string, mediaId: string, viewOnce: boolean) {
    const response = await request('download', JSON.stringify({ requestId, mediaId, viewOnce }), {'Content-Type':'application/json'});
    return URL.createObjectURL(await response.blob());
  }
  return {
    async sendMedia(requestId, file, kind, clientId, duration, viewOnce = false) {
      if (!file.size || file.size > 8 * 1024 * 1024 || !(kind === 'photo' ? file.type.startsWith('image/') : file.type.startsWith('audio/'))) throw Error('اختر ملفًا مدعومًا لا يتجاوز ٨ ميجابايت.');
      const response = await request('upload', file, {
        'Content-Type': file.type, 'x-request-id': requestId, 'x-client-id': clientId,
        'x-view-once': String(viewOnce), ...(duration === undefined ? {} : {'x-duration-ms': String(Math.round(duration * 1000))}),
      });
      const result = await response.json();
      if (result.id !== clientId) throw Error('تعذّر تأكيد إرسال الملف. حاول مجددًا.');
      return result.id;
    },
    mediaUrl: (id, mediaId) => download(id, mediaId, false),
    openMedia: (id, mediaId) => download(id, mediaId, true),
  };
}
