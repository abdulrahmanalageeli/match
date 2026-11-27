import {demoCommunity,demoPeople,type CommunitySource,type Filters,type PublicPerson} from './data';
import type {LunaPerson,LunaResults} from './lunaSearchClient';
import {demoLunaScore} from './demoLunaSearch';
import {selectRecommendations} from './recommendations';
import type {Profile} from '../types';

// Sample cards remain local fixtures, never fabricated member accounts.
export function withTestingDiscovery(real:CommunitySource,viewer:()=>Profile, testingOwnerId?:string, tier:()=> 'free'|'premium'|'seriousness'=()=> 'free', generateReading?:import('./simulation').DemoSimulationOptions['generateReading']):CommunitySource {
  let liveExclusive = true;
  const samples=demoCommunity(viewer,false,{membershipTier:tier,interactiveJourney:Boolean(testingOwnerId),useAvailableTesterBasics:Boolean(testingOwnerId),generateReading,canAct:()=>Boolean(testingOwnerId)&&!liveExclusive,storageKey:testingOwnerId?`wudayn-owner-demo-${testingOwnerId}`:undefined});
  const localConnection=(id:string)=>Boolean(testingOwnerId)&&samples.ownsConnection(id);
  let watchers=0;
  const sampleIds=new Set(demoPeople.map(person=>person.id));
  const sampleOnly=()=>Promise.reject(new Error('هذا ملف توضيحي للتجربة. يمكنك إرسال طلب تعارف إلى الأعضاء الحقيقيين.'));
  const sampleCard=(person:PublicPerson)=>({...person,isDemo:true,online:testingOwnerId?person.online:false});

  type Connections = Awaited<ReturnType<CommunitySource['inbox']>>;
  let pendingLive: Promise<Connections> | undefined;
  function readLive() {
    return pendingLive ??= real.inbox().then(live => {
      const exclusive = live.find(row => row.status === 'accepted' && row.person.exclusive);
      liveExclusive = Boolean(exclusive);
      if (exclusive && testingOwnerId) samples.retireOtherConnections();
      return exclusive ? [exclusive] : live;
    }).finally(() => { pendingLive = undefined; });
  }
  async function readConnections() {
    const live = await readLive();
    if (liveExclusive || !testingOwnerId) return live;
    const local = await samples.inbox();
    const exclusiveId = samples.exclusiveConnection();
    return exclusiveId ? local.filter(row => row.id === exclusiveId) : [...live, ...local];
  }
  async function restricted() {
    await readLive();
    return liveExclusive || Boolean(testingOwnerId && samples.exclusiveConnection());
  }
  async function requireDiscovery() {
    if (await restricted()) throw Error('أنت في تعارف حصري.');
  }
  async function readMembersThrough(filters: Filters | LunaResults['options'], lastOffset: number) {
    const members: PublicPerson[] = [];
    for (let offset = 0; offset <= lastOffset; offset += 24) {
      const page = await real.discover({ ...filters, offset, afterId: undefined });
      members.push(...page);
      if (page.length < 24 || filters.mode !== 'all') break;
    }
    return members;
  }

  async function appendSamples<T extends LunaPerson>(people:T[], filters:Filters | LunaResults['options']) {
    const offset=filters.offset??0,limit=filters.mode==='all'?24:5;
    if(filters.mode!=='all'){
      const fixtures=(await samples.discover({...filters,mode:'recommended',eligibleOnly:true,offset:0,subjectId:undefined,afterId:undefined})).slice(0,5)
        .filter(row=>!('luna' in filters)||demoLunaScore(row,filters)>=0).map(sampleCard);
      const selection=selectRecommendations<T|PublicPerson>([...people,...fixtures]);
      if(filters.subjectId)return selection.filter(person=>person.id===filters.subjectId);
      const start=filters.offset??(filters.afterId?selection.findIndex(person=>person.id===filters.afterId)+1:0);
      return selection.slice(start);
    }
    if(people.length>=offset+limit)return people.slice(offset,offset+limit);
    const sampleOffset=Math.max(0,offset-people.length);
    const sampleFilters:Filters={...filters,mode:'all',afterId:undefined};
    let fixtures:PublicPerson[];
    if('luna' in filters){
      // Score eligible published samples before pagination, using the same plan as the live search.
      const matches:{person:PublicPerson;score:number}[]=[];
      for(let page=0;;page+=24){
        const rows=await samples.discover({...sampleFilters,eligibleOnly:true,offset:page});
        for(const row of rows){
          const person=sampleCard(row);
          const score=demoLunaScore(person,filters);
          if(score>=0)matches.push({person,score});
        }
        if(rows.length<24)break;
      }
      matches.sort((a,b)=>{
        const ageOrder=filters.sort==='youngest'?a.person.age-b.person.age:filters.sort==='oldest'?b.person.age-a.person.age:0;
        return ageOrder||b.score-a.score;
      });
      fixtures=matches.slice(sampleOffset,sampleOffset+limit).map(match=>match.person);
    }else{
      fixtures=(await samples.discover({...sampleFilters,offset:sampleOffset})).map(sampleCard);
    }
    for(const person of fixtures)sampleIds.add(person.id);
    return [...people.slice(offset),...fixtures].slice(0,limit);
  }
  return {...real,
    lunaSearch:real.lunaSearch && (async(query,filters)=>{
      await requireDiscovery();
      const result=await real.lunaSearch!(query,filters);
      const people = await appendSamples(result.people,result.options);
      if(!people.some(person=>person.isDemo))return {...result,people};
      const {lunaResultCard}=await import('./lunaResultCard.mjs');
      return {...result,people:people.map(person => person.isDemo
        ? lunaResultCard(person as PublicPerson,result.options) : person)};
    }),
    demoInteractions:testingOwnerId?samples:undefined,
    inbox: readConnections,
    async act(id,action,reason,allowRematch){if(action==='accept') await requireDiscovery();return (localConnection(id)?samples:real).act(id,action,reason,allowRematch);},
    agreement: real.agreement && (id => (localConnection(id) ? samples : real).agreement!(id)),
    familyContact: real.familyContact && (id => (localConnection(id) ? samples : real).familyContact!(id)),
    closeIntroduction: real.closeIntroduction && ((id, choice) => (localConnection(id) ? samples : real).closeIntroduction!(id, choice)),
    shareFamilyContact: real.shareFamilyContact && ((id, phone, options) => (localConnection(id) ? samples : real).shareFamilyContact!(id, phone, options)),
    requestHistoryItem: real.requestHistoryItem && (id => (localConnection(id) ? samples : real).requestHistoryItem!(id)),
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
    async unreadCount(){
      const live = await readLive();
      if (liveExclusive) return live[0]?.unreadCount ?? 0;
      if (testingOwnerId && samples.exclusiveConnection()) return samples.unreadCount();
      return await real.unreadCount()+(testingOwnerId?await samples.unreadCount():0);
    },
    watch(listener,scope){
      const stopReal=real.watch(listener,scope);
      const stopLocal=testingOwnerId?samples.watch(listener):()=>{};
      if(testingOwnerId&&watchers++===0)samples.simulation.start();
      return()=>{stopReal();stopLocal();if(testingOwnerId&&--watchers===0)samples.simulation.pause();};
    },
    async acknowledgeMatch(key){
      const local=testingOwnerId&&(await samples.inbox()).some(row=>row.celebrationKey===key);
      await (local?samples:real).acknowledgeMatch?.(key);
    },

    async discover(filters){
      if (await restricted()) return [];
      const offset = filters.offset ?? 0;
      if (filters.mode === 'all' && offset >= 24 && offset % 24 === 0) {
        const readPage = (start: number) => real.discover({...filters, offset:start, afterId:undefined});
        const page = await readPage(offset);
        if (page.length) return appendSamples(page, {...filters, offset:0});
        // Locate the live/sample boundary without redownloading the entire prefix.
        let lo = 0, hi = offset / 24, liveCount = 0;
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2);
          const length = (await readPage(mid * 24)).length;
          if (!length) hi = mid;
          else {
            liveCount = mid * 24 + length;
            if (length < 24) break;
            lo = mid + 1;
          }
        }
        return appendSamples<PublicPerson>([], {...filters, offset:offset-liveCount});
      }
      const query=filters.mode==='all'?filters:{...filters,subjectId:undefined};
      return appendSamples(await readMembersThrough(query, filters.offset ?? 0), filters);
    },
    async discoverPages(filters, pageCount) {
      if (await restricted()) return Array.from({length:pageCount}, () => []);
      // A refresh shares its authorized member prefix only within this call.
      const members = await readMembersThrough(filters.mode==='all'?filters:{...filters,subjectId:undefined}, (pageCount - 1) * 24);
      return Promise.all(Array.from({ length: pageCount }, (_, page) =>
        appendSamples(members, { ...filters, offset: page * 24 })));
    },
    noteProfileOpen:async id=>{if(!sampleIds.has(id))await real.noteProfileOpen?.(id);},
    gallery:async id=>id&&sampleIds.has(id)?[]:await real.gallery?.(id)??[],
    async request(id){await requireDiscovery(); return sampleIds.has(id)?testingOwnerId?samples.request(id):sampleOnly():real.request(id);},
    async setInterest(id,value){if(value) await requireDiscovery(); return sampleIds.has(id)?testingOwnerId?samples.setInterest!(id,value):sampleOnly():real.setInterest?.(id,value);},
    dismissPerson:id=>sampleIds.has(id)?samples.dismissPerson!(id):real.dismissPerson?.(id)??Promise.resolve(),
    reportPerson:(id,reason)=>sampleIds.has(id)?testingOwnerId?samples.reportPerson!(id,reason):sampleOnly():real.reportPerson?.(id,reason)??Promise.resolve(),
  };
}
