// Saudi monthly catalog. Checkout displays Apple's localized price for this product.
export const MONTHLY_MEMBERSHIP_SAR = { man: 149.99, woman: 99.99 } as const;
export const MEMBERSHIP_PRODUCTS = { man:'com.blindmatch.marriage.monthly.men', woman:'com.blindmatch.marriage.monthly.women' } as const;
export function membershipProductId(gender?: 'man' | 'woman'): string {
  if (gender !== 'man' && gender !== 'woman') throw Error('أكمل بيانات ملفك قبل شراء العضوية.');
  return MEMBERSHIP_PRODUCTS[gender];
}
const amount = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function membershipPriceLabel(gender?: 'man' | 'woman'): string {
  if (!gender) return `${amount.format(MONTHLY_MEMBERSHIP_SAR.man)} ر.س للرجال · ${amount.format(MONTHLY_MEMBERSHIP_SAR.woman)} ر.س للنساء`;
  return `${amount.format(MONTHLY_MEMBERSHIP_SAR[gender])} ر.س`;
}
