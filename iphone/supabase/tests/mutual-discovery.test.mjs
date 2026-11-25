import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {asMember,addUser,createDatabase} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';

test('discovery respects both members across directory, Luna and requests',async t=>{
 const db=await createDatabase();
 const scalar=async(sql,args=[])=>(await db.query('select '+sql+' as value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>scalar(sql,args));
 async function member(gender){
   const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
   await addUser(db,u);await seedCommunicationMember(db,u,gender);
   await db.query("insert into marriage.admin_membership_grants values($1,'seriousness',now()+interval '1 day')",[u.id]);
   await db.query("insert into marriage.member_basics(member_id,marital_status,polygyny_preference,smoking) values($1,'never_married','not_open','never')",[u.id]);
   return u;
 }
 const man=await member('man'),woman=await member('woman');
 const answer=(u,question,code)=>db.query('insert into marriage.member_answers values($1,$2,$3) on conflict(member_id,question_code) do update set option_code=excluded.option_code',[u.id,question,code]);
 const hard=(u,dimension)=>db.query('insert into marriage.fit_hard_requirements(member_id,dimension) values($1,$2)',[u.id,dimension]);
 const browse=(u,options)=>call(u,'public.marriage_browse($1)',[{mode:'all',...options}]);
 async function paired(expected){
   for(const [u,peer] of [[man,woman],[woman,man]]){
     for(const options of [{},{luna:[]},{mode:'recommended',luna:[]}]) assert.equal((await browse(u,options)).some(p=>p.id===peer.id),expected);
   }
 }
 async function scenario(name,fn){
   await t.test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}});
 }
 try {
  await scenario('Members outside saved age and city preferences can discover each other and request',async()=>{
    await db.query('update marriage.preferences set min_age=40,max_age=50 where member_id=$1',[woman.id]);
    await db.exec("insert into marriage.cities(label) values('جدة') on conflict do nothing");
    await db.query("update marriage.profiles set city_id=(select id from marriage.cities where label='جدة') where member_id=$1",[woman.id]);
    await paired(true);
    const [card]=await browse(man,{eligibleOnly:true});
    assert.equal(card.eligible,true);
    const id=await call(man,'public.marriage_request($1)',[woman.id]);
    assert.equal(await scalar('(select status from marriage.member_requests where id=$1)',[id]),'pending');
  });
  await scenario('An expanded directory respects pause and block in either direction',async()=>{
    const expanded={includeIneligible:true};
    await db.query('update marriage.members set paused=true where id=$1',[woman.id]);
    assert.deepEqual(await browse(man,expanded),[]);
    await db.query('update marriage.members set paused=false where id=$1',[woman.id]);
    await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[woman.id,man.id]);
    assert.deepEqual(await browse(man,expanded),[]);
    assert.deepEqual(await browse(woman,expanded),[]);
    await assert.rejects(call(man,'public.marriage_request($1)',[woman.id]));
  });
  await scenario('6. Changing temporary filters after onboarding preserves saved requirements',async()=>{
    assert.equal((await browse(man,{maxAge:28})).length,0);assert.equal((await browse(man,{minAge:29})).length,1);
    assert.equal(await scalar('(select min_age from marriage.preferences where member_id=$1)',[man.id]),25);
    await paired(true);
  });
  await scenario('7. Narrow criteria return an empty page; unknown or unpublished exclusions do not pass',async()=>{
    assert.deepEqual(await browse(man,{children:'has',minHeight:200,onlineOnly:true,luna:[]}),[]);
    await db.query('update marriage.member_basics set smoking=null where member_id=$1',[woman.id]);
    assert.equal((await browse(man,{})).length,1);assert.deepEqual(await browse(man,{excludeSmoking:['yes'],luna:[]}),[]);
    assert.deepEqual(await browse(man,{excludeTribalBackgrounds:['tribal'],luna:[]}),[]);
  });
  await scenario('8. Luna intersects text constraints, active filters, weekly scope without imposing saved non-negotiables',async()=>{
    assert.equal((await browse(man,{city:'الرياض',lunaFields:{city:'جدة'},luna:[]})).length,0);
    await answer(man,'children_plan','A');await answer(woman,'partner_children_plan','B');await hard(woman,'children_plan');
    assert.equal((await browse(man,{minAge:25,lunaFields:{maxAge:30},luna:[]}))[0].id,woman.id);
  });
  await scenario('9. An established chat stays available after preferences change',async()=>{
    await paired(true);
    const id=await call(man,'public.marriage_request($1)',[woman.id]);
    await call(woman,"marriage.act_request($1,'accept',null)",[id]);
    await answer(woman,'partner_children_plan','A');await hard(woman,'children_plan');
    assert.equal(await scalar('marriage.compatible($1,$2)',[woman.id,man.id]),true);
    assert.ok((await call(woman,'public.marriage_inbox()')).some(r=>r.id===id && r.status==='accepted'));
  });
  await scenario('10. Matching only one person’s hard requirements allows discovery or a new request',async()=>{
    for(const u of [man,woman]){await answer(u,'partner_children_plan','A');await hard(u,'children_plan');}
    await answer(woman,'children_plan','A');await answer(man,'children_plan','B');await paired(true);
    assert.ok(await call(man,'public.marriage_request($1)',[woman.id]));
  });
  await scenario('Polygyny preferences do not prevent discovery',async()=>{
    await paired(true);
    for(const [status,intent] of [['married','not_open'],['never_married','open'],['divorced','open_to_discussion'],['widowed','prefer_not_to_say'],['never_married',null],[null,'not_open']]){
      await db.query('update marriage.member_basics set marital_status=$2,polygyny_preference=$3 where member_id=$1',[man.id,status,intent]);
      await paired(true);
    }
    await db.query("update marriage.member_basics set marital_status='divorced',polygyny_preference='not_open' where member_id=$1",[man.id]);await paired(true);
  });
  await scenario('Saved physical and lifestyle requirements allow discovery in either direction',async()=>{
    await db.query("insert into marriage.partner_criteria(member_id,criterion,rule) values($1,'height',$2)",[woman.id,{mode:'require',min:175}]);
    await paired(true);
    await db.query('update marriage.member_basics set height_cm=180 where member_id=$1',[man.id]);
    assert.equal((await browse(man,{luna:[]})).length,1);
    await db.query("insert into marriage.partner_criteria(member_id,criterion,rule) values($1,'smoking',$2)",[man.id,{mode:'require',target:'never'}]);
    await db.query("update marriage.member_basics set smoking='vape' where member_id=$1",[woman.id]);
    await paired(true);
  });
  await scenario('A timed-out invitation permits a new request; a later decline still prevents another',async()=>{
    const first=await call(man,'public.marriage_request($1)',[woman.id]);
    await db.query("update marriage.member_requests set created_at=now()-interval '8 days' where id=$1",[first]);
    await paired(true);
    const next=await call(woman,'public.marriage_request($1)',[man.id]);assert.notEqual(next,first);
    assert.equal(await scalar('(select closure_outcome from marriage.member_requests where id=$1)',[first]),'expired');
    await call(man,"marriage.act_request($1,'decline',null)",[next]);await paired(false);
  });
  await scenario('Published biographies support literal directory search and soft Luna ranking only',async()=>{
    await db.query("update marriage.profiles set bio='I do not smoke; I study astronomy' where member_id=$1",[woman.id]);
    assert.equal((await browse(man,{search:'ASTRONOMY'})).length,1);assert.deepEqual(await browse(man,{search:'%'}),[]);
    assert.deepEqual(await browse(man,{luna:[{field:'unsupported',kind:'must',terms:['astronomy']}]}),[]);
    assert.equal((await browse(man,{luna:[{field:'smoking',kind:'must',terms:['never']}]})).length,1);
    assert.deepEqual(await browse(man,{luna:[{field:'smoking',kind:'must',terms:['yes']}]}),[]);
  });
 } finally{await db.close();}
});
