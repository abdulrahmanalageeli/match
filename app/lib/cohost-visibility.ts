const PRIVATE_PARTICIPANT_NUMBER = 7

// Presentation only: this does not change API permissions or stored event data.
export function isCohostDetailVisible(...numbers: unknown[]) {
  return !numbers.some(number => Number(number) === PRIVATE_PARTICIPANT_NUMBER)
}

interface ParticipantView {
  number: number
  tables: Record<string, number>
  phase2_partner: number | null
  phase3_partner: number | null
}

interface PairView {
  participant1_number: number
  participant2_number: number
  table_number: number | null
}

interface NoteView {
  scope_type: string
  round?: number | null
  table_number?: number | null
  participant_number?: number | null
  participant2_number?: number | null
}

interface DashboardView {
  participants: ParticipantView[]
  choice_pairs?: PairView[]
  algorithm_pairs?: PairView[]
  locked_phase3_pairs?: PairView[]
  notes?: NoteView[]
  sos_requests?: Array<{
    participant_number: number
    partner_number?: number | null
    partner_name?: string | null
    table_info: string | null
  }>
}

export function cohostDashboardView<T extends DashboardView>(data: T): T {
  const rounds = [
    { round: '20', partnerKey: 'phase2_partner' as const, pairs: data.choice_pairs || [] },
    { round: '30', partnerKey: 'phase3_partner' as const, pairs: [...(data.algorithm_pairs || []), ...(data.locked_phase3_pairs || [])] },
  ].map(item => {
    const members = new Set<number>([PRIVATE_PARTICIPANT_NUMBER])
    const tables = new Set<number>()
    for (const participant of data.participants) {
      if (!isCohostDetailVisible(participant.number, participant[item.partnerKey])) {
        members.add(Number(participant.number))
        if (participant[item.partnerKey]) members.add(Number(participant[item.partnerKey]))
      }
    }
    for (const pair of item.pairs) {
      if (!isCohostDetailVisible(pair.participant1_number, pair.participant2_number)) {
        members.add(Number(pair.participant1_number))
        members.add(Number(pair.participant2_number))
        if (pair.table_number) tables.add(Number(pair.table_number))
      }
    }
    for (const participant of data.participants) {
      const table = Number(participant.tables?.[item.round])
      if (members.has(Number(participant.number)) && table) tables.add(table)
    }
    return { ...item, members, tables }
  })
  const visiblePair = (pair: PairView) => isCohostDetailVisible(pair.participant1_number, pair.participant2_number)
  return {
    ...data,
    participants: data.participants.map(participant => {
      const view = { ...participant, tables: { ...participant.tables } }
      for (const item of rounds) {
        if (item.members.has(Number(participant.number)) || item.tables.has(Number(participant.tables?.[item.round]))) {
          view[item.partnerKey] = null
          delete view.tables[item.round]
        }
      }
      return view
    }),
    choice_pairs: data.choice_pairs?.filter(visiblePair),
    algorithm_pairs: data.algorithm_pairs?.filter(visiblePair),
    locked_phase3_pairs: data.locked_phase3_pairs?.filter(visiblePair),
    notes: data.notes?.filter(note => {
      if (!isCohostDetailVisible(note.participant_number, note.participant2_number)) return false
      return note.scope_type !== 'table' || !rounds.some(item => Number(item.round) === Number(note.round) && item.tables.has(Number(note.table_number)))
    }),
    sos_requests: data.sos_requests?.map(request => request.partner_number && !isCohostDetailVisible(request.participant_number, request.partner_number)
      ? { ...request, partner_number: null, partner_name: null, table_info: null }
      : request),
  }
}
