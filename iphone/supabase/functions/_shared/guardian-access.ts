type AccessError = { message?: string; status?: number; code?: string };
type Result = { data: unknown; error: AccessError | null };
export type GuardianAccessServices = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>;
  createUser: (attributes: { email: string; password: string; email_confirm: true; app_metadata: { guardian_account: true } }) => Promise<{ data: { user: { id: string } | null }; error: AccessError | null }>;
  deleteUser: (id: string) => Promise<unknown>;
  updatePassword: (id: string, password: string) => Promise<{ error: AccessError | null }>;
  checkPassword: (email: string, password: string) => Promise<string>;
};
export type GuardianAccessInput = { action: 'register' | 'recover' | 'rotate'; username: string; password: string; displayName?: string; recoveryCode?: string };
export function accessError(message: string, status = 400): Error & { status: number } { return Object.assign(Error(message), { status }); }
export function normalizedGuardianUsername(value: unknown): string {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(username)) throw accessError('اختر اسم مستخدم من ٣ إلى ٢٤ حرفًا إنجليزيًا أو رقمًا، يبدأ بحرف.');
  return username;
}
export function validateGuardianPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || !value.trim() || new TextEncoder().encode(value).length > 72) throw accessError('استخدم كلمة مرور من ١٢ حرفًا على الأقل، وبحد أقصى ٧٢ بايت.');
  return value;
}
export function parseGuardianAccess(value: unknown): GuardianAccessInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw accessError('الطلب غير صالح.');
  const input = value as Record<string, unknown>;
  if (!['register', 'recover', 'rotate'].includes(String(input.action))) throw accessError('الإجراء غير متاح.');
  const result: GuardianAccessInput = { action: input.action as GuardianAccessInput['action'], username: normalizedGuardianUsername(input.username), password: validateGuardianPassword(input.password) };
  if (result.action === 'register') {
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    if (displayName.length < 2 || displayName.length > 60 || input.adult !== true || input.consentVersion !== 'family-v1') throw accessError('أدخل اسمك وأكّد البلوغ والموافقة على شروط جسر الأهل.');
    result.displayName = displayName;
  }
  if (result.action === 'recover') {
    const code = typeof input.recoveryCode === 'string' ? input.recoveryCode.replace(/[\s-]/g, '').toLowerCase() : '';
    if (!/^[0-9a-f]{32}$/.test(code)) throw accessError('أدخل مفتاح الاسترداد الكامل الذي حفظته عند إنشاء الحساب.');
    result.recoveryCode = code;
  }
  return result;
}
export async function hashGuardianValue(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function createRecoveryCode(): string { return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''); }
/** Only the fixed hosted gateway's Cloudflare header; never trust a caller-selected XFF entry. */
export function guardianNetworkAddress(headers: Headers): string {
  const address = headers.get('cf-connecting-ip')?.trim();
  if (!address || address.includes(',') || !/^[0-9a-f:.]{3,45}$/i.test(address)) throw accessError('تعذّر التحقق من الاتصال. حاول مجددًا لاحقًا.', 503);
  return address.toLowerCase();
}
export async function performGuardianAccess(input: GuardianAccessInput, networkHash: string, service: GuardianAccessServices): Promise<{ ok: true; recoveryCode: string }> {
  const usernameHash = await hashGuardianValue(input.username);
  const operation = input.action === 'rotate' ? 'login' : input.action;
  const limit = await service.rpc('family_access_limit', { operation, username_hash: usernameHash, network_hash: networkHash });
  if (limit.error || !limit.data || typeof limit.data !== 'object' || !('allowed' in limit.data)) throw accessError('الخدمة غير متاحة مؤقتًا. حاول لاحقًا.', 503);
  if (limit.data.allowed !== true) throw accessError('طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 429);
  const recoveryCode = createRecoveryCode(), recoveryHash = await hashGuardianValue(recoveryCode);
  const email = usernameHash + '@guardian.nisfayn.invalid';
  if (input.action === 'register') {
    const created = await service.createUser({ email, password: input.password, email_confirm: true, app_metadata: { guardian_account: true } });
    // Confirmation enables a managed internal login identifier. It is not a verified contact address.
    if (created.error || !created.data.user) throw accessError('تعذّر إنشاء الحساب بهذا الاسم. جرّب اسم مستخدم آخر أو سجّل الدخول.', created.error?.status === 429 ? 429 : 409);
    const id = created.data.user.id;
    try {
      const saved = await service.rpc('family_login_register', { account_id: id, username_hash: usernameHash, recovery_hash: recoveryHash, display_name: input.displayName });
      if (saved.error || saved.data !== true) throw accessError('تعذّر إكمال إنشاء الحساب. حاول مجددًا.', 503);
    } catch (error) {
      let removed = false;
      for (let attempt = 0; attempt < 2 && !removed; attempt++) {
        try { await service.deleteUser(id); removed = true; } catch { /* Retry only this new, incomplete account. */ }
      }
      if (!removed) throw accessError('تعذّر إكمال إنشاء الحساب. تواصل مع الدعم لإكماله بأمان.', 503);
      throw error;
    }
  } else if (input.action === 'rotate') {
    const id = await service.checkPassword(email, input.password);
    const saved = await service.rpc('family_recovery_rotate', { account_id: id, new_recovery_hash: recoveryHash });
    if (saved.error || saved.data !== true) throw accessError('تعذّر تجديد مفتاح الاسترداد. حاول مجددًا.', 503);
  } else {
    const prepared = await service.rpc('family_recovery_prepare', { username_hash: usernameHash, recovery_hash: await hashGuardianValue(input.recoveryCode!) });
    const claim = prepared.data as { accountId?: string; claimId?: string } | null;
    if (prepared.error || !claim?.accountId || !claim.claimId) throw accessError('تعذّر الاسترداد. تحقّق من اسم المستخدم والمفتاح، أو حاول لاحقًا.', 403);
    const updated = await service.updatePassword(claim.accountId, input.password);
    if (updated.error) {
      // Never release the lease after an ambiguous network/server failure: the password may have changed.
      if (updated.error.status && updated.error.status >= 400 && updated.error.status < 500) await service.rpc('family_recovery_abort', { claim_id: claim.claimId });
      throw accessError('تعذّر تغيير كلمة المرور. حاول مجددًا لاحقًا.', 503);
    }
    let finished = false;
    for (let attempt = 0; attempt < 3 && !finished; attempt++) {
      const saved = await service.rpc('family_recovery_finish', { claim_id: claim.claimId, new_recovery_hash: recoveryHash });
      finished = !saved.error && saved.data === true;
    }
    if (!finished) throw accessError('قد تكون كلمة المرور الجديدة حُفظت. جرّب الدخول بها وتواصل مع الدعم لإكمال الاسترداد المعلّق.', 503);
  }
  return { ok: true, recoveryCode };
}
