import assert from 'node:assert/strict';
import test from 'node:test';
import {demoLunaScore} from '../src/community/demoLunaSearch.ts';

const card={alias:'نورة',city:'جدة',age:29,bio:'أحب القِراءة',occupation:'معلمة',interests:['التصوير'],
  lookingFor:'',education:'بكالوريوس',marriageBasics:{heightCm:162,nationality:'مصرية',smoking:'sometimes'}};
const rule=(kind,field,...terms)=>({kind,field,terms});
const score=(luna=[],lunaFields={},person=card)=>demoLunaScore(person,{luna,lunaFields});

test('published text, coded nationality and inclusive ranges intersect with active structured fields',()=>{
  const plan=[rule('prefer','profileText','القراءه'),rule('exclude','nationality','سعودي'),rule('must','heightCm','160..162')];
  assert.equal(score(plan,{city:'Jeddah',minAge:29}),1);
  assert.equal(score(plan,{city:'الرياض'}),-1);
  assert.equal(score([rule('must','heightCm','163..170')]),-1);
  assert.equal(score([rule('must','nationality','مصري')]),0);
  assert.equal(score([rule('must','profileText','القراة')]),-1);
});

test('omitted, uncertain and private values cannot prove an exclusion',()=>{
  for(const [field,term] of [['smoking','vape'],['language','إنجليزية'],['interest','تنس'],['verificationBadge','identity'],
    ['profileText','سفر'],['religiousAffiliation','sunni'],['profession','unknown'],['city','unknown']]) {
    assert.equal(score([rule('exclude',field,term)]),-1,field);
  }
  assert.equal(score([rule('exclude','nationality','مصري')],{},{...card,marriageBasics:{nationality:'prefer_not_to_say'}}),-1);
  assert.equal(score([rule('prefer','verificationBadge','identity')]),0);
  assert.equal(score([rule('prefer','unsupported','anything')]),-1);
  assert.equal(score([rule('must','profileText','secret')],{},{...card,reasons:['secret']}),-1);
});
