export function buildMatchTemplateVariables(participant: any, config: any) {
  return {
    1: String(participant.assigned_number || '0'),
    2: String(participant.secure_token || 'N/A'),
    3: config?.eventDateText || 'TBD',
    4: config?.eventTimeText || 'TBD',
    5: config?.arrivalTimeText || 'TBD',
    6: config?.locationName || 'TBD',
    7: config?.mapUrl || 'https://maps.google.com',
  }
}
