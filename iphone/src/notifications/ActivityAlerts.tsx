import { useEffect, useState } from 'react';
import memberAr from '../member-copy.ts';
import type { CommunitySource } from '../community/data';
import { publishChatScreenshots } from './chatScreenshots';
import { compatibilitySnapshot, compareCompatibility, type CompatibilityChange, type CompatibilitySnapshot } from '../compatibility/changes';
import type { MatchFit } from '../compatibility/model';
import './activity.css';

export const journeyStages = memberAr.stages;
export type CompatibilityUpdate = {
  id: string; name: string; fit: MatchFit; before: CompatibilitySnapshot;
  change: CompatibilityChange; at: string; unread: boolean;
};

// The feed owns presentation. Chat still receives authorized screenshot events.
export function useMemberActivity(source: CommunitySource | null) {
  const [state, setState] = useState<{source: CommunitySource; changes: CompatibilityUpdate[]} | null>(null);
  useEffect(() => {
    if (!source) return;
    const owner=source;
    let active=true, busy=false, again=false;
    let activityAt=0, trailing:number|undefined;
    const fits=new Map<string, CompatibilitySnapshot>();
    async function refresh() {
      if (!active || document.hidden) return;
      if (busy) { again=true; return; }
      busy=true;
      try {
        const delay=2500-(Date.now()-activityAt);
        if (delay<=0) {
          activityAt=Date.now(); window.clearTimeout(trailing); trailing=undefined;
          void owner.notifications?.().then(rows=>{
            if(active)publishChatScreenshots(owner,rows);
          }).catch(()=>{});
        } else if(trailing===undefined) {
          trailing=window.setTimeout(()=>{trailing=undefined;void refresh();},delay);
        }
        const rows=(await owner.inbox()).filter(row=>row.status==='accepted');
        if(!active)return;
        const observed=rows.map(row=>({row,before:fits.get(row.id),now:compatibilitySnapshot(row.person.fit)}));
        fits.clear();
        for(const {row,now} of observed)if(now)fits.set(row.id,now);
        setState(current=>{
          const previous=current?.source===owner?current.changes:[];
          const changes=observed.flatMap(({row,before,now})=>{
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
      } catch { /* The inbox owns connection errors. */ }
      finally { busy=false; if(again){again=false;void refresh();} }
    }
    const beat=()=>{if(!document.hidden)void owner.heartbeat?.().catch(()=>{});};
    void refresh();beat();
    const stop=owner.watch(refresh), heartbeat=owner.heartbeat?window.setInterval(beat,30000):undefined;
    document.addEventListener('visibilitychange',refresh);
    document.addEventListener('visibilitychange',beat);
    return ()=>{
      active=false;stop();window.clearTimeout(trailing);window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange',refresh);
      document.removeEventListener('visibilitychange',beat);
    };
  },[source]);
  const changes=state?.source===source?state.changes:[];
  const read=(id:string,key:string)=>setState(current=>current?.source===source?{
    ...current,changes:current.changes.map(row=>row.id===id&&row.change.key===key?{...row,unread:false}:row),
  }:current);
  return {changes,read};
}
