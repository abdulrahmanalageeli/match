import { useEffect, useRef } from 'react';
import { readRetryDelays, retryReadsEvent } from './readRecovery';

/** A bounded recovery loop for visible read-only screens; never resubmits a mutation. */
export function useReadRecovery(failed: boolean, retry: () => Promise<unknown>, owner: object) {
  const current = useRef(retry); current.current = retry;
  useEffect(() => {
    let active = true, busy = false, attempts = 0, timer: number | undefined;
    const clear = () => { if (timer !== undefined) window.clearTimeout(timer); timer = undefined; };
    const schedule = () => {
      clear();
      if (failed && active && attempts < readRetryDelays.length && navigator.onLine && !document.hidden)
        timer = window.setTimeout(() => { attempts++; void recover(); }, readRetryDelays[attempts]);
    };
    const recover = async () => {
      if (!active || busy || document.hidden || !navigator.onLine) return;
      busy = true; clear();
      try { await current.current(); } catch { /* The owning screen presents its error. */ }
      finally { busy = false; schedule(); }
    };
    const wake = () => { attempts = 0; void recover(); };
    const visibility = () => { if (document.hidden) clear(); else if (failed) wake(); };
    schedule();
    window.addEventListener('online', wake);
    window.addEventListener('offline', clear);
    window.addEventListener(retryReadsEvent, wake);
    document.addEventListener('visibilitychange', visibility);
    return () => { active = false; clear(); window.removeEventListener('online', wake); window.removeEventListener('offline', clear); window.removeEventListener(retryReadsEvent, wake); document.removeEventListener('visibilitychange', visibility); };
  }, [failed, owner]);
}
