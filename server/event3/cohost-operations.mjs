const NOTE_ROUNDS = new Set([1, 2, 3, 20, 30])
const CHOICE_ONLY_NOTE_ROUNDS = new Set([...NOTE_ROUNDS, 40])
const CHOICE_ONLY_PAIR_NOTE_ROUNDS = new Set([20, 30, 40])
const CHOICE_ONLY_EVENT_FORMAT = "choice_only_three_groups"

export function getCohostNoteContext(state, eventId) {
  const testMode = state?.test_mode_active === true
    && Number(state.current_event_id) === Number(eventId)
  return {
    testMode,
    testSessionKey: testMode ? String(state.test_session_started_at || "legacy") : "",
  }
}

function positiveInteger(value, field) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${field} must be a positive integer`)
  }
  return parsed
}

export function normalizeCohostNoteScope(input = {}, eventFormat = "classic") {
  const scopeType = String(input.scope_type || "").trim()
  const choiceOnly = eventFormat === CHOICE_ONLY_EVENT_FORMAT
  if (scopeType === "event") {
    return {
      scope_type: "event",
      scope_key: "event",
      round: null,
      table_number: null,
      participant_number: null,
      participant2_number: null,
    }
  }

  if (scopeType === "table") {
    const round = positiveInteger(input.round, "round")
    const tableNumber = positiveInteger(input.table_number, "table_number")
    if (!(choiceOnly ? CHOICE_ONLY_NOTE_ROUNDS : NOTE_ROUNDS).has(round)) throw new TypeError("round is not supported")
    return {
      scope_type: "table",
      scope_key: `table:${round}:${tableNumber}`,
      round,
      table_number: tableNumber,
      participant_number: null,
      participant2_number: null,
    }
  }

  if (scopeType === "participant") {
    const participantNumber = positiveInteger(input.participant_number, "participant_number")
    return {
      scope_type: "participant",
      scope_key: `participant:${participantNumber}`,
      round: null,
      table_number: null,
      participant_number: participantNumber,
      participant2_number: null,
    }
  }

  if (scopeType === "pair") {
    const round = positiveInteger(input.round, "round")
    if (!(choiceOnly ? CHOICE_ONLY_PAIR_NOTE_ROUNDS.has(round) : round === 20 || round === 30)) {
      throw new TypeError(choiceOnly ? "pair notes require round 20, 30, or 40" : "pair notes require round 20 or 30")
    }
    const first = positiveInteger(input.participant_number, "participant_number")
    const second = positiveInteger(input.participant2_number, "participant2_number")
    if (first === second) throw new TypeError("pair participants must be different")
    const participantNumber = Math.min(first, second)
    const participant2Number = Math.max(first, second)
    return {
      scope_type: "pair",
      scope_key: `pair:${round}:${participantNumber}-${participant2Number}`,
      round,
      table_number: null,
      participant_number: participantNumber,
      participant2_number: participant2Number,
    }
  }

  throw new TypeError("scope_type must be event, table, participant, or pair")
}

export function buildReciprocalRankingLookup(rows = []) {
  const lookup = new Map()
  for (const row of rows) {
    const ranker = Number(row?.ranker_number)
    const ranked = Number(row?.ranked_number)
    const rank = Number(row?.rank)
    if (!Number.isInteger(ranker) || !Number.isInteger(ranked) || !Number.isInteger(rank) || rank <= 0) continue
    lookup.set(`${ranker}:${ranked}`, rank)
  }
  return (rankerNumber, rankedNumber) => lookup.get(`${Number(rankedNumber)}:${Number(rankerNumber)}`) ?? null
}

export function selectCohostLockedScoreSource(lock, rows = []) {
  const pairKey = (a, b) => `${Math.min(Number(a), Number(b))}-${Math.max(Number(a), Number(b))}`
  const key = pairKey(lock.a ?? lock.participant1_number, lock.b ?? lock.participant2_number)
  const total = lock.compatibility_score ?? lock.original_compatibility_score
  const matchesTotal = row => total != null && Number(row.compatibility_score) === Number(total)
  const matchesRound = row => lock.original_match_round != null && Number(row.round) === Number(lock.original_match_round)
  return rows
    .filter(row => pairKey(row.participant_a_number, row.participant_b_number) === key)
    .sort((left, right) => Number(matchesTotal(right)) - Number(matchesTotal(left))
      || Number(matchesRound(right)) - Number(matchesRound(left))
      || (Date.parse(right.created_at || "") || 0) - (Date.parse(left.created_at || "") || 0))[0] || null
}
