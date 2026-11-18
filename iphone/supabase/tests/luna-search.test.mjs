import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';

test('Luna enforces tiers, searches past page one, preserves blocks and quotas; admin grants are audited',async()=>{
 const db=await createDatabase();
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 async function member(gender){const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);await seedCommunicationMember(db,u,gender);return u;}
 try {
  const viewer=await member('man');
  await assert.rejects(call(viewer,'public.marriage_luna_search_reserve()'));
  await assert.rejects(call(viewer,'public.marriage_browse($1)',[{mode:'all',luna:[]} ]));
  await db.query("insert into marriage.admin_membership_grants values($1,'seriousness',now()+interval '1 day')",[viewer.id]);
  const women=[];for(let i=0;i<26;i++)women.push(await member('woman'));
  const ordinary=await call(viewer,'public.marriage_browse($1)',[{mode:'all'}]);
  const target=women.find(w=>!ordinary.some(p=>p.id===w.id));assert.ok(target);
  await db.query("update marriage.profiles set bio='أحب القراءة والفلك' where member_id=$1",[target.id]);
  const options={mode:'all',luna:[{kind:'must',label:'الفلك',terms:['الفلك']}]};
  assert.deepEqual((await call(viewer,'public.marriage_browse($1)',[options])).map(p=>p.id),[target.id]);
  await call(viewer,'public.marriage_luna_search_reserve()');
  await db.query('update marriage.luna_search_usage set requests=30 where member_id=$1',[viewer.id]);
  await assert.rejects(call(viewer,'public.marriage_luna_search_reserve()'),/٣٠/);
  await db.query('update marriage.luna_search_usage set day=current_date-1 where member_id=$1',[viewer.id]);
  await call(viewer,'public.marriage_luna_search_reserve()');
  assert.equal(await rpc('(select requests from marriage.luna_search_usage where member_id=$1)',[viewer.id]),1);
  await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[viewer.id,target.id]);
  assert.equal((await call(viewer,'public.marriage_browse($1)',[options])).length,0);
  await db.query("update marriage.admin_membership_grants set expires_at=now()-interval '1 second' where member_id=$1",[viewer.id]);
  await assert.rejects(call(viewer,'public.marriage_luna_search_reserve()'));
  const owner=await member('man');await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'owner','Admin')",[owner.id]);
  async function admin(sql,args=[]){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.id,session_id:owner.sessionId,role:'authenticated',aal:'aal2'})]);await db.exec('set role authenticated');try{return await rpc(sql,args);}finally{await db.exec('reset role');}}
  const detail=await admin('public.marriage_admin_member($1)',[viewer.id]);
  const operation=randomUUID(), args=[viewer.id,'seriousness',3,true,detail.revision,'اختبار العضوية',operation];
  await admin('public.marriage_admin_membership($1,$2,$3,$4,$5,$6,$7)',args);
  await admin('public.marriage_admin_membership($1,$2,$3,$4,$5,$6,$7)',args);
  assert.equal(await rpc('(select count(*)::int from marriage.staff_audit where request_id=$1)',[operation]),1);
  await assert.rejects(call(viewer,'public.marriage_luna_search_reserve()'));
  await assert.rejects(call(viewer,'public.marriage_browse($1)',[options]));
  const updated=await admin('public.marriage_admin_member($1)',[viewer.id]);
  assert.equal(updated.membershipTier,'seriousness');assert.equal(updated.lunaSearch.blocked,true);
  await assert.rejects(call(viewer,'public.marriage_admin_membership($1,$2,$3,$4,$5,$6,$7)',args));
 } finally {await db.close();}
});
