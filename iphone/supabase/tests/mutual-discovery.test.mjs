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
  await scenario('1. Reciprocal age ranges exclude a 27-year-old when the 29-year-old accepts 30–38',async()=>{
    await db.query('update marriage.profiles set age=27 where member_id=$1',[man.id]);
    await db.query('update marriage.preferences set min_age=25,max_age=32 where member_id=$1',[man.id]);
    await db.query('update marriage.preferences set min_age=30,max_age=38 where member_id=$1',[woman.id]);
    await paired(false);
  });
  await scenario('All profiles can include ineligible members without allowing a request or bypassing privacy',async()=>{
    const expanded={includeIneligible:true};
    assert.equal((await browse(man,{...expanded,eligibleOnly:true}))[0].eligible,true);
    await db.query('update marriage.preferences set min_age=40,max_age=50 where member_id=$1',[woman.id]);
    for(const [viewer,peer] of [[man,woman],[woman,man]]){
      const [card]=await browse(viewer,expanded);
      assert.equal(card.id,peer.id);
      assert.equal(card.eligible,false);
      assert.equal(Object.hasOwn(card,'portrait'),false);
      assert.equal(Object.hasOwn(card,'beenaStory'),false);
      assert.deepEqual(await browse(viewer,{...expanded,eligibleOnly:true}),[]);
      assert.deepEqual(await browse(viewer,{...expanded,mode:'recommended'}),[]);
      assert.deepEqual(await browse(viewer,{...expanded,luna:[]}),[]);
      await db.exec('savepoint ineligible_request');
      try {
        await assert.rejects(call(viewer,'public.marriage_request($1)',[peer.id]));
      } finally {
        await db.exec('rollback to savepoint ineligible_request; release savepoint ineligible_request');
      }
    }
    await db.query('update marriage.members set paused=true where id=$1',[woman.id]);
    assert.deepEqual(await browse(man,expanded),[]);
    await db.query('update marriage.members set paused=false where id=$1',[woman.id]);
    await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[woman.id,man.id]);
    assert.deepEqual(await browse(man,expanded),[]);
    assert.deepEqual(await browse(woman,expanded),[]);
  });
  await scenario('2. Relocation requires a shared, named city',async()=>{
    await db.exec("insert into marriage.cities(label) values('جدة') on conflict do nothing");
    await db.query("update marriage.profiles set city_id=(select id from marriage.cities where label='جدة') where member_id=$1",[woman.id]);
    await answer(man,'residence_plan','A');await answer(woman,'residence_plan','A');await paired(false);
    await answer(man,'residence_plan','C');await paired(false);
    await call(man,'public.marriage_relocation_cities($1)',[['الخبر']]);await paired(false);
    await call(man,'public.marriage_relocation_cities($1)',[['جدة']]);
    assert.deepEqual(await call(woman,'public.marriage_relocation_cities()'),[]);
    assert.equal((await browse(woman,{luna:[]}))[0].id,man.id);
    await answer(man,'residence_plan','B');assert.equal((await browse(man,{}))[0].id,woman.id);
  });
  await scenario('3. Opposing children plans remain eligible only while the preference is soft',async()=>{
    await answer(woman,'children_plan','B');await answer(man,'partner_children_plan','A');
    await paired(true);await hard(man,'children_plan');await paired(false);
  });
  await scenario('4. A flexible first-year formal step overlaps a strict second half, not an undecided or later date',async()=>{
    await answer(man,'partner_marriage_timeline','B');await hard(man,'marriage_timeline');
    await answer(woman,'marriage_timeline','E');await paired(true);
    for(const value of ['D','C']){await answer(woman,'marriage_timeline',value);await paired(false);}
    await answer(man,'partner_marriage_timeline','F');await answer(woman,'marriage_timeline','C');await paired(true);
  });
  await scenario('5. Missing answers never verify a hard requirement and do not suppress an optional one',async()=>{
    await answer(man,'partner_children_plan','A');await paired(true);await hard(man,'children_plan');await paired(false);
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
  await scenario('8. Luna intersects text constraints, active filters, weekly scope and saved non-negotiables',async()=>{
    assert.equal((await browse(man,{city:'الرياض',lunaFields:{city:'جدة'},luna:[]})).length,0);
    await answer(man,'children_plan','A');await answer(woman,'partner_children_plan','B');await hard(woman,'children_plan');
    assert.deepEqual(await browse(man,{minAge:25,lunaFields:{maxAge:30},luna:[]}),[]);
  });
  await scenario('9. A changed requirement removes a previously eligible profile; an established chat stays available',async()=>{
    await paired(true);
    const id=await call(man,'public.marriage_request($1)',[woman.id]);
    await call(woman,"marriage.act_request($1,'accept',null)",[id]);
    await answer(woman,'partner_children_plan','A');await hard(woman,'children_plan');
    await paired(false);
    assert.equal(await scalar('marriage.compatible($1,$2)',[woman.id,man.id]),true);
    assert.ok((await call(woman,'public.marriage_inbox()')).some(r=>r.id===id && r.status==='accepted'));
  });
  await scenario('10. Matching only one person’s hard requirements cannot authorize discovery or a new request',async()=>{
    for(const u of [man,woman]){await answer(u,'partner_children_plan','A');await hard(u,'children_plan');}
    await answer(woman,'children_plan','A');await answer(man,'children_plan','B');await paired(false);
    await assert.rejects(call(man,'public.marriage_request($1)',[woman.id]));
  });
  await scenario('لا أقبل التعدد checks current marriage and future intentions from either side',async()=>{
    await paired(true);
    for(const [status,intent] of [['married','not_open'],['never_married','open'],['divorced','open_to_discussion'],['widowed','prefer_not_to_say'],['never_married',null],[null,'not_open']]){
      await db.query('update marriage.member_basics set marital_status=$2,polygyny_preference=$3 where member_id=$1',[man.id,status,intent]);
      await paired(false);
    }
    await db.query("update marriage.member_basics set marital_status='divorced',polygyny_preference='not_open' where member_id=$1",[man.id]);await paired(true);
  });
  await scenario('Saved physical and lifestyle requirements apply to either searcher',async()=>{
    await db.query("insert into marriage.partner_criteria(member_id,criterion,rule) values($1,'height',$2)",[woman.id,{mode:'require',min:175}]);
    await paired(false);
    await db.query('update marriage.member_basics set height_cm=180 where member_id=$1',[man.id]);
    assert.equal((await browse(man,{luna:[]})).length,1);
    await db.query("insert into marriage.partner_criteria(member_id,criterion,rule) values($1,'smoking',$2)",[man.id,{mode:'require',target:'never'}]);
    await db.query("update marriage.member_basics set smoking='vape' where member_id=$1",[woman.id]);
    await paired(false);
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
