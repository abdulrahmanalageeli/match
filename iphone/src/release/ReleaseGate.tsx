import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cloudConnection, cloudSelected } from '../cloud';
import { publicationBuild } from '../publishing/appBuild';
import { readPolicy, type ReleasePolicy, type ReleasePlatform } from './policy';
import { ReleaseScreen, type ReleaseScreenState } from './ReleaseScreen';

const platform: ReleasePlatform = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios' ? 'ios' : 'web';
const cacheKey = 'wudayn.release.' + platform + '.' + cloudConnection.url;

function cachedPolicy() {
  try { return readPolicy(JSON.parse(localStorage.getItem(cacheKey) ?? 'null'), platform); }
  catch { return null; }
}

async function latestPolicy(signal: AbortSignal) {
  if (!cloudConnection.url || !cloudConnection.key) throw new Error('Missing release endpoint');
  const response = await fetch(cloudConnection.url + '/rest/v1/rpc/wudayn_release_policy', {
    method: 'POST', headers: { apikey: cloudConnection.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_platform: platform }), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
  });
  if (!response.ok) throw new Error('Release policy unavailable');
  return readPolicy(await response.json(), platform);
}

function installedBuild() {
  return platform === 'web' ? Promise.resolve(publicationBuild()) : import('../notifications/push').then(m => m.readNativeBuild());
}

type Props = { children: ReactNode; resumeHint?: string };

export function ReleaseGate(props: Props) {
  if (!cloudSelected || import.meta.env.VITE_MARRIAGE_ENV === 'demo') return <>{props.children}</>;
  return <LiveReleaseGate {...props}/>;
}

function LiveReleaseGate({ children, resumeHint }: Props) {
  const [policy, setPolicy] = useState<ReleasePolicy | null>(cachedPolicy);
  const [build, setBuild] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [actionError, setActionError] = useState('');
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(cacheKey + '.later') ?? ''; } catch { return ''; }
  });
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let running: AbortController | null = null;
    let disposed = false;
    async function check() {
      if (disposed || running || document.hidden) return;
      const request = new AbortController();
      running = request;
      // Bound both the network request and a stalled native bridge response.
      const timeout = window.setTimeout(() => request.abort(), 7000);
      const aborted = new Promise<never>((_, reject) =>
        request.signal.addEventListener('abort', () => reject(new Error('Release check interrupted')), { once: true }));
      setBusy(true);
      try {
        const currentBuild = installedBuild().then(value => {
          if (!disposed && !request.signal.aborted) setBuild(value);
        });
        const [fresh] = await Promise.race([
          Promise.all([latestPolicy(request.signal).catch(() => null), currentBuild]), aborted,
        ]);
        if (disposed || request.signal.aborted) return;
        if (!fresh) throw new Error('Release policy unavailable');
        try { localStorage.setItem(cacheKey, JSON.stringify(fresh)); } catch { /* Private browsing */ }
        setPolicy(fresh);
        setVerified(true);
        setFailed(false);
        setActionError('');
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
        request.abort();
        running = null;
        if (!disposed) setBusy(false);
      }
    }
    refresh.current = check;
    void check();
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    const interval = window.setInterval(check, 60000);
    return () => {
      disposed = true;
      running?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  useEffect(() => {
    if (!policy?.maintenanceUntil) return;
    const timer = window.setTimeout(() => refresh.current(), Math.max(0, Date.parse(policy.maintenanceUntil) - Date.now()) + 100);
    return () => window.clearTimeout(timer);
  }, [policy?.maintenanceUntil]);

  let screen: ReleaseScreenState | undefined;
  const [dismissedBuild, dismissedTarget] = dismissed.split('/').map(Number);
  const alreadyDismissed = dismissedBuild === build && dismissedTarget >= (policy?.recommendedBuild ?? 0);
  if (policy && build !== null && build < policy.minimumBuild) screen = 'required';
  else if (policy?.maintenanceUntil && (verified || Date.parse(policy.maintenanceUntil) > Date.now())) screen = 'maintenance';
  else if (!verified || !policy || build === null) screen = failed ? 'unavailable' : 'checking';
  else if (build < policy.recommendedBuild && !alreadyDismissed) screen = 'recommended';

  const update = async () => {
    setActionError('');
    if (platform === 'web') { window.location.reload(); return; }
    if (!policy?.storeUrl) return;
    try { await (await import('../notifications/push')).openStoreListing(policy.storeUrl); }
    catch { setActionError('تعذّر فتح App Store. حاول مرة أخرى.'); }
  };
  const later = () => {
    const dismissalKey = build + '/' + policy?.recommendedBuild;
    setDismissed(dismissalKey);
    try { sessionStorage.setItem(cacheKey + '.later', dismissalKey); } catch { /* In-memory dismissal still works. */ }
  };
  const notice = screen && <ReleaseScreen state={screen} platform={platform} storeUrl={policy?.storeUrl ?? null}
    maintenanceUntil={policy?.maintenanceUntil ?? null} resumeHint={resumeHint} busy={busy} actionError={actionError}
    onRetry={() => refresh.current()} onUpdate={update} onLater={later}/>;
  return <>{notice}{(!screen || screen === 'recommended') && children}</>;
}
