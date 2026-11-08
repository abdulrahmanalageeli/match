import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';

let db;
before(async () => { db = await createDatabase(); });
after(async () => { await db?.close(); });
const marker = { signupKind: 'member_self_claimed_email', emailOwnershipVerified: false };
const rpc = async (sql, args=[]) => (await db.query('select '+sql+' value',args)).rows[0].value;
async function member(label, metadata=marker) {
  const user = { id: randomUUID(), sessionId: randomUUID(), email: label+'@example.test' };
  await db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[user.id,user.email,metadata]);
  await db.query('insert into auth.sessions values($1,$2,null)',[user.sessionId,user.id]);
  return user;
}
async function asStaff(u, fn, aal='aal2') {
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u.id,session_id:u.sessionId,role:'authenticated',aal,app_metadata:{emailOwnershipVerified:true},user_metadata:{emailOwnershipVerified:true,role:'owner'}})]);
  await db.exec('set role authenticated');
  try { return await fn(); } finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims','',false)"); }
}

test('member signup preparation is service-only, rate limited and retains no raw email/IP', async () => {
  const user = await member('rate-user');
  const args=['other@example.test','a'.repeat(64),'b'.repeat(64)];
  await assert.rejects(asMember(db,user.id,user.sessionId,()=>rpc('public.marriage_member_signup_prepare($1,$2,$3)',args)),/permission/i);
  await db.exec('set role anon');
  try { await assert.rejects(rpc('public.marriage_member_signup_prepare($1,$2,$3)',args),/permission/i); } finally { await db.exec('reset role'); }
  for(let i=0;i<3;i++) assert.deepEqual(await asService(db,()=>rpc('public.marriage_member_signup_prepare($1,$2,$3)',args)),{allowed:true,available:true});
  assert.equal((await asService(db,()=>rpc('public.marriage_member_signup_prepare($1,$2,$3)',args))).allowed,false);
  const windows=(await db.query('select scope_key from marriage.member_signup_windows')).rows;
  assert(!JSON.stringify(windows).includes('@'));
  assert.equal(await rpc("(select relrowsecurity from pg_class where oid='marriage.member_signup_windows'::regclass)"),true);
});

test('reserved staff emails cannot be created or adopted by the no-confirmation path', async () => {
  const reserved='reserved-owner@example.test';
  await db.query("insert into marriage.staff_invitations(email,role,display_name,expires_at) values($1,'owner','Owner',now()+interval '1 day')",[reserved]);
  const prepared=await asService(db,()=>rpc('public.marriage_member_signup_prepare($1,$2,$3)',[reserved,'c'.repeat(64),'d'.repeat(64)]));
  assert.equal(prepared.available,false);
  await assert.rejects(db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[randomUUID(),reserved,marker]),/Account unavailable/);
  const ordinary=await member('ordinary-new');
  await assert.rejects(db.query('update auth.users set email=$1 where id=$2',[reserved,ordinary.id]),/Account unavailable/);
  const staff=await member('existing-staff',{});
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','Reviewer')",[staff.id]);
  assert.equal((await asService(db,()=>rpc('public.marriage_member_signup_prepare($1,$2,$3)',[staff.email,'e'.repeat(64),'f'.repeat(64)]))).available,false);
});

test('an unverified member can use onboarding but cannot claim a later invitation even with forged metadata and MFA', async () => {
  const ordinary=await member('later-invite');
  const state=await asMember(db,ordinary.id,ordinary.sessionId,()=>rpc('public.marriage_state()'));
  assert.equal(state.user.applicationStatus,'draft');
  assert.equal(state.membership.active,false);
  await db.query("insert into marriage.staff_invitations(email,role,display_name,expires_at) values($1,'owner','Not claimable',now()+interval '1 day')",[ordinary.email]);
  await assert.rejects(asStaff(ordinary,()=>rpc('public.marriage_admin_access()')),/حساب مؤكد/);
  assert.equal((await db.query('select claimed_by from marriage.staff_invitations where email=$1',[ordinary.email])).rows[0].claimed_by,null);
  // Even a mistaken trusted role provision cannot override missing email ownership.
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'owner','Not trusted')",[ordinary.id]);
  await assert.rejects(asStaff(ordinary,()=>rpc('public.marriage_admin_overview()')),/حساب مؤكد/);
});

test('genuinely confirmed staff retain invitation claiming and MFA requirements', async () => {
  const trusted={id:randomUUID(),sessionId:randomUUID(),email:'genuine-owner@example.test'}; await addUser(db,trusted);
  await db.query("insert into marriage.staff_invitations(email,role,display_name,expires_at) values($1,'owner','Owner',now()+interval '1 day')",[trusted.email]);
  assert.equal((await asStaff(trusted,()=>rpc('public.marriage_admin_access()'),'aal1')).mfaRequired,true);
  await assert.rejects(asStaff(trusted,()=>rpc('public.marriage_admin_overview()'),'aal1'),/بخطوتين/);
  assert.equal((await asStaff(trusted,()=>rpc('public.marriage_admin_access()'))).authorized,true);
});
