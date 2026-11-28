import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MemberNoticeObservation, incomingNotices, visitNotices, allowsMemberNotice } from './memberNoticeObservation';
import { defaultPushControls, pushControls, type PushControls } from './push';
import memberAr from '../member-copy.ts';
import type { CommunitySource } from '../community/data';
import { denied } from '../community/chatOutbox';
import { publishChatScreenshots } from './chatScreenshots';
import { compatibilitySnapshot, compareCompatibility, type CompatibilityChange, type CompatibilitySnapshot } from '../compatibility/changes';
import type { MatchFit } from '../compatibility/model';
import './activity.css';

export const journeyStages = memberAr.stages;
export type CompatibilityUpdate = {
  id: string; name: string; fit: MatchFit; before: CompatibilitySnapshot;
  change: CompatibilityChange; at: string; unread: boolean;
};

function blockedSurface() {
  return document.hidden || !!document.querySelector('dialog[open], .nf-call-banner, [aria-modal="true"]:not(dialog):not([hidden]), html[data-capture-native-hidden], html[data-capture-hidden]');
}

export function useMemberActivity(source: CommunitySource | null, present = false, pushOwner: string | null = null) {
  const observed = useMemo(() => new MemberNoticeObservation(), [source]);
  const notice = useSyncExternalStore(observed.subscribe, observed.first, () => null);
  const controls = useRef<PushControls | null>(null);
  const refreshNow = useRef<{source: CommunitySource; refresh: () => void} | null>(null);
  useLayoutEffect(() => {
    controls.current = null;
    observed.reset();
    if (!source || !present) return;
    let revision = 0;
    const preferences = () => {
      const current = ++revision;
      controls.current = pushOwner ? null : defaultPushControls;
      if (pushOwner) void pushControls(pushOwner).then(value => {
        if (revision === current) controls.current = value;
      }).catch(() => {});
    };
    const refreshCurrent = () => { if (refreshNow.current?.source===source) refreshNow.current.refresh(); };
    const retryPreferences = () => { if (!document.hidden && !controls.current) preferences(); };
    const settingsChanged = () => { observed.reset(); preferences(); refreshCurrent(); };
    const opened = (event: Event) => {
      const detail = (event as CustomEvent<{source: CommunitySource; key: string}>).detail;
      if (detail?.source === source) observed.dismiss(detail.key);
    };
    preferences();
    refreshCurrent();
    window.addEventListener('online', retryPreferences);
    document.addEventListener('visibilitychange', retryPreferences);
    window.addEventListener('wudayn:push-controls', settingsChanged);
    window.addEventListener('wudayn:member-notice-opened', opened);
    return () => {
      revision++; controls.current = null;
      window.removeEventListener('online', retryPreferences);
      document.removeEventListener('visibilitychange', retryPreferences);
      window.removeEventListener('wudayn:push-controls', settingsChanged);
      window.removeEventListener('wudayn:member-notice-opened', opened);
    };
  }, [observed, source, present, pushOwner]);
  useLayoutEffect(() => {
    if (!notice) return;
    const invalidate = () => { if (blockedSurface()) observed.reset(); };
    invalidate();
    const surfaces = new MutationObserver(invalidate);
    surfaces.observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['open','aria-modal','data-capture-native-hidden','data-capture-hidden']});
    return () => surfaces.disconnect();
  }, [observed, notice?.key]);
  const [state, setState] = useState<{source: CommunitySource; changes: CompatibilityUpdate[]} | null>(null);
  useEffect(() => {
    if (!source) return;
    const owner=source;
    let active=true, busy=false, again=false;
    let activityAt=0, trailing:number|undefined, activityRead=0, applied=0;
    const fits=new Map<string, CompatibilitySnapshot>();
    async function refresh() {
      if (!active || document.hidden) return;
      if (busy) { again=true; return; }
      busy=true;
      try {
        const epoch=observed.epoch;
        const delay=2500-(Date.now()-activityAt);
        if (delay<=0) {
          activityAt=Date.now(); window.clearTimeout(trailing); trailing=undefined;
          const seq=++activityRead;
          void owner.notifications?.().then(rows=>{
            if(!active || seq < applied) return;
            applied=seq;
            publishChatScreenshots(owner,rows);
            observed.observe('visit',visitNotices(rows),epoch,!!controls.current && !blockedSurface() && allowsMemberNotice('visit',controls.current,Date.now()));
          }).catch(error=>{ if(active && seq>=applied && epoch===observed.epoch && denied(error)) observed.reset(); });
        } else if(trailing===undefined) {
          trailing=window.setTimeout(()=>{trailing=undefined;void refresh();},delay);
        }
        const connections=await owner.inbox();
        if(!active)return;
        observed.observe('request',incomingNotices(connections,Date.now()),epoch,!!controls.current && !blockedSurface() && allowsMemberNotice('request',controls.current,Date.now()));
        const rows=connections.filter(row=>row.status==='accepted');
        const observedFits=rows.map(row=>({row,before:fits.get(row.id),now:compatibilitySnapshot(row.person.fit)}));
        fits.clear();
        for(const {row,now} of observedFits)if(now)fits.set(row.id,now);
        setState(current=>{
          const previous=current?.source===owner?current.changes:[];
          const changes=observedFits.flatMap(({row,before,now})=>{
            const retained=previous.find(item=>item.id===row.id);
            const baseline=retained?.before??before;
            const change=compareCompatibility(baseline,now);
            if(!baseline||!change||!row.person.fit)return [];
            const same=retained?.change.key===change.key;
            return [{id:row.id,name:row.person.alias,fit:row.person.fit,before:baseline,change,
              at:same?retained.at:new Date().toISOString(),unread:same?retained.unread:true}];
          });
          return previous.length||changes.length?{source:owner,changes}:current;
        });
      } catch(error) { if(active && denied(error)) observed.reset(); }
      finally { busy=false; if(again){again=false;void refresh();} }
    }
    const beat=()=>{if(!document.hidden)void owner.heartbeat?.().catch(()=>{});};
    refreshNow.current = {source: owner, refresh};
    const visibility = () => { observed.reset(); activityAt=0; void refresh(); };
    void refresh();beat();
    const stop=owner.watch(refresh), heartbeat=owner.heartbeat?window.setInterval(beat,30000):undefined;
    document.addEventListener('visibilitychange',visibility);
    document.addEventListener('visibilitychange',beat);
    return ()=>{
      refreshNow.current=null;active=false;stop();window.clearTimeout(trailing);window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange',visibility);
      document.removeEventListener('visibilitychange',beat);
    };
  },[source,observed]);
  const changes=state?.source===source?state.changes:[];
  const read=(id:string,key:string)=>setState(current=>current?.source===source?{
    ...current,changes:current.changes.map(row=>row.id===id&&row.change.key===key?{...row,unread:false}:row),
  }:current);
  return {changes,read,notice:present ? notice : null,dismissNotice:(key:string)=>observed.dismiss(key)};
}
