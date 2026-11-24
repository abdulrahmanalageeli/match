import {demoCommunity,demoPeople,type CommunitySource,type PublicPerson} from './data';
import type {Profile} from '../types';

// Sample cards remain local fixtures, never fabricated member accounts.
export function withTestingDiscovery(real:CommunitySource,viewer:()=>Profile, testingOwnerId?:string, tier:()=> 'free'|'premium'|'seriousness'=()=> 'free', generateReading?:import('./simulation').DemoSimulationOptions['generateReading']):CommunitySource {
  const samples=demoCommunity(viewer,false,{membershipTier:tier,interactiveJourney:Boolean(testingOwnerId),generateReading,canAct:()=>Boolean(testingOwnerId),storageKey:testingOwnerId?`wudayn-owner-demo-${testingOwnerId}`:undefined});
  const localConnection=async(id:string)=>Boolean(testingOwnerId)&&(await samples.inbox()).some(row=>row.id===id);
  let watchers=0;
  const sampleIds=new Set(demoPeople.map(person=>person.id));
  const sampleOnly=()=>Promise.reject(new Error('هذا ملف توضيحي للتجربة. يمكنك إرسال طلب تعارف إلى الأعضاء الحقيقيين.'));
  return {...real,
    demoInteractions:testingOwnerId?samples:undefined,
    async inbox(){return [...await real.inbox(),...(testingOwnerId?await samples.inbox():[])];},
    async act(id,action,reason,allowRematch){return (await localConnection(id)?samples:real).act(id,action,reason,allowRematch);},
    async notifications(){
      const [members,local]=await Promise.all([real.notifications?.()??[],testingOwnerId?samples.notifications?.()??[]:[]]);
      return [...members,...local].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    },
    async readNotifications(ids){
      const local=new Set((testingOwnerId?await samples.notifications?.():[])?.map(row=>row.id));
      const memberIds=ids.filter(id=>!local.has(id)),sampleRows=ids.filter(id=>local.has(id));
      if (sampleRows.length) await samples.readNotifications?.(sampleRows);
      if (memberIds.length) await real.readNotifications?.(memberIds);
    },
    async unreadCount(){return await real.unreadCount()+(testingOwnerId?await samples.unreadCount():0);},
    watch(listener){
      const stopReal=real.watch(listener);
      const stopLocal=testingOwnerId?samples.watch(listener):()=>{};
      if(testingOwnerId&&watchers++===0)samples.simulation.start();
      return()=>{stopReal();stopLocal();if(testingOwnerId&&--watchers===0)samples.simulation.pause();};
    },
    async acknowledgeMatch(key){
      const local=testingOwnerId&&(await samples.inbox()).some(row=>row.celebrationKey===key);
      await (local?samples:real).acknowledgeMatch?.(key);
    },

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
      const fixtures=await samples.discover({...filters,mode:'all',eligibleOnly:filters.mode!=='all'||filters.eligibleOnly,offset:Math.max(0,offset-people.length),afterId:undefined});
      for(const person of fixtures)sampleIds.add(person.id);
      return [...people.slice(offset),...fixtures.map(person=>({...person,isDemo:true,online:testingOwnerId?person.online:false}))].slice(0,limit);
    },
    noteProfileOpen:async id=>{if(!sampleIds.has(id))await real.noteProfileOpen?.(id);},
    gallery:async id=>id&&sampleIds.has(id)?[]:await real.gallery?.(id)??[],
    request:id=>sampleIds.has(id)?testingOwnerId?samples.request(id):sampleOnly():real.request(id),
    setInterest:(id,value)=>sampleIds.has(id)?testingOwnerId?samples.setInterest!(id,value):sampleOnly():real.setInterest?.(id,value)??Promise.resolve(),
    dismissPerson:id=>sampleIds.has(id)?samples.dismissPerson!(id):real.dismissPerson?.(id)??Promise.resolve(),
    reportPerson:(id,reason)=>sampleIds.has(id)?testingOwnerId?samples.reportPerson!(id,reason):sampleOnly():real.reportPerson?.(id,reason)??Promise.resolve(),
  };
}
