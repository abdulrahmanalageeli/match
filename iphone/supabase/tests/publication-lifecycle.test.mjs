import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { addUser, asMember, asService, createDatabase } from './harness.mjs';
import { seedCommunicationMember } from './communication-fixture.mjs';

test('launch publishing, scheduling, changes and incident controls against the complete schema', async t => {
 const db = await createDatabase();
 t.after(() => db.close());
 async function user(gender, id=randomUUID()) {
   const person = { id, sessionId: randomUUID(), email: randomUUID()+'@example.invalid' };
   await addUser(db,person);
   if(gender) await seedCommunicationMember(db,person,gender);
   return person;
 }
 const owner=await user(), woman=await user('woman'), man=await user('man');
 await db.query("insert into marriage.staff_accounts(user_id,display_name,role) values($1,'مالك','owner')",[owner.id]);
 const rpc=async (sql,values=[]) => (await db.query('select '+sql+' as value',values)).rows[0].value;
 async function ownerCall(sql,args){
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',aal:'aal2',sub:owner.id,session_id:owner.sessionId})]);
   await db.exec('set role authenticated');
   try { return await rpc(sql,args); }
   finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims','',false)"); }
 }
 const publish=(action,payload)=>ownerCall('public.wudayn_publish($1,$2)',[action,payload]);
 const member=(who,sql,args)=>asMember(db,who.id,who.sessionId,()=>rpc(sql,args));
 const feed=(who,platform='ios',build=28,opened=null)=>member(who,'public.wudayn_publications($1,$2,$3)',[platform,build,opened]);
 const service=(sql,args)=>asService(db,()=>rpc(sql,args));
 const news=(changes={})=>({id:randomUUID(),screen:'all',placement:'news',title:'تحديث التطبيق',body:'نص التحديث.',ends:new Date(Date.now()+86400000).toISOString(),...changes});
 const find=(rows,id)=>rows.find(row=>row.id===id);
 async function attach(who,token,build) {
   const id=randomUUID();
   await member(who,'public.marriage_push_enable(true)');
   await member(who,"public.marriage_push_register($1,'production',$2)",[token.repeat(64),id]);
   await member(who,'public.wudayn_news_preference(true,$1,$2)',[id,build]);
   return id;
 }

 await t.test('25: recipient and device counts, timed dispatch, opt-out, retries, receipt and open totals', async () => {
   await attach(woman,'a',28); await attach(woman,'b',28); await attach(man,'c',28);
   const msg=news({push:true,destination:'discover',starts:new Date(Date.now()+3600000).toISOString(),
      audience:{gender:'woman',stage:'approved',tier:'free',platform:'ios',build:27,maxBuild:29}});
   assert.deepEqual(await publish('preview',msg),{reachable:1,devices:2});
   await publish('publish',msg);
   assert.ok(!find(await feed(woman),msg.id));
   assert.equal((await service("public.marriage_push_claim('production',10)")).length,0);
   await db.query("update marriage.publications set starts_at=now()-interval '1 minute' where id=$1",[msg.id]);
   await db.exec('select marriage.dispatch_publications();select marriage.dispatch_publications()');
   const jobs=await service("public.marriage_push_claim('production',10)");
   assert.equal(jobs.length,2);
   assert.ok(jobs.every(j=>j.requestId===msg.id));
   assert.equal((await service("public.marriage_push_claim('production',10)")).length,0);
   await member(woman,'public.wudayn_news_preference(false)');
   assert.equal(await service('public.nisfayn_push_delivery($1,$2,false,$3)',[jobs[0].id,jobs[0].leaseId,jobs[0].token]),null);
   assert.equal(find(await feed(woman),msg.id).destination,'discover');
   assert.ok(!find(await feed(man),msg.id)); assert.ok(!find(await feed(woman,'web'),msg.id));
   assert.ok(!find(await feed(woman,'ios',26),msg.id)); assert.ok(!find(await feed(woman,'ios',30),msg.id));
   await member(woman,'public.wudayn_news_preference(true)');
   for(const [i,j] of jobs.entries()){
     assert.equal((await service('public.nisfayn_push_delivery($1,$2,false,$3)',[j.id,j.leaseId,j.token])).preview,'private');
     await service('public.marriage_push_finish($1,$2,$3,$4)',[j.id,j.leaseId,i===0?'sent':'failed',j.token]);
   }
   await feed(woman,'ios',28,msg.id); await feed(woman,'ios',28,msg.id);
   const history=find(await publish('list',{}),msg.id);
   assert.equal(history.accepted,1);assert.equal(history.failed,1);assert.equal(history.opened,1);assert.equal(history.queued,0);
 });

 await t.test('26: public banner, private inbox, safe refresh, correction, withdrawal and expiry',async()=>{
   const banner=news({placement:'banner',screen:'register'}), inbox=news({placement:'inbox',audience:{member:man.id}});
   await publish('publish',banner); await publish('publish',inbox);
   await db.exec('set role anon');
   try { const rows=await rpc("public.wudayn_publications('web',28)");assert.ok(find(rows,banner.id));assert.ok(!find(rows,inbox.id)); }
   finally {await db.exec('reset role');}
   assert.ok(!find(await feed(woman),inbox.id));assert.ok(find(await feed(man),inbox.id));
   await publish('correct',{...banner,body:'تم استعادة الخدمة.'});
   assert.equal(find(await feed(woman),banner.id).body,'تم استعادة الخدمة.');
   const notices=await db.query("select payload from realtime.messages where topic='wudayn:publications' and event='refresh'");
   assert.ok(notices.rows.length>=3); assert.ok(!JSON.stringify(notices.rows).includes('الخدمة'));
   await publish('withdraw',{id:banner.id});assert.ok(!find(await feed(woman),banner.id));
   await db.query("update marriage.publications set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where id=$1",[inbox.id]);
   assert.ok(!find(await feed(man),inbox.id));
 });

 await t.test('27: staff preview, version targeting, compatible fallback, reversible copy, immutable audit',async()=>{
   const key='luna.example';
   const baseline=news({placement:'setting',key,body:'النص الأساسي'});
   const trial=news({placement:'setting',key,body:'مراجعة الفريق',audience:{staff:true,build:28}});
   const launch=news({placement:'setting',key,body:'التحديث المعتمد',audience:{percent:100,build:28}});
   const copy=async(who,build)=>(await feed(who,'ios',build)).find(it=>it.key===key)?.body;
   await publish('publish',baseline); await publish('publish',trial);
   assert.equal(await copy(owner,28),trial.body); assert.equal(await copy(woman,28),baseline.body);
   const cohortMembers=[];
   for(let n=0;cohortMembers.filter(Boolean).length<2;n++){
     const id='00000000-0000-4000-8000-'+String(n).padStart(12,'0');
     const bucket=parseInt(createHash('md5').update(id).digest('hex').slice(0,8),16)%100;
     const group=bucket<50?0:1;
     if(!cohortMembers[group])cohortMembers[group]=await user('woman',id);
   }
   const partial={...launch,id:randomUUID(),audience:{percent:50,build:28}};
   await publish('publish',partial);
   assert.equal(await copy(cohortMembers[0],28),partial.body);
   assert.equal(await copy(cohortMembers[1],28),baseline.body);
   assert.equal(await copy(cohortMembers[0],27),baseline.body);
   await publish('withdraw',{id:partial.id});
   await publish('publish',launch); assert.equal(await copy(woman,27),baseline.body);assert.equal(await copy(man,28),launch.body);
   await publish('correct',{...launch,body:'نص محدّث'});assert.equal(await copy(woman,28),'نص محدّث');
   const versions=await publish('history',{id:launch.id});await publish('rollback',{id:launch.id,version:versions[0].id});
   assert.equal(await copy(woman,28),launch.body);
   await publish('withdraw',{id:launch.id});assert.equal(await copy(woman,28),baseline.body);
   const audit=await ownerCall('public.wudayn_staff_search($1)',[launch.id]);
   assert.ok(['publication_created','publication_corrected','publication_withdrawn'].every(action=>audit.some(row=>row.action===action)));
   await assert.rejects(member(man,'public.wudayn_staff_search($1)',[launch.id]));
   await assert.rejects(publish('publish',news({placement:'setting',key:'unshipped.feature'})));
 });

 await t.test('25–27: busy inbox retains targeted notices and compatible settings', async () => {
   const old=news({destination:'discover'});
   const help=news({placement:'setting',key:'help.intro',body:'دليل العضو'});
   const banner=news({placement:'banner',screen:'settings'});
   for(const item of [old,help,banner]) await publish('publish',item);
   for(let n=0;n<101;n++) await publish('publish',news());
   const items=await feed(woman,'ios',28,old.id);
   assert.equal(find(items,old.id)?.destination,'discover');
   assert.equal(find(items,help.id)?.body,help.body);
   assert.equal(find(items,banner.id)?.screen,'settings');
   assert.equal(new Set(items.map(item=>item.id)).size,items.length);
 });

 await t.test('21/27: pauses block new work, preserve existing slots and roll back',async()=>{
   await db.exec("update marriage.launch_offer_campaigns set enabled=true");
   const offer=(u,id)=>service('public.marriage_prepare_launch_offer($1,$2,true)',[u.id,id]);
   assert.equal((await offer(woman,'1001')).reserved,true);
   const pause=news({placement:'setting',key:'pause.offer',body:'on'});
   await publish('publish',pause);
   assert.equal((await offer(woman,'1001')).reserved,true);assert.equal((await offer(man,'1002')).reserved,false);
   await publish('withdraw',{id:pause.id});assert.equal((await offer(man,'1002')).reserved,true);
   const luna=news({placement:'setting',key:'pause.luna',body:'on'});
   await assert.rejects(publish('publish',{...luna,audience:{staff:true}}));
   await publish('publish',luna);await assert.rejects(member(man,'public.marriage_luna_search_reserve()'),/متوقف مؤقتًا/);
   await publish('withdraw',{id:luna.id});assert.equal(await rpc("marriage.publication_paused('pause.luna')"),false);
   await ownerCall('public.wudayn_admin_luna_block($1,true,$2)',[man.id,'طلب عضو تجريبي']);
   assert.equal(await rpc('(select blocked from marriage.luna_search_usage where member_id=$1)',[man.id]),true);
   await ownerCall('public.wudayn_admin_luna_block($1,false,$2)',[man.id,'استعادة البحث']);
   assert.equal(await rpc('(select blocked from marriage.luna_search_usage where member_id=$1)',[man.id]),false);
 });
});
