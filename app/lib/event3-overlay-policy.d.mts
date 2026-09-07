export interface Event3PromptVisibilityInput {
  phase?: string | null
  hasPendingMoodCheck?: boolean
  hasPendingNotification?: boolean
  hasUrgentNotification?: boolean
  interactionOverlayOpen?: boolean
  showAiWelcome?: boolean
}

export interface Event3PromptVisibility {
  isSafePromptMoment: boolean
  canShowMoodCheck: boolean
  canShowNotification: boolean
  canShowAiWelcome: boolean
}

export declare function resolveEvent3PromptVisibility(
  input: Event3PromptVisibilityInput,
): Event3PromptVisibility
