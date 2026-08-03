const ARABIC_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

export function formatRiyadhCutoffLabel(value: string | null | undefined) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!match) return ''
  const [, yearText, monthText, dayText, hourText, minute] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const weekday = ARABIC_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  const displayHour = hour % 12 || 12
  return `${weekday} ${day} ${ARABIC_MONTHS[month - 1]} ${year} الساعة ${displayHour}:${minute} ${hour < 12 ? 'صباحًا' : 'مساءً'}`
}
