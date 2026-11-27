export function latinPhoneDigits(value: string): string {
  return value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0));
}

/** Saudi mobile or geographic landline, in international dialling format. */
export function normalizeFamilyPhone(raw: string): string | null {
  if (raw.length > 32) return null;
  const digits = latinPhoneDigits(raw).replace(/[ -]/g, '');
  const parts = /^(?:\+966|00966|0)(5[0-9]{8}|1[123467][0-9]{7})$/.exec(digits);
  return parts ? '+966' + parts[1] : null;
}
