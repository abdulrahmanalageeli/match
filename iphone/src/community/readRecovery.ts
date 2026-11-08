export const readRetryDelays = [1500, 4000, 10000] as const;

/** Retry reads only. Permission failures and invalid requests need a user action. */
export function canRetryRead(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  return !status || status === 408 || status === 429 || status >= 500;
}

export const retryReadsEvent = 'nisfayn:retry-reads';
