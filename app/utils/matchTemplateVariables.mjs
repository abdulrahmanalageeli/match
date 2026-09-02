export function buildMatchTemplateVariables(participant, config) {
  const name = participant?.name
    || participant?.survey_data?.answers?.name
    || participant?.survey_data?.name
    || `المشارك #${participant?.assigned_number}`

  return {
    1: name,
    2: String(participant?.assigned_number || "0"),
    3: config?.eventDateText || "TBD",
    4: config?.eventTimeText || "TBD",
    5: config?.arrivalTimeText || "TBD",
    6: config?.locationName || "TBD",
    7: config?.mapUrl || "https://maps.google.com",
  }
}
