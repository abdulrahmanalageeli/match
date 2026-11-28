import test from 'node:test';
import assert from 'node:assert/strict';
import { MemberNoticeObservation, incomingNotices, visitNotices, allowsMemberNotice } from '../src/notifications/memberNoticeObservation.ts';
import { memberPushNotice, pushCategory, simulatedChatNotices, simulatedInterestNotices } from '../src/notifications/memberPushNotice.ts';
import { updateEvents } from '../admin/server/updateEvents.ts';

const time=Date.parse('2026-11-28T12:00:00Z');
const person={id:'person',alias:'سارة'};
const request=(id,at=time,extra={})=>({id,person,direction:'incoming',status:'pending',createdAt:new Date(at).toISOString(),...extra});
const visit=(id,at=time,extra={})=>({id,person,kind:'profile_visit',createdAt:new Date(at).toISOString(),...extra});

test('only fresh incoming requests and unread visits are queued once across overlapping snapshots',()=>{
  const q=new MemberNoticeObservation();q.reset();
  const requests=rows=>q.observe('request',incomingNotices(rows,time),q.epoch,true);
  const visits=rows=>q.observe('visit',visitNotices(rows),q.epoch,true);
  requests([request('older')]);visits([visit('initial')]);assert.equal(q.first(),null);
  requests([request('older'),request('historical',time-600_000),request('out',time,{direction:'outgoing'}),
    request('mutual',time,{status:'accepted'}),request('expired',time,{expiresAt:new Date(time).toISOString()}),
    request('a'),request('b')]);
  visits([visit('seen',time,{readAt:'already'}),visit('interest',time,{kind:'interest'}),visit('c')]);
  assert.equal(q.first().key,'request:a');
  requests([request('b'),request('b')]); // 'a' has been withdrawn
  assert.equal(q.first().key,'request:b');q.dismiss('request:b');
  assert.equal(q.first().key,'visit:c');visits([visit('c',time,{readAt:'read'})]);assert.equal(q.first(),null);
  requests([request('a'),request('b')]);visits([visit('c')]);assert.equal(q.first(),null);
});

test('a background transition, changed account and muted activity cannot replay previous events',()=>{
  const q=new MemberNoticeObservation();q.reset();
  q.observe('visit',[],q.epoch,true);
  const previous=q.epoch;q.reset();
  q.observe('visit',visitNotices([visit('late',time+80)]),previous,true);
  q.observe('visit',visitNotices([visit('in-background',time+25)]),q.epoch,true);
  q.observe('visit',visitNotices([visit('quiet',time+90)]),q.epoch,false);
  q.observe('visit',visitNotices([visit('quiet',time+90),visit('foreground',time+100)]),q.epoch,true);
  assert.equal(q.first().key,'visit:foreground');
  q.dismiss('visit:foreground');
  // The next visible response can reach the device much later than its event timestamp.
  q.observe('visit',visitNotices([visit('delayed',time+101)]),q.epoch,true);
  assert.equal(q.first().key,'visit:delayed');
  const other=new MemberNoticeObservation();other.reset();
  other.observe('request',incomingNotices([request('already',time+100)],time+100),other.epoch,true);
  assert.equal(other.first(),null);
});

test('foreground notice preferences respect the category, local quiet hours and unresolved settings',()=>{
  const prefs={connections:true,interest:true,quiet:true,start:22,end:7,zone:'Asia/Riyadh'};
  assert.equal(allowsMemberNotice('request',prefs,Date.parse('2026-11-28T19:00:00Z')),false);
  assert.equal(allowsMemberNotice('visit',prefs,Date.parse('2026-11-28T04:00:00Z')),true);
  assert.equal(allowsMemberNotice('visit',{...prefs,interest:false},time),false);
  assert.equal(allowsMemberNotice('request',{...prefs,connections:false},time),false);
  assert.equal(allowsMemberNotice('request',null,time),false);
});

test('every supported delivery has concise Arabic copy, a preference and its original route',()=>{
  const target='signed-in-target';
  const routes=['request','mutual','message','family','reminder','analysis','publication'].map(kind=>({kind,requestId:target}));
  for(const event of Object.keys(updateEvents))routes.push({kind:'update',event,requestId:target});
  for(const push of routes){
    const notice=memberPushNotice(push), category=pushCategory(push);
    assert.ok(category,push.event||push.kind);
    assert.match(notice.title,/[\u0600-\u06ff]/);
    assert.equal(notice.push,push);
    assert.equal(allowsMemberNotice(category,{[category]:true,quiet:false},time),true);
    if(category!=='publication')assert.equal(allowsMemberNotice(category,{[category]:false,quiet:false},time),false);
  }
  for(const [phase,event] of [['requested','analysis:invited'],['shared','analysis:shared']])
    assert.equal(memberPushNotice({kind:'analysis',requestId:target,analysisPhase:phase}).title,updateEvents[event][0]);
  assert.equal(memberPushNotice({kind:'update',event:'unknown:event',requestId:target}),undefined);
  assert.equal(memberPushNotice({kind:'simulation',requestId:target}),undefined);
});

test('push and authorized snapshots share one request pill in either order; a replay stays dismissed',()=>{
  for(const pushFirst of [true,false]){
    const q=new MemberNoticeObservation(), push=memberPushNotice({kind:'request',requestId:'pair',deliveryId:'delivery'});
    q.observe('request',[],q.epoch,true);
    if(pushFirst)q.deliver(push,q.epoch);
    q.observe('request',incomingNotices([request('pair')],time),q.epoch,true);
    if(!pushFirst)assert.equal(q.deliver(push,q.epoch),false);
    assert.equal(q.first().person.alias,'سارة');
    q.dismiss(q.first().key);
    assert.equal(q.first(),null);
    assert.equal(q.deliver(push,q.epoch),false);
  }
});

test('queue preserves distinct repeat updates and separate family messages, and discards late deliveries',()=>{
  const q=new MemberNoticeObservation();
  const routes=[
    {kind:'update',event:'agreement:extension',deliveryId:'first'},
    {kind:'update',event:'agreement:extension',deliveryId:'second'},
    {kind:'family',roomId:'family-room',messageId:'first-message'},
    {kind:'family',roomId:'family-room',messageId:'second-message'},
  ].map(fields=>memberPushNotice({requestId:'same-connection',...fields}));
  for(const item of routes){assert.equal(q.deliver(item,q.epoch),true);assert.equal(q.deliver(item,q.epoch),false);}
  q.observe('request',[],q.epoch,true);
  for(const item of routes){assert.equal(q.first().key,item.key);q.dismiss(item.key);}
  const old=q.epoch;q.reset();
  assert.equal(q.deliver(memberPushNotice({requestId:'other',kind:'mutual'}),old),false);
  assert.equal(q.first(),null);
});

test('simulated notices name only the verified fictional peer and use the same destinations as real activity',()=>{
  const peer={...person,isDemo:true};
  const chat={id:'pair',status:'accepted',person:peer,unreadCount:1,celebrationKey:'match'};
  const log=['reply','match'].map(kind=>({kind,id:kind,personId:peer.id,connectionId:chat.id,at:new Date(time).toISOString()}));
  const items=simulatedChatNotices([chat],log);
  assert.deepEqual(items.map(item=>[item.actor,item.key,item.push.kind]),[['سارة','message:reply','message'],['سارة','match:pair','mutual']]);
  assert.equal(items[0].push.messageId,'reply');
  assert.deepEqual(simulatedChatNotices([chat],[{...log[0],id:'old-read-reply'},...log]),items);
  assert.equal(simulatedChatNotices([{...chat,celebrationKey:undefined}],log).length,1);
  for(const row of [{...chat,person},{...chat,status:'closed'}])assert.deepEqual(simulatedChatNotices([row],log),[]);
  assert.deepEqual(simulatedChatNotices([chat],[{...log[0],personId:'other'}]),[]);
  const social={...visit('interest'),kind:'interest',person:peer};
  assert.equal(simulatedInterestNotices([social])[0].push.requestId,peer.id);
  assert.deepEqual(simulatedInterestNotices([{...social,person},{...social,readAt:'read'}]),[]);
});
