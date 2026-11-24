import { Capacitor, registerPlugin } from "@capacitor/core";

export type DeviceLockStatus = {
  enabled: boolean;
  delay: number;
  available: boolean;
  biometry?: 'Face ID' | 'Touch ID' | 'none';
};
export type DeviceAppearance = { icon: string; supported: boolean; callerName: boolean };

type PortraitPlacement = { id: string; box?: number[]; radius?: number; cutouts?: number[][]; image?: string };
interface SecureSessionPlugin {
  read(options?: { key?: string }): Promise<{ token: string | null }>;
  save(options: { token: string; key?: string }): Promise<void>;
  clear(options?: { key?: string }): Promise<void>;
  privacyStatus(): Promise<DeviceLockStatus>;
  privacyConfigure(options: { enabled: boolean; delay: number }): Promise<DeviceLockStatus>;
  appearance(): Promise<DeviceAppearance>;
  setAppearance(options: { icon?: string; callerName?: boolean }): Promise<DeviceAppearance>;
  setCaptureScope(options: {scope: 'discovery' | 'profile' | 'chat' | 'public'; portraitOnly: boolean}): Promise<void>;
  discoveryPortrait(options: PortraitPlacement): Promise<{ placed: boolean }>;
}

const native = registerPlugin<SecureSessionPlugin>("PrivateSession");
export { native as nativeSession };
const useKeychain = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
const key = "marriage.session";

export function placeDiscoveryPortrait(options: PortraitPlacement) {
  return native.discoveryPortrait(options).catch(() => ({ placed: false }));
}

export function setNativeCaptureScope(scope: 'discovery' | 'profile' | 'chat' | 'public') {
  // Older installed binaries still use the web watermark and privacy screen.
  if (useKeychain()) return native.setCaptureScope({scope, portraitOnly: scope === 'discovery'}).catch(() => {});
}

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
