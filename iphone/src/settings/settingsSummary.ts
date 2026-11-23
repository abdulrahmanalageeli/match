import { useCallback, useEffect, useState } from 'react';
import { callRpc } from '../cloud';
import type { CommunitySource, PublicPerson } from '../community/data';
import type { AccountState } from '../types';

export type ApplePeriod = {
  freeTrial: boolean | null; endsAt: string; autoRenew: boolean | null; billingRetry: boolean | null;
  renewalDate: string | null; milliunits: number | null; currency: string | null;
};
export type SettingsSummary = {
  approvedPreview: PublicPerson | null; subscriptions: ApplePeriod[];
  visibility: 'eligible' | 'paused' | 'draft' | 'review' | 'exclusive' | 'membership' | 'unavailable';
};

const date = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {day:'numeric',month:'long',year:'numeric'});
export const settingsDate = (value: string) => date.format(new Date(value));

export function useSettingsSummary(state: AccountState | null, paused: boolean, source?: CommunitySource | null) {
  const owner = state?.user.id;
  const [result,setResult] = useState<{owner:string;data:SettingsSummary|null;error:boolean} | null>(null);
  const [attempt,setAttempt] = useState(0);
  const refresh = useCallback(()=>setAttempt(n=>n+1),[]);
  useEffect(()=>{
    if (!owner) return;
    const account: string = owner;
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    function read() {
      request?.abort();
      clearTimeout(timer);
      if (document.hidden) { setResult(null); return; }
      const controller = new AbortController();
      request = controller;
      void callRpc<SettingsSummary>('marriage_my_settings',{},account,controller.signal).then(data=>{
        if (controller.signal.aborted) return;
        setResult({owner:account,data,error:false});
        const deadlines = data.subscriptions.map(s=>s.endsAt).map(Date.parse).filter(t=>t>Date.now());
        timer=setTimeout(read,Math.min(60000, ...deadlines.map(t=>t-Date.now()+100)));
      },()=>{ if (!controller.signal.aborted) setResult({owner:account,data:null,error:true}); });
    }
    read();
    const stop=source?.watch(read);
    document.addEventListener('visibilitychange',read);
    window.addEventListener('online',read);
    return ()=>{request?.abort();clearTimeout(timer);stop?.();document.removeEventListener('visibilitychange',read);window.removeEventListener('online',read);};
  },[owner,source,attempt,paused,state?.user.profileReviewPending,state?.user.applicationStatus,state?.membership.status,state?.membership.expiresAt]);
  return {data:result?.owner===owner ? result?.data : null,error:result?.owner===owner && !!result?.error,refresh};
}

export function applePeriodText(period: ApplePeriod) {
  const end = settingsDate(period.endsAt);
  if (period.billingRetry) return 'تعذّر تحصيل الدفعة. يمكنك مراجعة وسيلة الدفع لدى Apple.';
  if (period.autoRenew === false) return 'التجديد متوقف. ينتهي وصولك في ' + end + '.';
  const parts = [period.freeTrial ? 'تنتهي تجربتك المجانية في ' + end + '.' : 'عضوية Apple سارية حتى ' + end + '.'];
  if (period.autoRenew && typeof period.milliunits === 'number' && Number.isSafeInteger(period.milliunits) &&
      period.milliunits >= 0 && period.currency && /^[A-Z]{3}$/.test(period.currency)) {
    const amount = new Intl.NumberFormat('ar-SA',{style:'currency',currency:period.currency}).format(period.milliunits / 1000);
    parts.push('الدفعة التالية ' + amount + (period.renewalDate ? ' في ' + settingsDate(period.renewalDate) : '') + '.');
  } else if (period.autoRenew) parts.push('يمكنك الاطّلاع على مبلغ التجديد لدى Apple.');
  return parts.join(' ');
}
