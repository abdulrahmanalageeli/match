import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { membershipProductId, type MembershipPlan } from './membershipPricing';
import { cloud } from './cloud';

export type MembershipPromotion = { id: string; terms: string };
type SignedTransaction = { jws: string };
interface AppleMembershipPlugin {
  offer(options: { productId: string }): Promise<{ price: string; productId: string; currency:string; period:string; introduction?:string; appleEligible:boolean; signedAppTransaction:string; promotions?:MembershipPromotion[] }>;
  purchase(options: { accountToken: string; productId: string; eligibilityJws:string; price:string; currency:string; period:string; introduction?:string; promotionId?:string; promotionJws?:string; promotionTerms?:string }): Promise<SignedTransaction>;
  giftOffer(options: {productId:string}): Promise<GiftPrice>;
  purchaseGift(options: GiftPrice & {orderToken:string}): Promise<SignedTransaction>;
  pendingGifts(): Promise<{transactions:string[]}>;
  restore(): Promise<SignedTransaction>;
  current(): Promise<{ jws: string | null }>;
  complete(options: SignedTransaction): Promise<void>;
  manage(): Promise<void>;
  addListener(name: 'transaction' | 'giftTransaction', listener: (event: SignedTransaction) => void): Promise<PluginListenerHandle>;
}

const membership = registerPlugin<AppleMembershipPlugin>('AppleMembership');
export const isIOSBilling = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

function requireIOS() {
  if (!isIOSBilling()) throw new Error('الاشتراك المدفوع متاح من تطبيق iPhone.');
}

export type MembershipOffer = {price:string; currency:string; period:string; introduction?:string; trialEligible:boolean; sandboxCheckout?:boolean; promotion?:MembershipPromotion};
export class MembershipOfferChangedError extends Error {}
async function verifiedOffer(gender: 'man'|'woman'|undefined, claim:boolean, plan:MembershipPlan='premium', sandboxOnly=false, expectedPromotion?:MembershipPromotion) {
  requireIOS();
  const productId = membershipProductId(gender,plan);
  const offer = await membership.offer({productId});
  if (!offer.period || offer.productId !== productId || !offer.signedAppTransaction || typeof offer.appleEligible!=='boolean') throw Error('حدّث تطبيق وُدَين لتحميل عرض عضويتك الصحيح.');
  if(!cloud)throw Error('عرض العضوية غير متاح الآن.');
  const {data,error}=await cloud.functions.invoke('membership-offer',{body:{signedAppTransaction:offer.signedAppTransaction,appleEligible:offer.appleEligible,claim,productId,sandboxOnly,promotionIds:offer.promotions?.map(p=>p.id),expectedPromotion:expectedPromotion?.id}});
  if(error||data?.productId!==productId)throw Error('تعذّر تحميل عرض العضوية. حاول مجددًا.');
  if(data.promotionChanged)throw new MembershipOfferChangedError('تغيّر عرض العودة. حدّث عرض العضوية قبل إكمال الشراء.');
  const promotion=offer.promotions?.find(p=>p.id===data.promotionId);
  return {offer,promotion,authorization:data as {eligible:boolean;sandboxCheckout?:boolean;eligibilityJws?:string;accountToken?:string;promotionJws?:string}};
}

export async function getMembershipOffer(gender?: 'man' | 'woman',plan:MembershipPlan='premium'): Promise<MembershipOffer> {
  const {offer,promotion,authorization}=await verifiedOffer(gender,false,plan);
  if (authorization.eligible && !authorization.sandboxCheckout) void import('./launchEvents').then(({launchEvent})=>launchEvent('eligible','trial'));
  return {price:offer.price,currency:offer.currency,period:offer.period,introduction:authorization.eligible?offer.introduction:undefined,trialEligible:authorization.eligible===true,sandboxCheckout:authorization.sandboxCheckout===true,promotion};
}

export async function purchaseMembership(accountToken: string, gender?: 'man' | 'woman', expectedTrial=false, displayedOffer?: MembershipOffer,plan:MembershipPlan='premium',sandboxOnly=false): Promise<string> {
  const {offer,promotion,authorization}=await verifiedOffer(gender,true,plan,sandboxOnly,displayedOffer?.promotion);
  if(displayedOffer?.promotion?.id!==promotion?.id || displayedOffer?.promotion?.terms!==promotion?.terms || (promotion && !authorization.promotionJws))throw new MembershipOfferChangedError('تغيّر عرض العودة. راجع سعر العرض ومدّته قبل الشراء.');
  if(sandboxOnly && authorization.sandboxCheckout!==true)throw new MembershipOfferChangedError('حدّث عرض العضوية قبل إكمال الشراء.');
  if(authorization.accountToken!==accountToken || !authorization.eligibilityJws)throw Error('تعذّر ربط العرض بحسابك.');
  if(displayedOffer && (displayedOffer.price!==offer.price || displayedOffer.currency!==offer.currency || displayedOffer.period!==offer.period || displayedOffer.introduction!==(authorization.eligible?offer.introduction:undefined)))throw new MembershipOfferChangedError('تغيّر سعر المتجر. حدّث عرض العضوية وراجعه قبل تأكيد الاشتراك.');
  if(expectedTrial && !authorization.eligible)throw new MembershipOfferChangedError('لم يعد العرض المجاني متاحًا لهذا الشراء. حدّث العرض قبل تأكيد الاشتراك.');
  try {
    return (await membership.purchase({accountToken,productId:membershipProductId(gender,plan),eligibilityJws:authorization.eligibilityJws,
      price:offer.price,currency:offer.currency,period:offer.period,introduction:authorization.eligible?offer.introduction:undefined,
      promotionId:promotion?.id,promotionTerms:promotion?.terms,promotionJws:authorization.promotionJws})).jws;
  } catch (error) {
    if(error && typeof error==='object' && 'code' in error && error.code==='OFFER_CHANGED')
      throw new MembershipOfferChangedError('تغيّر عرض المتجر. راجع السعر والمدة قبل الشراء.');
    throw error;
  }
}

export type GiftPrice = {productId:string;price:string;currency:string};
export const giftProductId = (tier:MembershipPlan) => 'com.blindmatch.marriage.gift.' + tier + '.30d';

export async function giftPrice(tier:MembershipPlan):Promise<GiftPrice> {
  requireIOS();
  const productId = giftProductId(tier);
  const item = await membership.giftOffer({productId});
  if (item.productId !== productId || !item.price || !item.currency) throw Error('تعذّر تحميل سعر الهدية.');
  return item;
}

export async function buyGift(offer:GiftPrice, orderToken:string) {
  requireIOS();
  return (await membership.purchaseGift({...offer, orderToken})).jws;
}

export const unfinishedGifts = async () => (await membership.pendingGifts()).transactions;
export const onGiftUpdate = (listener:(jws:string)=>void) =>
  membership.addListener('giftTransaction', ({jws}) => listener(jws));

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
