import { Capacitor, registerPlugin } from '@capacitor/core';
import { cloud } from '../cloud';

const native = registerPlugin<{
  apple(): Promise<{ token: string; nonce: string }>;
  google(input: { url: string }): Promise<{ code: string }>;
}>('SocialAuth');

export async function socialSignIn(provider: 'apple' | 'google'): Promise<string> {
  if (!cloud || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') throw Error('تسجيل الدخول هذا متاح في تطبيق iPhone.');
  if (provider === 'apple') {
    const { token, nonce } = await native.apple();
    const { data, error } = await cloud.auth.signInWithIdToken({ provider, token, nonce });
    if (error || !data.user) throw Error('تعذّر تأكيد حساب Apple. حاول مجددًا.');
    return data.user.id;
  }
  const { data, error } = await cloud.auth.signInWithOAuth({ provider, options: {
    redirectTo: 'com.blindmatch.marriage://auth/callback', skipBrowserRedirect: true,
    queryParams: { prompt: 'select_account' },
  } });
  if (error || !data.url) throw Error('تعذّر بدء تسجيل الدخول باستخدام Google.');
  const { code } = await native.google({ url: data.url });
  const result = await cloud.auth.exchangeCodeForSession(code);
  if (result.error || !result.data.user) throw Error('تعذّر تأكيد حساب Google. حاول مجددًا.');
  return result.data.user.id;
}
