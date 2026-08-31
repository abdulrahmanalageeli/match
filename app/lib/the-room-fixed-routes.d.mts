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

/** Every valid arrival gets a route. Table size, gender balance, and repeats are soft preferences. */
export function planFixedRoute(input: FixedRouteInput): FixedRouteResult
