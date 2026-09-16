export { formatSeatPaymentDeadline } from "../../app/lib/seat-payment-deadline.mjs"

export function paymentWindowLabels(cutoffLabel) {
  const label = String(cutoffLabel || "").trim() || "الموعد المحدد"
  return {
    earlyTime: `حتى ${label}`,
    lateTime: `ابتداءً من ${label}`,
  }
}

const PAYMENT_REMINDER_SENT_FIELDS = {
  payment: "payment_reminder_sent",
  seat_payment_deadline: "seat_payment_reminder_sent",
}

export function isPaymentReminderTemplate(templateKey) {
  return Boolean(paymentReminderSentField(templateKey))
}

export function paymentReminderSentField(templateKey) {
  return PAYMENT_REMINDER_SENT_FIELDS[templateKey] || null
}

export function hasPaymentReminderBeenSent(templateKey, participant) {
  const field = paymentReminderSentField(templateKey)
  return field ? participant?.[field] === true : false
}

export function paymentReminderSentUpdate(templateKey, eventId) {
  if (templateKey === "payment") return { payment_reminder_sent: true }
  if (templateKey === "seat_payment_deadline") {
    return {
      seat_payment_reminder_sent: true,
      whatsapp_contacted_event_id: Number(eventId),
    }
  }
  return null
}
