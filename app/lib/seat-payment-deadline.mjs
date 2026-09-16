export function formatSeatPaymentDeadline(now = new Date()) {
  const deadline = new Date(now.getTime() + 60 * 60 * 1000)
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(deadline).replace("AM", "صباحًا").replace("PM", "مساءً")
  const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" })
  const day = dayFormatter.format(now) === dayFormatter.format(deadline) ? "اليوم" : "غدًا"
  return `${time} ${day}`
}
