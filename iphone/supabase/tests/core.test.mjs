import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

test('isolated marriage database enforces role, consent, billing, matching and contact boundaries',async()=>{
  const db=await createDatabase();
  try{
    const users=await Promise.all([0,1,2].map(async i=>{
      const u={id:randomUUID(),sessionId:randomUUID(),email:'member'+i+'@example.test'};return u;
    }));
    for(const u of users)await addUser(db,u);
    const [woman,man,outsider]=users;
    const run=(u,fn)=>asMember(db,u.id,u.sessionId,fn);
    const rpc=async(sql,params=[]) => (await db.query('select '+sql+' as value',params)).rows[0].value;
    const profile=(u,gender)=>({displayName:'عضو',age:27,gender,city:'الرياض',profession:'معماري',bio:'تعارف جاد',contact:u.email,
        preferredMinAge:21,preferredMaxAge:34,familyPreference:'من البداية',interestIds:['reading'],
        surveyAnswers:{conversation_initiative_preference:'B'},consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false}});
    await db.exec('set role anon');
    await assert.rejects(rpc('public.marriage_state()'),/permission denied/i);
    await db.exec('reset role');
    await run(woman,async()=>{
      assert.equal((await rpc('public.marriage_state()')).user.applicationStatus,'draft');
       const catalog=await rpc('public.marriage_catalog()');
       assert.equal(catalog.questions.length,32);
       assert(catalog.assessment.dimensions.some(dimension=>dimension.id==='wife_work'));
      await assert.rejects(db.query('select * from marriage.contacts'),/permission/i);
      await assert.rejects(rpc('marriage.member_state($1)',[man.id]),/permission/i);
      await assert.rejects(rpc("public.marriage_review($1,'approve')",[woman.id]),/permission/i);
      await assert.rejects(rpc('public.marriage_record_receipt($1,$2,false)',[woman.id,{}]),/permission/i);
      await assert.rejects(rpc('public.marriage_apply($1)',[{...profile(woman,'woman'),signupConsents:{...profile(woman,'woman').signupConsents,version:'old'}}]),/إقرارات/);
      await assert.rejects(rpc('public.marriage_apply($1)',[{...profile(woman,'woman'),interestIds:['invalid']}]),/الاهتمامات/);
    });
    for(const [u,g] of [[woman,'woman'],[man,'man']]){
      const state=await run(u,()=>rpc('public.marriage_apply($1)',[profile(u,g)]));
      assert.equal(state.user.applicationStatus,'pending');assert.deepEqual(state.profile.interestIds,['reading']);
      assert.deepEqual(state.profile.surveyAnswers,{conversation_initiative_preference:'B'});
      await asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
    }
    assert.equal((await run(woman,()=>rpc('public.marriage_state()'))).membership.canStart,true);
    const receipt=(token,tx) =>({bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:token,
      originalTransactionId:'original-'+tx,transactionId:tx,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'});
    let manReceipt;
    for(const [u,tx] of [[woman,'a'],[man,'b']]){
      const state=await run(u,()=>rpc('public.marriage_state()'));const r=receipt(state.user.appAccountToken,tx);
      if(u===man)manReceipt=r;
      await assert.rejects(asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[outsider.id,r])),/الاشتراك/);
      assert.equal((await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[u.id,r]))).membership.active,true);
    }
    const intro=await asService(db,()=>rpc('public.marriage_assign($1,$2)',[woman.id,man.id]));
    const initial=await run(woman,()=>rpc('public.marriage_state()'));
    assert.equal(initial.introduction.contact,null);assert.equal(initial.introduction.person.interests[0],'القراءة');
    assert.equal(JSON.stringify(initial.introduction).includes(man.email),false);
    await assert.rejects(run(outsider,()=>rpc("public.marriage_respond($1,'accept')",[intro])),/غير متاح/);
    const accepted=await run(woman,()=>rpc("public.marriage_respond($1,'accept')",[intro]));
    assert.equal(accepted.introduction.contact,null);assert.equal(accepted.introduction.status,'waiting');
    const mutual=await run(man,()=>rpc("public.marriage_respond($1,'accept')",[intro]));
    assert.equal(mutual.introduction.contact,woman.email);
    assert.equal((await run(woman,()=>rpc('public.marriage_state()'))).introduction.contact,man.email);
    await run(man,()=>rpc("public.marriage_respond($1,'report','بلاغ تجريبي')",[intro]));
    assert.equal((await run(woman,()=>rpc('public.marriage_state()'))).introduction,null);
    const revoked={...manReceipt,revocationDate:Date.now()+100,signedDate:manReceipt.signedDate+100};
    await asService(db,()=>rpc('public.marriage_record_receipt(null,$1,true)',[revoked]));
    await asService(db,()=>rpc('public.marriage_record_receipt(null,$1,true)',[manReceipt]));
    assert.equal((await run(man,()=>rpc('public.marriage_state()'))).membership.active,false);
    await run(woman,()=>rpc('public.marriage_delete_account()'));
    await assert.rejects(run(woman,()=>rpc('public.marriage_state()')),/يلزم تسجيل الدخول/);
    assert.equal((await db.query('select count(*)::int n from marriage.contacts where member_id=$1',[woman.id])).rows[0].n,0);
    await db.query('delete from auth.sessions where id=$1',[man.sessionId]);
    await assert.rejects(run(man,()=>rpc('public.marriage_state()')),/يلزم تسجيل الدخول/);
  }finally{await db.close()}
});
