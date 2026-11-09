import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';

test('private birthday drives age, rejects underage signup, and survives account reload',async()=>{
 const db=await createDatabase();
 try {
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,u);
  const call=(q,args=[])=>asMember(db,u.id,u.sessionId,async()=> (await db.query('select '+q+' value',args)).rows[0].value);
  const p={displayName:'مثال',age:99,gender:'woman',city:'الرياض',profession:'مهندسة',bio:'نبذة',contact:u.email,
   preferredMinAge:18,preferredMaxAge:65,familyPreference:'من البداية',consentVersion:'2026-11-07-privacy',
   signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:false,sensitivePublication:false,assessment:false,photo:false}};
  await assert.rejects(call('public.marriage_apply($1)',[p]),/تاريخ ميلاد/);
  await assert.rejects(call('public.marriage_apply($1)',[{...p,birthDate:'2020-01-01'}]),/١٨/);
  await assert.rejects(call('public.marriage_apply($1)',[{...p,birthDate:'2001-02-29'}]),/غير صالح/);
  const result=await call('public.marriage_apply($1)',[{...p,birthDate:'1998-01-01'}]);
  const expected=(await db.query("select marriage.birthday_age('1998-01-01') age")).rows[0].age;
  assert.equal(result.profile.age,expected);
  assert.equal(result.profile.birthDate,'1998-01-01');
  assert.equal((await call('public.marriage_state()')).profile.birthDate,'1998-01-01');
  await assert.rejects(asMember(db,u.id,u.sessionId,()=>db.query('select * from marriage.member_birth_dates')),/permission denied/);
  const snapshot=(await db.query('select marriage.public_profile_snapshot($1) value',[u.id])).rows[0].value;
  assert.equal(JSON.stringify(snapshot).includes('1998-01-01'),false);
  await db.query('update marriage.profiles set age=20 where member_id=$1',[u.id]);
  await db.query('select marriage.refresh_birthday_ages()');
  assert.equal((await db.query('select age from marriage.profiles where member_id=$1',[u.id])).rows[0].age,expected);
  assert.equal((await db.query("select marriage.birthday_age('2004-02-29','2026-02-28') age")).rows[0].age,21);
 } finally {await db.close();}
});
