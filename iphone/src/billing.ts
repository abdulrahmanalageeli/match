import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

type SignedTransaction = { jws: string };
interface AppleMembershipPlugin {
  offer(): Promise<{ price: string }>;
  purchase(options: { accountToken: string }): Promise<SignedTransaction>;
  restore(): Promise<SignedTransaction>;
  current(): Promise<{ jws: string | null }>;
  complete(options: SignedTransaction): Promise<void>;
  manage(): Promise<void>;
  addListener(name: 'transaction', listener: (event: SignedTransaction) => void): Promise<PluginListenerHandle>;
}

const membership = registerPlugin<AppleMembershipPlugin>('AppleMembership');
export const isIOSBilling = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

function requireIOS() {
  if (!isIOSBilling()) throw new Error('الاشتراك المدفوع متاح من تطبيق iPhone.');
}

export function getMembershipOffer(): Promise<{ price: string }> {
  requireIOS();
  return membership.offer();
}

export async function purchaseMembership(accountToken: string): Promise<string> {
  requireIOS();
  return (await membership.purchase({ accountToken })).jws;
}

export async function restoreMembership(): Promise<string> {
  requireIOS();
  return (await membership.restore()).jws;
}

export async function currentMembership(): Promise<string | null> {
  if (!isIOSBilling()) return null;
  return (await membership.current()).jws;
}

export async function completeMembership(jws: string): Promise<void> {
  requireIOS();
  await membership.complete({ jws });
}

export function onMembershipUpdate(listener: (jws: string) => void): Promise<PluginListenerHandle> {
  requireIOS();
  return membership.addListener('transaction', ({ jws }) => listener(jws));
}

export async function manageMembership(): Promise<void> {
  requireIOS();
  await membership.manage();
}
