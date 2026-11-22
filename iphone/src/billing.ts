import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { membershipProductId, type MembershipPlan } from './membershipPricing';
import { cloud } from './cloud';

type SignedTransaction = { jws: string };
interface AppleMembershipPlugin {
  offer(options: { productId: string }): Promise<{ price: string; productId: string; currency:string; period:string; introduction?:string; appleEligible:boolean; signedAppTransaction:string }>;
  purchase(options: { accountToken: string; productId: string; eligibilityJws:string; price:string; currency:string; period:string; introduction?:string }): Promise<SignedTransaction>;
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

export type MembershipOffer = {price:string; currency:string; period:string; introduction?:string; trialEligible:boolean; sandboxCheckout?:boolean};
export class MembershipOfferChangedError extends Error {}
async function verifiedOffer(gender: 'man'|'woman'|undefined, claim:boolean, plan:MembershipPlan='premium', sandboxOnly=false) {
  requireIOS();
  const productId = membershipProductId(gender,plan);
  const offer = await membership.offer({productId});
  if (!offer.period || offer.productId !== productId || !offer.signedAppTransaction || typeof offer.appleEligible!=='boolean') throw Error('حدّث تطبيق وُدَين لتحميل عرض عضويتك الصحيح.');
  if(!cloud)throw Error('عرض العضوية غير متاح الآن.');
  const {data,error}=await cloud.functions.invoke('membership-offer',{body:{signedAppTransaction:offer.signedAppTransaction,appleEligible:offer.appleEligible,claim,productId,sandboxOnly}});
  if(error||data?.productId!==productId)throw Error('تعذّر تحميل عرض العضوية. حاول مجددًا.');
  return {offer,authorization:data as {eligible:boolean;sandboxCheckout?:boolean;eligibilityJws?:string;accountToken?:string}};
}

export async function getMembershipOffer(gender?: 'man' | 'woman',plan:MembershipPlan='premium'): Promise<MembershipOffer> {
  const {offer,authorization}=await verifiedOffer(gender,false,plan);
  return {price:offer.price,currency:offer.currency,period:offer.period,introduction:authorization.eligible?offer.introduction:undefined,trialEligible:authorization.eligible===true,sandboxCheckout:authorization.sandboxCheckout===true};
}

export async function purchaseMembership(accountToken: string, gender?: 'man' | 'woman', expectedTrial=false, displayedOffer?: MembershipOffer,plan:MembershipPlan='premium',sandboxOnly=false): Promise<string> {
  const {offer,authorization}=await verifiedOffer(gender,true,plan,sandboxOnly);
  if(sandboxOnly && authorization.sandboxCheckout!==true)throw new MembershipOfferChangedError('حدّث عرض العضوية قبل إكمال الشراء.');
  if(authorization.accountToken!==accountToken || !authorization.eligibilityJws)throw Error('تعذّر ربط العرض بحسابك.');
  if(displayedOffer && (displayedOffer.price!==offer.price || displayedOffer.currency!==offer.currency || displayedOffer.period!==offer.period || displayedOffer.introduction!==(authorization.eligible?offer.introduction:undefined)))throw new MembershipOfferChangedError('تغيّر سعر المتجر. حدّث عرض العضوية وراجعه قبل تأكيد الاشتراك.');
  if(expectedTrial && !authorization.eligible)throw new MembershipOfferChangedError('لم يعد العرض المجاني متاحًا لهذا الشراء. حدّث العرض قبل تأكيد الاشتراك.');
  try {
    return (await membership.purchase({accountToken,productId:membershipProductId(gender,plan),eligibilityJws:authorization.eligibilityJws,
      price:offer.price,currency:offer.currency,period:offer.period,introduction:authorization.eligible?offer.introduction:undefined})).jws;
  } catch (error) {
    if(error && typeof error==='object' && 'code' in error && error.code==='OFFER_CHANGED')
      throw new MembershipOfferChangedError('تغيّر عرض المتجر. راجع السعر والمدة قبل الشراء.');
    throw error;
  }
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
