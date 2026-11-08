type Rpc = <T>(name: string, params: Record<string, unknown>, expectedUser: string) => Promise<T>;
const prefix = 'nisfayn.intake.v1.';
const ownerPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Private, authenticated RPC storage; no assessment answers enter browser storage. */
export function createAccountDraftStorage(rpc: Rpc) {
  async function hashBaseline(value: string) {
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  function owner(key: string) {
    const id = key.startsWith(prefix) ? key.slice(prefix.length) : '';
    if (!ownerPattern.test(id)) throw new Error('Invalid draft owner');
    return id;
  }
  return {
    async read(key: string, baseline = '') {
      const result = await rpc<Record<string, unknown> | null>('marriage_onboarding_draft', { command: 'load', payload: {} }, owner(key));
      if (!result) return null;
      // The database enforces expiry. Phone clock skew must not erase a valid
      // server draft; this is an in-memory decoder timestamp, not a TTL renewal.
      return JSON.stringify({...result,savedAt:Date.now(),baseline:result.baseline===await hashBaseline(baseline)?baseline:'stale-account-draft'});
    },
    async write(key: string, value: string) {
      const document=JSON.parse(value);
      document.baseline=await hashBaseline(document.baseline);
      await rpc('marriage_onboarding_draft', { command: 'save', payload: document }, owner(key));
    },
    async remove(key: string) {
      await rpc('marriage_onboarding_draft', { command: 'delete', payload: {} }, owner(key));
    },
  };
}
