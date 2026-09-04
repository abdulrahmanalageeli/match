export const SEAT_PAYMENT_DEADLINE_LABEL = "11:59 مساءً"

const PAYMENT_REMINDER_TEMPLATE_KEYS = new Set(["payment", "seat_payment_deadline"])

export function formatSeatPaymentDeadline() {
  return SEAT_PAYMENT_DEADLINE_LABEL
}

export function isPaymentReminderTemplate(templateKey) {
  return PAYMENT_REMINDER_TEMPLATE_KEYS.has(templateKey)
}
