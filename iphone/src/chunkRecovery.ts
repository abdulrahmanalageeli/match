const recoveryKey = 'nisfayn.chunk-recovery.v1';

export function isChunkLoadFailure(error: unknown): boolean {
  return error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS for/i.test(error.message);
}

type RecoveryOptions = {
  online: boolean;
  currentEntry: string | null;
  latestEntry: () => Promise<string | null>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  reload: () => void;
};

function deployedEntry(value: string | null): URL | null {
  try {
    const url = new URL(value || '');
    return /^https?:$/.test(url.protocol) && /\/assets\/index-[\w-]+\.js$/.test(url.pathname) ? url : null;
  } catch { return null; }
}

// Used only by the render boundary, never by background preloads or voice setup.
// A known newer entry and a durable per-tab guard are required before refreshing.
export async function recoverStaleChunk(error: unknown, options: RecoveryOptions): Promise<'reloaded' | 'offline' | 'unavailable'> {
  if (!isChunkLoadFailure(error)) return 'unavailable';
  if (!options.online) return 'offline';
  const current = deployedEntry(options.currentEntry);
  if (!current) return 'unavailable';
  try {
    const latest = deployedEntry(await options.latestEntry());
    if (!latest || latest.origin !== current.origin || latest.href === current.href || options.storage.getItem(recoveryKey) === latest.href) return 'unavailable';
    options.storage.setItem(recoveryKey, latest.href);
    if (options.storage.getItem(recoveryKey) !== latest.href) return 'unavailable';
    options.reload();
    return 'reloaded';
  } catch { return 'unavailable'; }
}
