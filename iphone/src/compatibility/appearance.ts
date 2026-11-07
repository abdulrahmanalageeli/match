export const skinTones = [
  { value: "tone_1", label: "فاتحة جدًا", color: "#F1D3BA" },
  { value: "tone_2", label: "فاتحة", color: "#E3B899" },
  { value: "tone_3", label: "حنطية فاتحة", color: "#CF9B77" },
  { value: "tone_4", label: "حنطية", color: "#B97F59" },
  { value: "tone_5", label: "سمراء فاتحة", color: "#9E6343" },
  { value: "tone_6", label: "سمراء", color: "#7E4A34" },
  { value: "tone_7", label: "سمراء داكنة", color: "#603827" },
  { value: "tone_8", label: "داكنة جدًا", color: "#42261F" },
] as const;
export const dressStyles = [
  { value: "hijab", label: "حجاب" },
  { value: "niqab", label: "نقاب" },
  { value: "uncovered", label: "دون غطاء رأس" },
] as const;
export const dressFlexibilities = [
  { value: "keep", label: "أرغب في الاستمرار باختياري الحالي" },
  { value: "open_to_change", label: "منفتحة على التغيير إذا اقتنعت به" },
  { value: "open_to_discussion", label: "منفتحة على النقاش دون التزام بالتغيير" },
  { value: "prefer_not_to_say", label: "أفضل عدم الإفصاح" },
] as const;
export type SkinTone = typeof skinTones[number]["value"];
export type DressStyle = typeof dressStyles[number]["value"];
export type DressFlexibility = typeof dressFlexibilities[number]["value"];
/** An explicitly chosen illustration, not a photograph or inferred attribute. */
export type PublicAvatar = { style: DressStyle; skinTone: SkinTone };

export function validPublicAvatar(value: unknown): value is PublicAvatar | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const avatar = value as Record<string, unknown>;
  return Object.keys(avatar).length === 2 && dressStyles.some(style => style.value === avatar.style)
    && skinTones.some(tone => tone.value === avatar.skinTone);
}
