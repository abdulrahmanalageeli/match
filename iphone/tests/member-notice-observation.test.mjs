import test from 'node:test';
import assert from 'node:assert/strict';
import { MemberNoticeObservation, incomingNotices, visitNotices, allowsMemberNotice } from '../src/notifications/memberNoticeObservation.ts';

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
