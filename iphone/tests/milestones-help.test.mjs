import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedMilestone } from '../src/community/milestones.ts';
import { searchGuide } from '../src/help/guide.ts';

const initial={stage:0,mine:false,peer:false,exclusive:false};
const exclusive={...initial,stage:1,exclusive:true,consentMine:true,consentPeer:true};
const family={...exclusive,stage:2};
test('Celebrations require a newly confirmed mutual milestone, not a login or pending proposal',()=>{
 assert.equal(confirmedMilestone(undefined,exclusive),null);
 assert.equal(confirmedMilestone(undefined,family),null);
 assert.equal(confirmedMilestone(initial,{...initial,consentMine:true}),null);
 assert.equal(confirmedMilestone(initial,{...initial,stage:1}),null);
 assert.equal(confirmedMilestone(initial,exclusive),'exclusive');
 assert.equal(confirmedMilestone(exclusive,{...exclusive,mine:true}),null);
 assert.equal(confirmedMilestone(exclusive,family),'family');
 assert.equal(confirmedMilestone(family,family),null);
 assert.equal(confirmedMilestone(family,exclusive),null);
 assert.equal(confirmedMilestone(exclusive,initial),null);
});
test('The guide finds Arabic questions with hamza and vowel differences, and supports scoped searches',()=>{
 assert(searchGuide('all','اشعارات').some(q=>q.id==='notifications'));
 assert(searchGuide('all','إِشْعَارَات').some(q=>q.id==='notifications'));
 assert(searchGuide('journey','العودة').some(q=>q.id==='rewind'));
 assert(searchGuide('profile','صور').every(q=>q.topic==='profile'));
 assert.equal(searchGuide('all','something-that-does-not-exist').length,0);
 assert(searchGuide('all','').length>=20);
});
