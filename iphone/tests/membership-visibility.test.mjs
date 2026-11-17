import test from 'node:test';
import assert from 'node:assert/strict';
import {shuffleWithVisibility} from '../src/community/visibilityOrder.ts';
test('visibility preserves candidates and increases exposure without guaranteeing first place',()=>{
 const people=[{id:'regular',membershipTier:'premium'},{id:'seal',membershipTier:'seriousness'}];
 let seed=1234;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
 let first=0;
 for(let i=0;i<10000;i++){const ordered=shuffleWithVisibility(people,random);assert.equal(new Set(ordered.map(p=>p.id)).size,2);if(ordered[0].id==='seal')first++}
 assert.ok(first>6300&&first<7000,'2:1 weight gives roughly two thirds exposure');
 assert.deepEqual(people.map(p=>p.id),['regular','seal'],'source is immutable');
 assert.equal(shuffleWithVisibility([],random).length,0);
});
