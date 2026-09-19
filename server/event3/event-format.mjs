export const EVENT3_FORMAT_CLASSIC = "classic"
export const EVENT3_FORMAT_CHOICE_ONLY = "choice_only_three_groups"
export const EVENT3_FORMAT_MUTUAL_CHOICE = "mutual_choice_six_rounds"

export const EVENT3_FORMATS = Object.freeze([
  EVENT3_FORMAT_CLASSIC,
  EVENT3_FORMAT_CHOICE_ONLY,
  EVENT3_FORMAT_MUTUAL_CHOICE,
])

export function normalizeEvent3Format(value) {
  return EVENT3_FORMATS.includes(value) ? value : EVENT3_FORMAT_CLASSIC
}

export function isChoiceOnlyEvent3(value) {
  return normalizeEvent3Format(value) === EVENT3_FORMAT_CHOICE_ONLY
}

export function event3GroupRoundCount(value) {
  return isMutualChoiceEvent3(value) ? 6 : isChoiceOnlyEvent3(value) ? 3 : 2
}

export function isMutualChoiceEvent3(value) {
  return normalizeEvent3Format(value) === EVENT3_FORMAT_MUTUAL_CHOICE
}

export async function loadEvent3Format(supabase, matchId, eventId) {
  if (!eventId) return EVENT3_FORMAT_CLASSIC
  const result = await supabase
    .from("event3_event_settings")
    .select("event_format")
    .eq("match_id", matchId)
    .eq("event_id", eventId)
    .maybeSingle()

  // A missing row is the compatibility contract for every event created before
  // the format switch. A missing table also degrades to classic during rollout;
  // other read failures must surface so an active choice-only edition can never
  // be routed through the classic flow by accident.
  if (result.error) {
    const message = `${result.error.message || ""} ${result.error.details || ""}`.toLowerCase()
    const missingTable = ["42P01", "PGRST205"].includes(result.error.code)
      || message.includes("event3_event_settings") && (message.includes("does not exist") || message.includes("schema cache"))
    if (missingTable) return EVENT3_FORMAT_CLASSIC
    throw result.error
  }
  return normalizeEvent3Format(result.data?.event_format)
}
