export function adminReadAction(input: RequestInfo | URL, init?: RequestInit): string | null;
export function createAdminFetch(fetcher?: typeof fetch, options?: { readTimeoutMs?: number; notify?: (detail: {action: string; state: string; at: number; status?: number}) => void }): typeof fetch;
export const adminFetch: typeof fetch;
