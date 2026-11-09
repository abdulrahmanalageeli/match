/** Date-only Gregorian birthdays. Never parse them as UTC timestamps. */
export function ageFromBirthday(value: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (year < 1900 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return today.getFullYear() - year - Number(today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day));
}
export function latestAdultBirthday(today = new Date()): string {
  const year = today.getFullYear() - 18;
  const month = today.getMonth();
  const day = Math.min(today.getDate(), new Date(year, month + 1, 0).getDate());
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
