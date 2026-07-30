export function normalizeInboundAction(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
}

const ACTION_ALIASES = {
  confirm_attendance: ["confirm_attendance", "تأكيد المشاركة", "تاكيد المشاركة", "نعم سأحضر", "نعم ساحضر", "تأكيد", "تاكيد", "نعم", "confirm"],
  deny_attendance: ["deny_attendance", "اعتذار عن المشاركة", "اعتذار", "لن أحضر", "لن احضر", "لا أستطيع الحضور", "لا استطيع الحضور", "لا", "deny"],
  toggle_auto_signup: ["toggle_auto_signup", "التسجيل التلقائي", "تفعيل التسجيل التلقائي", "تفعيل", "activate"],
  event3_information: ["event3_information", "معلومات الفعالية", "معلومات عن الفعالية"],
  gender_any: ["gender_any", "أي جنس", "اي جنس"],
  gender_same: ["gender_same", "نفس الجنس"],
  gender_different: ["gender_different", "جنس مختلف"],
  age_expand_2: ["age_expand_2", "توسيع سنتين"],
  age_expand_5: ["age_expand_5", "توسيع 5 سنوات", "توسيع خمس سنوات"],
  age_keep_current: ["age_keep_current", "إبقاء النطاق", "ابقاء النطاق", "إبقاء التفضيل", "ابقاء التفضيل"],
  discount_interested: ["discount_interested", "مهتم"],
  discount_declined: ["discount_declined", "غير مهتم"],
  arrival_on_way: ["arrival_on_way", "في الطريق", "أنا في الطريق", "انا في الطريق"],
  arrival_late: ["arrival_late", "سأتأخر", "ساتاخر", "سوف أتأخر", "سوف اتاخر"],
  arrival_cancel: ["arrival_cancel", "لن أحضر", "لن احضر"],
}

const ALIAS_TO_ACTION = new Map()
for (const [action, aliases] of Object.entries(ACTION_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_ACTION.set(normalizeInboundAction(alias), action)
}

export function resolveInboundAction(...values) {
  for (const value of values) {
    const action = ALIAS_TO_ACTION.get(normalizeInboundAction(value))
    if (action) return action
  }
  return ""
}
