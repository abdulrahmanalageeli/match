export const PARTICIPANT_BROWSER_TOKEN_KEYS: readonly string[]
export const PARTICIPANT_BROWSER_IDENTITY_KEYS: readonly string[]

export interface BrowserTokenStorage {
  getItem(key: string): string | null
}

export interface BrowserIdentityStorage {
  removeItem(key: string): void
}

export function getParticipantBrowserToken(
  storage: BrowserTokenStorage | null | undefined,
): string | null

export function clearParticipantBrowserIdentity(
  storage: BrowserIdentityStorage | null | undefined,
): void
