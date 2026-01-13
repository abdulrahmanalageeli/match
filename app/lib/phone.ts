export function sanitizeToDigits(value: string): string {
  return (value || "").replace(/\D/g, "").slice(0, 10);
}

export function formatSaudiMobileDisplay(digitsOnly: string): string {
  const d = (digitsOnly || "").slice(0, 10);
  // Insert spaces after 3 and 7 to get pattern like: 05x xxx xxxx
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
}

// For groups semi-login, backend uses last 7 digits. Consider valid when >= 7 digits.
export function isValidSaudiMobile(digitsOnly: string): boolean {
  const d = digitsOnly || "";
  return d.length >= 7; // relaxed validation for semi-login
}
