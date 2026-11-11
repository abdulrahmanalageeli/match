import {demoCommunity,type CommunitySource,type PublicPerson} from './data';
import type {Profile} from '../types';

// Sample cards remain local fixtures, never fabricated member accounts.
export function withTestingDiscovery(real:CommunitySource,viewer:()=>Profile):CommunitySource {
  const samples=demoCommunity(viewer,false,{canAct:()=>false});
  const sampleIds=new Set<string>();
  const sampleOnly=()=>Promise.reject(new Error('هذا ملف توضيحي للتجربة. يمكنك إرسال طلب تعارف إلى الأعضاء الحقيقيين.'));
  return {...real,
    async discover(filters){
      const offset=filters.offset??0,limit=filters.mode==='all'?24:5;
      const people:PublicPerson[]=[];
      // Read the real directory first; keep server visibility and blocking rules.
      for(let page=0;page<=offset;page+=24){
        const rows=await real.discover({...filters,offset:page,afterId:undefined});
        people.push(...rows);
        if(rows.length<24||filters.mode!=='all')break;
      }
      if(people.length>=offset+limit)return people.slice(offset,offset+limit);
      const fixtures=await samples.discover({...filters,mode:'all',offset:0,afterId:undefined});
      for(const person of fixtures)sampleIds.add(person.id);
      return [...people,...fixtures.map(person=>({...person,isDemo:true,online:false}))].slice(offset,offset+limit);
    },
    noteProfileOpen:async id=>{if(!sampleIds.has(id))await real.noteProfileOpen?.(id);},
    gallery:async id=>id&&sampleIds.has(id)?[]:await real.gallery?.(id)??[],
    request:id=>sampleIds.has(id)?sampleOnly():real.request(id),
    setInterest:(id,value)=>sampleIds.has(id)?sampleOnly():real.setInterest?.(id,value)??Promise.resolve(),
    dismissPerson:id=>sampleIds.has(id)?samples.dismissPerson!(id):real.dismissPerson?.(id)??Promise.resolve(),
    reportPerson:(id,reason)=>sampleIds.has(id)?sampleOnly():real.reportPerson?.(id,reason)??Promise.resolve(),
  };
}
