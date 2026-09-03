function timestamp(value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function buildSurveyChangeSummaries(rows) {
  const summaries = {}
  for (const row of rows || []) {
    const participantNumber = Number(row?.participant_number)
    if (!Number.isFinite(participantNumber)) continue

    const percentage = Number(row?.change_percentage) || 0
    const changedAt = row?.changed_at || null
    if (!summaries[participantNumber]) {
      summaries[participantNumber] = {
        count: 0,
        hasSuspicious: false,
        maxPercentage: 0,
        latestPercentage: 0,
        totalFieldsChanged: 0,
        lastChangedAt: null,
      }
    }

    const summary = summaries[participantNumber]
    summary.count += 1
    summary.maxPercentage = Math.max(summary.maxPercentage, percentage)
    summary.totalFieldsChanged += Array.isArray(row?.changed_fields) ? row.changed_fields.length : 0
    summary.hasSuspicious ||= Array.isArray(row?.suspicious_flags) && row.suspicious_flags.length > 0
    if (!summary.lastChangedAt || timestamp(changedAt) > timestamp(summary.lastChangedAt)) {
      summary.latestPercentage = percentage
      summary.lastChangedAt = changedAt
    }
  }
  return summaries
}
