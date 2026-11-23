import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

test('owner publication, audience isolation, consent, actual queue lease and withdrawal',async()=>{
 const db=await createDatabase();
 try{
  const make=async()=>{const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};await addUser(db,u);return u;};
  const owner=await make(),member=await make(),other=await make(),id=randomUUID(),install=randomUUID();
  await db.query("insert into marriage.staff_accounts(user_id,display_name,role) values($1,'owner','owner')",[owner.id]);
  const run=async(fn,args=[])=> (await db.query('select '+fn+' as value',args)).rows[0].value;
  const publish=async(action,payload)=>{await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.id,session_id:owner.sessionId,role:'authenticated',aal:'aal2'})]);await db.exec('set role authenticated');
   try{return await run('public.wudayn_publish($1,$2)',[action,payload]);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)");}};
  const campaign={id,placement:'news',screen:'all',title:'تحديث جديد',body:'تجد الجديد هنا.',audience:{member:member.id},push:true,ends:new Date(Date.now()+86400000).toISOString()};
  await asMember(db,other.id,other.sessionId,()=>assert.rejects(run('public.wudayn_publish($1,$2)',['publish',campaign])));
  await asMember(db,member.id,member.sessionId,async()=>{
   await run('public.marriage_push_enable(true)');await run("public.marriage_push_register($1,'production',$2)",['a'.repeat(64),install]);
   assert.equal(await run('public.wudayn_news_preference(null,$1,1)',[install]),false);
  });
  assert.equal((await publish('preview',campaign)).reachable,0);
  await asMember(db,member.id,member.sessionId,()=>run('public.wudayn_news_preference(true)'));
  assert.equal((await publish('preview',campaign)).reachable,1);await publish('publish',campaign);await publish('publish',campaign);
  await assert.rejects(publish('publish',{...campaign,screen:'register'}));
  const jobs=await asService(db,()=>run("public.marriage_push_claim('production',20)"));assert.equal(jobs.length,1);const job=jobs[0];assert.equal(job.requestId,id);
  const detail=()=>asService(db,()=>run('public.nisfayn_push_delivery($1,$2,false,$3)',[job.id,job.leaseId,job.token]));
  assert.equal((await detail()).preview,'private');
  const feed=async(u,open=null)=>asMember(db,u.id,u.sessionId,()=>run("public.wudayn_publications('ios',1,$1)",[open]));
  assert.equal((await feed(other)).length,0);assert.equal((await feed(member,id))[0].opened,true);
  await publish('correct',{...campaign,title:'تنويه مُحدّث'});assert.equal((await feed(member))[0].title,'تنويه مُحدّث');
  const history=await publish('history',{id});assert.equal(history[0].body,campaign.body);await publish('rollback',{id,version:history[0].id});assert.equal((await feed(member))[0].title,campaign.title);
  await publish('withdraw',{id});assert.equal(await detail(),null);assert.deepEqual(await feed(member),[]);
  await assert.rejects(publish('test_devices',{testMember:member.id}));
  await db.query('update marriage.members set is_dummy=true where id=$1',[member.id]);
  assert.equal((await publish('test_devices',{testMember:member.id}))[0].id,install);
  const trial={...campaign,id:randomUUID(),testMember:member.id,testInstallation:install};
  await assert.rejects(publish('test',{...trial,testInstallation:randomUUID()}));
  await publish('test',trial);
  const trialJobs=await asService(db,()=>run("public.marriage_push_claim('production',20)"));
  assert.ok(trialJobs.some(row=>row.requestId===trial.id));
  const banner={...campaign,id:randomUUID(),placement:'banner',screen:'register',audience:{},push:false};
  await publish('publish',banner);await db.exec('set role anon');try{assert.equal((await run("public.wudayn_publications('web',1)"))[0].id,banner.id);}finally{await db.exec('reset role');}
 }finally{await db.close();}
});
