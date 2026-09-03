export const EVENT3_CONTACT_MESSAGE_MAX_LENGTH: number

export type Event3ContactMethod = 'phone' | 'message'

export interface Event3FeedbackPayload extends Record<string, unknown> {
  wantConnect: boolean
  contactMethod?: Event3ContactMethod
  contactMessage?: string
}

export function normalizeEvent3FeedbackPayload(feedback: unknown):
  | { value: Event3FeedbackPayload; error: null }
  | { value: null; error: string }

export function buildEvent3MutualContactShare(input: {
  myFeedback?: Partial<Event3FeedbackPayload> | null
  partnerFeedback?: Partial<Event3FeedbackPayload> | null
  partnerPhone?: string | null
}): {
  mutual_match: boolean
  partner_phone: string | null
  partner_contact_method: Event3ContactMethod | null
  partner_contact_message: string | null
}
