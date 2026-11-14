// Planned Saudi pricing for the trial/demo presentation. Paid checkout always
// displays the localized StoreKit offer returned by Apple.
export const MONTHLY_MEMBERSHIP_SAR = { man: 129.99, woman: 129.99 } as const;
const amount = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function membershipPriceLabel(gender?: 'man' | 'woman'): string {
  if (!gender && MONTHLY_MEMBERSHIP_SAR.man === MONTHLY_MEMBERSHIP_SAR.woman) return `${amount.format(MONTHLY_MEMBERSHIP_SAR.man)} ر.س`;
  if (!gender) return `${amount.format(MONTHLY_MEMBERSHIP_SAR.man)} ر.س للرجال · ${amount.format(MONTHLY_MEMBERSHIP_SAR.woman)} ر.س للنساء`;
  return `${amount.format(MONTHLY_MEMBERSHIP_SAR[gender])} ر.س`;
}
