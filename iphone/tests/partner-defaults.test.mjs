import assert from 'node:assert/strict';
import test from 'node:test';
import catalog from '../src/compatibility/catalog.json' with {type:'json'};
import {resolvePartnerDefaults} from '../src/interview/partnerDefaults.ts';

for (const d of catalog.dimensions) test(d.id + ' keeps partner choices independent', () => {
  const self = 'preference:'+d.id+':self', partner='preference:'+d.id+':partner';
  for (const {code} of d.options) {
    const draft={[self]:[code]};
    const resolve=(values,blocked=[])=>resolvePartnerDefaults(values,values,new Set(blocked));
    const first=resolve(draft);
    assert.equal(first.choices[partner],undefined);
    assert.equal(first.inferred.has(partner),false);
    assert.deepEqual(resolve(JSON.parse(JSON.stringify(draft))),first);
    assert.equal(resolve(draft,[partner]).choices[partner],undefined);
    assert.equal(resolvePartnerDefaults(draft,{},new Set()).choices[partner],undefined);
    assert.equal(resolvePartnerDefaults({},draft,new Set()).choices[partner],undefined);
    assert.equal(resolvePartnerDefaults({[self]:['?']},draft,new Set()).choices[partner],undefined);
    for (const edit of d.options) {
      const manual=resolve({[partner]:[code],[self]:[edit.code]});
      assert.deepEqual(manual.choices[partner],[code]);
      assert.equal(manual.inferred.size,0);
    }
  }
});
