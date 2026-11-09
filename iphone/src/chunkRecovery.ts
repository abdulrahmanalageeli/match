const recoveryKey = 'nisfayn.chunk-recovery.v1';
const recoveryParameter = '__nf_reload';

export function isChunkLoadFailure(error: unknown): boolean {
  return error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS for|Failed to load module script|Module script load failed/i.test(error.message);
}

type RecoveryOptions = {
  online: boolean;
  currentEntry: string | null;
  currentPage?: string;
  latestEntry: () => Promise<string | null>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  reload: (url?: string) => void;
};

function deployedEntry(value: string | null): URL | null {
  try {
    const url = new URL(value || '');
    return /^https?:$/.test(url.protocol) && /\/assets\/index-[\w-]+\.js$/.test(url.pathname) ? url : null;
  } catch { return null; }
}

// Refresh the document without losing the selected account, invitation fragment,
// or stored session. The release in the marker also bounds automatic retries.
export function recoveryNavigationUrl(currentPage: string, entryHref: string, nonce = Date.now()): string | null {
  try {
    const page = new URL(currentPage);
    const entry = deployedEntry(entryHref);
    if (!/^https?:$/.test(page.protocol) || !entry || entry.origin !== page.origin || !Number.isFinite(nonce)) return null;
    page.searchParams.set(recoveryParameter, `${entry.pathname}:${nonce}`);
    return page.href;
  } catch { return null; }
}

// Only module failures enter recovery. A healthy latest HTML check and a durable
// per-tab guard allow one cache-busted retry, including transient same-release failures.
export async function recoverStaleChunk(error: unknown, options: RecoveryOptions): Promise<'reloaded' | 'offline' | 'unavailable'> {
  if (!isChunkLoadFailure(error)) return 'unavailable';
  if (!options.online) return 'offline';
  const current = deployedEntry(options.currentEntry);
  if (!current) return 'unavailable';
  try {
    const latest = deployedEntry(await options.latestEntry());
    if (!latest || latest.origin !== current.origin || options.storage.getItem(recoveryKey) === latest.href) return 'unavailable';
    const navigation = options.currentPage ? recoveryNavigationUrl(options.currentPage, latest.href) : null;
    if (options.currentPage && !navigation) return 'unavailable';
    // Existing callers without a page URL retain the stricter newer-release behavior.
    if (!navigation && latest.href === current.href) return 'unavailable';
    if (options.currentPage && new URL(options.currentPage).searchParams.get(recoveryParameter)?.startsWith(`${latest.pathname}:`)) return 'unavailable';
    options.storage.setItem(recoveryKey, latest.href);
    if (options.storage.getItem(recoveryKey) !== latest.href) return 'unavailable';
    options.reload(navigation ?? undefined);
    return 'reloaded';
  } catch { return 'unavailable'; }
}
