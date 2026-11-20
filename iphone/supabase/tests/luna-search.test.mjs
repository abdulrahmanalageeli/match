import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';
import {createLunaSearch} from '../../api/_lib/luna-search.mjs';

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
  const options={mode:'all',search:'الفلك',luna:[{kind:'prefer',label:'الفلك',terms:['الفلك']}]};
  assert.deepEqual(await call(viewer,'public.marriage_browse($1)',[{mode:'all',luna:[{kind:'must',field:'unsupported',terms:['الفلك']}]}]),[]);
  assert.deepEqual((await call(viewer,'public.marriage_browse($1)',[options])).map(p=>p.id),[target.id]);
  assert.equal((await call(viewer,'public.marriage_browse($1)',[{luna:options.luna}]))[0].id,target.id,'relevance precedes page slicing');
  // Evaluate free text and new fields inside browse, before the 24-card limit.
  const mustMention={field:'profileText',kind:'must',terms:['الفلك']};
  const nonSaudi={field:'nationality',kind:'exclude',terms:['سعودي']};
  const lookup=async luna=>(await call(viewer,'public.marriage_browse($1)',[{mode:'all',luna}])).map(p=>p.id);
  assert.deepEqual(await lookup([mustMention]),[target.id]);
  const search=createLunaSearch({env:{},fetcher:async(url,request)=>{
    const response=url.endsWith('/marriage_luna_search_reserve')
      ? await call(viewer,'public.marriage_luna_search_reserve()')
      : await call(viewer,'public.marriage_browse($1)',[JSON.parse(request.body).options]);
    return {ok:true,json:async()=>response};
  }});
  const findNonSaudi=async()=>(await search({query:'بنت مو سعودية'},{authorization:'Bearer fixture'})).people.map(p=>p.id);
  assert.deepEqual(await findNonSaudi(),[]);
  await db.query("insert into marriage.member_basics(member_id,nationality) values ($1,'مصرية')",[target.id]);
  assert.deepEqual(await findNonSaudi(),[target.id]);
  assert.deepEqual(await lookup([mustMention,nonSaudi]),[target.id]);
  await db.query("update marriage.member_basics set nationality='سعودية' where member_id=$1",[target.id]);
  assert.deepEqual(await findNonSaudi(),[]);
  assert.deepEqual(await lookup([mustMention,nonSaudi]),[]);
  const score=(card,criteria)=>rpc('marriage.luna_score($1,$2)',[card,JSON.stringify(criteria)]);
  for (const nationality of [null,'','prefer_not_to_say','Saudi Arabia']) {
    assert.equal(await score({marriageBasics:{nationality}},[nonSaudi]),-1);
  }
  for (const field of ['lookingFor','valuesStatement','lifeTogether','marriageIntent']) {
    assert.equal(await score({[field]:'الفلك'},[mustMention]),0);
  }
  assert.equal(await score({beenaStory:{text:'الفلك'}},[mustMention]),0);
  const badge={field:'verificationBadge',kind:'must',terms:['education']};
  assert.equal(await score({manualVerifications:[{kind:'education'}]},[badge]),0);
  assert.equal(await score({manualVerifications:[]},[badge]),-1);
  assert.equal(await score({id:'الفلك',privateNotes:'الفلك',fit:{discussion:['الفلك']}},[mustMention]),-1);
  assert.equal(await score({marriageBasics:{heightCm:163}},[{field:'heightCm',kind:'must',terms:['160..165']}]),0);
  assert.equal(await score({marriageBasics:{heightCm:159}},[{field:'heightCm',kind:'must',terms:['160..165']}]),-1);
  const weekly=await call(viewer,'public.marriage_browse($1)',[{mode:'recommended'}]);
  const outside=women.find(w=>!weekly.some(card=>card.id===w.id));
  assert.deepEqual(await call(viewer,'public.marriage_browse($1)',[{mode:'recommended',subjectId:outside.id,luna:[]}]),[]);
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
