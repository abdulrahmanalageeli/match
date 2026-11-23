// Saudi monthly catalog. Checkout displays Apple's localized price for this product.
export const MONTHLY_MEMBERSHIP_SAR = { man: 149.99, woman: 99.99 } as const;
export const MEMBERSHIP_PRODUCTS = { man:'com.blindmatch.marriage.monthly.men', woman:'com.blindmatch.marriage.monthly.women' } as const;
export const SERIOUSNESS_PRODUCT='com.blindmatch.marriage.monthly.seriousness';
export const SERIOUSNESS_WOMEN_PRODUCT='com.blindmatch.marriage.monthly.seriousness.women';
export const SERIOUSNESS_MEMBERSHIP_SAR={man:299.99,woman:199.99} as const;
export type MembershipPlan='premium'|'seriousness';
export function giftProductId(tier:MembershipPlan, recipient:'man'|'woman'):string {
  const base = 'com.blindmatch.marriage.gift.' + tier + '.30d';
  return recipient === 'woman' ? base + '.women' : base;
}
export function membershipProductId(gender?: 'man' | 'woman',plan:MembershipPlan='premium'): string {
  if (gender !== 'man' && gender !== 'woman') throw Error('أكمل بيانات ملفك قبل شراء العضوية.');
  if(plan==='seriousness')return gender==='woman'?SERIOUSNESS_WOMEN_PRODUCT:SERIOUSNESS_PRODUCT;
  return MEMBERSHIP_PRODUCTS[gender];
}
const amount = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function membershipPriceLabel(gender?: 'man' | 'woman'): string {
  if (!gender) return `${amount.format(MONTHLY_MEMBERSHIP_SAR.man)} ر.س للرجال · ${amount.format(MONTHLY_MEMBERSHIP_SAR.woman)} ر.س للنساء`;
  return `${amount.format(MONTHLY_MEMBERSHIP_SAR[gender])} ر.س`;
}

export function seriousnessPriceLabel(gender?: 'man'|'woman'):string {
  return gender ? `${amount.format(SERIOUSNESS_MEMBERSHIP_SAR[gender])} ر.س` : `${amount.format(SERIOUSNESS_MEMBERSHIP_SAR.man)} ر.س للرجال · ${amount.format(SERIOUSNESS_MEMBERSHIP_SAR.woman)} ر.س للنساء`;
}
