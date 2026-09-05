export const SEAT_PAYMENT_DEADLINE_WINDOW_MS = 60 * 60 * 1000

const RIYADH_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Riyadh",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

const PAYMENT_REMINDER_SENT_FIELDS = {
  payment: "payment_reminder_sent",
  seat_payment_deadline: "seat_payment_reminder_sent",
}

export function formatSeatPaymentDeadline(now = new Date()) {
  const currentTime = now instanceof Date ? now : new Date(now)
  if (!Number.isFinite(currentTime.getTime())) throw new TypeError("Invalid seat payment deadline start time")

  const deadline = new Date(currentTime.getTime() + SEAT_PAYMENT_DEADLINE_WINDOW_MS)
  const parts = RIYADH_TIME_FORMATTER.formatToParts(deadline)
  const value = type => parts.find(part => part.type === type)?.value
  const period = String(value("dayPeriod") || "").toUpperCase() === "AM" ? "صباحًا" : "مساءً"
  return `${value("hour")}:${value("minute")} ${period}`
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
