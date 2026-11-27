import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Community } from '../../src/community/Community';
import { RequestHistory } from '../../src/community/RequestHistory';
import { MembershipAccess } from '../../src/membership/access';
import { VoiceCallsProvider } from '../../src/voice/VoiceCalls';
import { CapturePrivacyHost } from '../../src/privacy/CapturePrivacy';
import type { CommunitySource } from '../../src/community/data';
import { initializeDevicePreferences } from '../../src/settings/preferences';
import { runRelationship } from './lifecycle-relationship-driver.mjs';
import '../../src/design.css';
import '../../src/flows.css';
import '../../src/screens.css';
import '../../src/motion.css';
import '../../src/mobile/keyboard.css';
import '../../src/community/arrivalDiscovery.css';
import '../../src/community/arrivalChat.css';
import '../../src/arrivalSurfaces.css';
import '../../src/typography.css';
import '../../src/accessibility.css';

type Actor='male'|'female';
const transport='http://127.0.0.1:18767';
async function request(path:string,payload?:unknown) {
  const result=await fetch(transport+path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const json=await result.json();
  if(!result.ok) throw Error(path+' '+(json.error?.message||json.error||result.status));
  return json;
}
function makeSource(actor:Actor) {
  const rpc=async (name:string,...args:unknown[])=>{
    const {data,error}=await request('/rpc',{actor,name,args});
    if(error) throw Error(name+': '+error.message);
    return data;
  };
  // Every action uses the member's own database session. Role changes re-open the UI and reload it from SQL.
  const source:CommunitySource={
    watch:()=>()=>{}, inbox:()=>rpc('marriage_inbox'),
    discover:filters=>rpc('marriage_browse',{...filters, mode:filters.mode??'recommended',includeIneligible:filters.mode==='all'&&!filters.eligibleOnly}),
    request:id=>rpc('marriage_request',id),
    act:(id,action,reason,allowRematch=false)=>action==='cancel'?rpc('marriage_cancel',id,allowRematch):rpc('marriage_act',id,action,reason??null),
    agreement:id=>rpc('marriage_agreement',id,'read',{}),
    agree:(id,action,payload={})=>rpc('marriage_agreement',id,action,payload),
    progress:id=>rpc('marriage_progress',id),
    journeyChoice:(id,topic,action,expectedId,stage)=>rpc('marriage_journey_choice',id,topic,action,expectedId??null,stage??null),
    thread:async(id,beforeId)=>{
      const rows=await rpc('marriage_thread_page',id,beforeId??null);
      const received=rows.filter((row:any)=>!row.senderIsMe&&!row.deliveredAt&&!row.deletedAt).map((row:any)=>row.id);
      if(received.length) await rpc('marriage_confirm_thread_delivery',id,received);
      return rows;
    },
    readState:id=>rpc('marriage_thread_read_state',id),
    markRead:(id,through)=>rpc('marriage_mark_thread_read',id,through),
    send:(id,body,clientId)=>rpc('marriage_message',id,body,clientId),
    unreadCount:async()=>{const inbox=await rpc('marriage_inbox');return inbox.reduce((n:number,r:any)=>n+(r.unreadCount||0),0);},
    closeIntroduction:(id,choice)=>rpc('marriage_close_introduction',id,choice.context,choice.allowRematch,choice.familyPhone??null),
    shareFamilyContact:(id,phone,options={})=>rpc('marriage_share_family_contact',id,phone,options.closeNow??false,options.allowRematch??false),
    familyContact:id=>rpc('marriage_family_contact',id),
    requestHistory:()=>rpc('marriage_request_history'),
    requestHistoryItem:id=>rpc('marriage_request_history_item',id),
  } as CommunitySource;
  return {source,rpc};
}

const root=createRoot(document.getElementById('root')!);
const blank=()=>{};
initializeDevicePreferences();
function View({source,actor,initial,member,requestId}:any){
  const [tab,setTab]=useState(initial);
  return <div className="phone-app" dir="rtl"><MembershipAccess.Provider value={{premium:member.active,tier:member.tier,connectionLimit:member.connectionLimit,upgrade:blank}}>
    <VoiceCallsProvider source={source} owner={null} demo>
      {initial==='history'?<RequestHistory source={source} targetId={requestId}/>:<Community source={source} viewerGender={actor==='male'?'man':'woman'} tab={tab} onTab={setTab} paused={false} onConversationOpened={blank} onHome={()=>setTab('curated')} onAccount={blank} onResume={blank}/>}
    </VoiceCallsProvider></MembershipAccess.Provider><CapturePrivacyHost/></div>;
}
let generation=0;
Object.assign(window,{runRelationshipLifecycle:async(branch:string)=>{
  const actors=await request('/actors');
  const people={male:makeSource('male'),female:makeSource('female')};
  const mount=(actor:Actor,initial:string,requestId?:string)=>{
    const member=actors.membership[actor==='male'?'man':'woman'];
    flushSync(()=>root.render(<View key={++generation} actor={actor} source={people[actor].source} initial={initial} member={member} requestId={requestId}/>));
    window.scrollTo(0,0);
  };
  return runRelationship({branch,actors,people,mount,request});
}});
