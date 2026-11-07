import { Capacitor, registerPlugin } from "@capacitor/core";

interface SecureSessionPlugin {
  read(options?: { key?: string }): Promise<{ token: string | null }>;
  save(options: { token: string; key?: string }): Promise<void>;
  clear(options?: { key?: string }): Promise<void>;
}

const native = registerPlugin<SecureSessionPlugin>("PrivateSession");
const useKeychain = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
const key = "marriage.session";

// The draft store deliberately has no web storage fallback.
export function privateDraftKeychain() {
  if (!useKeychain()) return null;
  return {
    read: async (key: string) => (await native.read({ key })).token,
    write: (key: string, value: string) => native.save({ key, token: value }),
    remove: (key: string) => native.clear({ key }),
  };
}

export async function readSession(): Promise<string | null> {
  return useKeychain()
    ? (await native.read()).token
    : sessionStorage.getItem(key);
}

export async function saveSession(token: string): Promise<void> {
  if (useKeychain()) await native.save({ token });
  else sessionStorage.setItem(key, token);
}

export async function clearSession(): Promise<void> {
  if (useKeychain()) await native.clear();
  else sessionStorage.removeItem(key);
}

// Supabase's refresh token, PKCE verifier and session are separate Keychain items.
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    return useKeychain()
      ? (await native.read({ key })).token
      : sessionStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (useKeychain()) await native.save({ key, token: value });
    else sessionStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (useKeychain()) await native.clear({ key });
    else sessionStorage.removeItem(key);
  },
};
