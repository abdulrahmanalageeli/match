export type FixedRouteParticipant = {
  id: string
  /** Validated at runtime: fixed routes accept male or female seating categories. */
  gender: string
}

export type FixedRouteSeat = {
  attendee_id: string
  round_number: number
  table_number: number
  seat_number: number
}

export type FixedRouteInput = {
  attendee: FixedRouteParticipant
  participants: ReadonlyArray<FixedRouteParticipant>
  existingSeats: ReadonlyArray<FixedRouteSeat>
  tableCount: number
  roundCount: number
  activeRound: number
}

export type FixedRouteResult = {
  rows: FixedRouteSeat[]
  /** Total extra encounters with companions already met in this route. */
  repeatPairCount: number
}

export class TheRoomFixedRouteError extends Error {
  code: "INVALID_FIXED_ROUTE_INPUT"
  constructor(message: string)
}

/** Repeats are allowed automatically. Returns null only if remaining-round capacity prevents a complete route. */
export function planFixedRoute(input: FixedRouteInput): FixedRouteResult | null
