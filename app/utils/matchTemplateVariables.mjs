export function resolveParticipantName(participant) {
  const candidates = [
    participant?.name,
    participant?.survey_data?.answers?.name,
    participant?.survey_data?.name,
  ]
  for (const candidate of candidates) {
    const name = String(candidate ?? "").trim()
    if (name) return name
  }
  return `المشارك #${participant?.assigned_number}`
}

export function buildMatchTemplateVariables(participant, config) {
  const name = resolveParticipantName(participant)

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
