export const PARTICIPANT_BROWSER_IDENTITY_KEYS: readonly string[]

export interface BrowserIdentityStorage {
  removeItem(key: string): void
}

export function clearParticipantBrowserIdentity(
  storage: BrowserIdentityStorage | null | undefined,
): void
