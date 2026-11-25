import type { SupabaseClient } from '@supabase/supabase-js';

let lastDirectory: {member:string;options:Record<string,unknown>} | null=null;
export function rememberSupportDirectory(member:string,options:Record<string,unknown>){lastDirectory={member,options};}

export type SupportCategory = 'access' | 'billing' | 'safety' | 'help';
export type SupportStatus = 'open' | 'in_review' | 'resolved';
export type SupportTicket = { id: string; category: SupportCategory; subject: string; body: string; status: SupportStatus; response: string | null; createdAt: string; updatedAt: string; revision: number; deletionRequested?: boolean; deletionApproved?: boolean; needsVerification?:'identity'|'phone'; editStep?: string; editField?: string; exportOffered?: boolean; requestFilters?:boolean; confirmRepair?: boolean };
export type SupportPage = { items: SupportTicket[]; nextCursor: string | null };
export type SupportInput = { category: SupportCategory; subject: string; body: string; clientId: string };
export interface SupportSource { ownerId?: string; shareDirectory?(ticket:string):Promise<void>; verifyCase?(ticket:string):Promise<'verified'|'authPhone'|'cancelled'>; sendAuthPhone?(phone:string):Promise<void>; confirmAuthPhone?(ticket:string,phone:string,token:string):Promise<void>; confirmRepair?(ticket:string):Promise<void>; list(before?: string): Promise<SupportPage>; ticket?(id:string):Promise<SupportTicket|null>; create(input: SupportInput): Promise<SupportTicket>; confirmDeletion?(ticket: string, approve: boolean): Promise<void> }

export function createSupportSource(client: SupabaseClient, expectedUser: string): SupportSource {
  async function rpc<T>(name:string, args:object): Promise<T> {
    const session = await client.auth.getSession();
    if (session.error || session.data.session?.user.id !== expectedUser) throw new Error('سجّل الدخول مجددًا لمتابعة طلب المساعدة.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const { data, error } = await client.rpc(name,args).abortSignal(controller.signal);
      if (error) {
        if (error.code === '22023' || error.code === 'P0001') throw new Error(error.message);
        throw new Error('تعذّر تأكيد الطلب. تحقق من الاتصال وحاول مجددًا؛ إعادة المحاولة لا تنشئ طلبًا مكررًا.');
      }
      const current = await client.auth.getSession();
      if (current.data.session?.user.id !== expectedUser) throw new Error('تغيّرت جلسة الحساب. افتح المساعدة مجددًا.');
      return data as T;
    } finally { clearTimeout(timeout); }
  }
  const call=<T,>(action:string,payload:object)=>rpc<T>('marriage_support',{action,payload});
  async function sessionUser(){
    const user=(await client.auth.getUser()).data.user;
    if(!user||user.id!==expectedUser)throw new Error('تغيّرت جلسة الحساب.');
    return user;
  }
  async function proof(ticket:string,proofHash?:string,deviceHash?:string){
    const {data,error}=await client.rpc('marriage_ops_member_proof',{ticket,proof_hash:proofHash??null,device_hash:deviceHash??null});
    if(error)throw new Error(/[\u0600-\u06ff]/.test(error.message)?error.message:'تعذّر تأكيد الهوية.');
    return data as {verified?:boolean;authPhoneRequired?:boolean;smsRequired?:boolean};
  }
  return { ownerId:expectedUser,
    async shareDirectory(ticket){if(lastDirectory?.member!==expectedUser)throw new Error('افتح الاكتشاف بخيارات البحث المطلوبة ثم عد إلى طلب المساعدة.');await call('case_filters',{id:ticket,options:lastDirectory.options});},
    async verifyCase(ticket){const user=await sessionUser();const state=await proof(ticket);
      if(state.authPhoneRequired)return 'authPhone';
      if(state.smsRequired){
        if(!user.email)throw new Error('يلزم بريد موثّق لهذا الحساب.');
        const {confirmSignupSms}=await import('../auth/SignupSms');
        const sms=await confirmSignupSms(user.email,true);if(!sms)return 'cancelled';
        const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
        if(!(await proof(ticket,await hash(sms.phoneProof),await hash('wudayn-device-v1:'+sms.deviceId))).verified)throw new Error('تعذّر تثبيت ملكية الرقم.');
      }
      return 'verified';
    },
    async sendAuthPhone(phone){await sessionUser();const {normalizeSignupPhone}=await import('../auth/SignupSms');const {error}=await client.auth.updateUser({phone:normalizeSignupPhone(phone)});if(error)throw new Error('تعذّر إرسال رمز التحقق. تحقّق من الرقم وحاول مجددًا.');},
    async confirmAuthPhone(ticket,phone,token){await sessionUser();const {normalizeSignupPhone}=await import('../auth/SignupSms');const {error}=await client.auth.verifyOtp({phone:normalizeSignupPhone(phone),token,type:'phone_change'});if(error)throw new Error('الرمز غير صالح أو انتهت مدته.');if(!(await proof(ticket)).verified)throw new Error('تحتاج خدمة الدخول تأكيدًا إضافيًا لتغيير الرقم.');},
    confirmRepair:async id=>{await call('case_confirm',{id});}, list: before => call('list', { before }), ticket:id=>rpc('marriage_support_ticket',{ticket_id:id}), create: input => call('create', input), async confirmDeletion(ticket, approve) {
    const current = await client.auth.getSession();
    if (current.data.session?.user.id !== expectedUser) throw new Error('تغيّرت الجلسة. افتح طلبك مجددًا.');
    const result = await client.rpc('marriage_confirm_case_deletion', { ticket, approve });
    if (result.error) throw new Error('تعذّر تسجيل القرار. حدّث الطلب وحاول مجددًا.');
  } };
}
