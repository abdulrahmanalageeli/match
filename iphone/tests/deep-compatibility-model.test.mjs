import test from 'node:test';
import assert from 'node:assert/strict';
import { deepConsent, deepSnapshot, deepTimelineIndex } from '../src/community/deepCompatibilityModel.ts';

const finding = {id:'f1',section:'summary',kind:'manageable',text:'Joint private inference',evidence:[{side:'b',key:'private'}]};
test('review state retains only own evidence, never draft inference or peer input',()=>{
  const view=deepSnapshot({status:'review',canRequest:true,review:[{id:'f1',section:'summary',ownInterpretation:'Private own-only reading',text:'Secret draft',ownEvidence:[{key:'space',label:'My answer',value:'Quiet time',peerValue:'Secret'}],peerEvidence:['Secret']}],findings:[finding]});
  assert.deepEqual(view.findings,[]);
  assert.deepEqual(view.review,[{id:'f1',section:'summary',ownInterpretation:'Private own-only reading',ownEvidence:[{key:'space',label:'My answer',value:'Quiet time'}]}]);
  assert.equal(JSON.stringify(view).includes('Secret'),false);
});
test('shared state exposes approved report text without raw evidence or review payload',()=>{
  const view=deepSnapshot({status:'shared',createdAt:'2026-11-25T10:00:00Z',eventAt:'2026-11-25T10:05:00Z',findings:[finding],review:[{private:'secret'}]});
  assert.deepEqual(view.findings,[{id:'f1',section:'summary',kind:'manageable',text:'Joint private inference'}]);
  assert.deepEqual(view.review,[]);
  assert.equal(view.createdAt,'2026-11-25T10:00:00Z');
  assert.equal(view.eventAt,'2026-11-25T10:05:00Z');
});
test('report event stays at its real place while later chat messages follow it',()=>{
  const messages=[{createdAt:'2026-11-25T10:00:00Z'},{createdAt:'2026-11-25T10:06:00Z'},{createdAt:'2026-11-25T10:08:00Z'}];
  assert.equal(deepTimelineIndex(messages,'2026-11-25T10:05:00Z'),1);
  assert.equal(deepTimelineIndex(messages,'2026-11-25T10:09:00Z'),3);
  assert.equal(deepTimelineIndex(messages,null),3);
});
test('revoked, stale, pending and failed responses discard previously shared content',()=>{
  for(const status of ['cancelled','stale','requested','failed','ready','generating','declined','none']){
    const view=deepSnapshot({status,findings:[finding],review:[{private:'secret'}],canRequest:'true'});
    assert.deepEqual(view.findings,[]);assert.deepEqual(view.review,[]);assert.equal(view.canRequest,false);
  }
});
test('unknown or malformed states fail closed',()=>{
  assert.throws(()=>deepSnapshot({status:'published',findings:[finding]}));
  assert.throws(()=>deepSnapshot({status:'shared',findings:[{...finding,section:'invented'}]}));
  assert.throws(()=>deepSnapshot({status:'review',review:[{id:'f1',section:'summary'}]}));
});

test('the two consent actions are versioned and acceptance is bound to the displayed invitation',()=>{
 assert.deepEqual(deepConsent('request'),{consentVersion:'deep-assessment-v2'});
 assert.deepEqual(deepConsent('accept','displayed-invitation'),{consentVersion:'deep-assessment-v2',requestId:'displayed-invitation'});
 assert.throws(()=>deepConsent('accept'));
});
