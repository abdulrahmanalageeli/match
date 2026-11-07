import type { SupabaseClient } from '@supabase/supabase-js';

export type SupportCategory = 'access' | 'billing' | 'safety' | 'help';
export type SupportStatus = 'open' | 'in_review' | 'resolved';
export type SupportTicket = { id: string; category: SupportCategory; subject: string; body: string; status: SupportStatus; response: string | null; createdAt: string; updatedAt: string; revision: number };
export type SupportPage = { items: SupportTicket[]; nextCursor: string | null };
export type SupportInput = { category: SupportCategory; subject: string; body: string; clientId: string };
export interface SupportSource { list(before?: string): Promise<SupportPage>; create(input: SupportInput): Promise<SupportTicket> }

export function createSupportSource(client: SupabaseClient, expectedUser: string): SupportSource {
  async function call<T>(action: string, payload: object): Promise<T> {
    const session = await client.auth.getSession();
    if (session.error || session.data.session?.user.id !== expectedUser) throw new Error('سجّل الدخول مجددًا لمتابعة طلب المساعدة.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const { data, error } = await client.rpc('marriage_support', { action, payload }).abortSignal(controller.signal);
      if (error) {
        if (error.code === '22023' || error.code === 'P0001') throw new Error(error.message);
        throw new Error('تعذّر تأكيد الطلب. تحقق من الاتصال وحاول مجددًا؛ إعادة المحاولة لا تنشئ طلبًا مكررًا.');
      }
      const current = await client.auth.getSession();
      if (current.data.session?.user.id !== expectedUser) throw new Error('تغيّرت جلسة الحساب. افتح المساعدة مجددًا.');
      return data as T;
    } finally { clearTimeout(timeout); }
  }
  return { list: before => call('list', { before }), create: input => call('create', input) };
}
