export function confirmationPaymentState(participant) {
  if (participant?.payment_waived === true) return "waived"
  if (participant?.PAID_DONE === true) return "paid"
  return "payment_pending"
}
