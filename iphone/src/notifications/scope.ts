// Installation-specific routing tag. Never persist a tester credential or send it to a push provider.
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function notificationScope(owner: string, installation: string) {
  const identity = owner.startsWith('tester:')
    ? 'tester:' + await digest(owner.slice(7))
    : 'member:' + owner;
  return digest(identity + ':' + installation.toLowerCase());
}
