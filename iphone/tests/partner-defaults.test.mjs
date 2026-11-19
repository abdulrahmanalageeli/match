import assert from 'node:assert/strict';
import test from 'node:test';
import catalog from '../src/compatibility/catalog.json' with {type:'json'};
import rules from '../src/interview/partner-defaults.json' with {type:'json'};
import {resolvePartnerDefaults} from '../src/interview/partnerDefaults.ts';

const same = {children_plan:'AB', wife_work:'AB', financial_provision:'ABC', domestic_labor:'ABC', housing_arrangement:'ABC',
  marriage_timeline:'ABC', family_authority:'AB', faith_routine:'AC', money_management:'A'};
test('mapping covers exactly the current paired catalog', () => {
  assert.equal(catalog.dimensions.length,16);
  assert.deepEqual(Object.keys(rules).sort(), catalog.dimensions.map(d=>d.id).sort());
});
for (const d of catalog.dimensions) test(d.id + ' covers every code, manual override, ambiguity and draft restore', () => {
  const self = 'preference:'+d.id+':self', partner='preference:'+d.id+':partner';
  assert.deepEqual(Object.keys(rules[d.id]),d.options.map(o=>o.code));
  for (const {code} of d.options) {
    const expected = same[d.id]?.includes(code) ? code : null;
    const draft={[self]:[code]};
    const resolve=(values,blocked=[])=>resolvePartnerDefaults(values,values,new Set(blocked));
    const first=resolve(draft);
    assert.equal(first.choices[partner]?.[0]??null,expected);
    assert.equal(first.inferred.has(partner),!!expected);
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
