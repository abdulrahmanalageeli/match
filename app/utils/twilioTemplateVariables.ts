const ARABIC_WEEKDAYS = ['الأحد', 'الإثنين', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export function getArabicWeekday(eventDateText: unknown): string {
  const value = String(eventDateText || '').trim()
  const namedDay = ARABIC_WEEKDAYS.find(day => value.includes(day))
  if (namedDay) return namedDay === 'الاثنين' ? 'الإثنين' : namedDay

  const isoDate = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (isoDate) {
    const date = new Date(Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])))
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('ar-SA', { weekday: 'long', timeZone: 'Asia/Riyadh' }).format(date)
    }
  }

  return value || 'TBD'
}

export function buildMatchTemplateVariables(participant: any, config: any) {
  return {
    1: String(participant.assigned_number || '0'),
    2: String(participant.secure_token || 'N/A'),
    3: getArabicWeekday(config?.eventDateText),
    4: config?.eventTimeText || 'TBD',
    5: config?.arrivalTimeText || 'TBD',
    6: config?.locationName || 'TBD',
    7: config?.mapUrl || 'https://maps.google.com',
  }
}
