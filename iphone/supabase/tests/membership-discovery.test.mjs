import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';
test('boost preserves eligibility and score truth; free score allowance is stable and capped',async()=>{
 const db=await createDatabase();
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' as value',args)).rows[0].value;
 const member=async gender=>{const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);u.token=await seedCommunicationMember(db,u,gender);return u};
 try {
  const viewer=await member('man'),women=[];for(let i=0;i<5;i++)women.push(await member('woman'));
  const seal=women[4];
  const receipt={bundleId:'com.blindmatch.marriage',appAccountToken:seal.token,originalTransactionId:randomUUID(),transactionId:randomUUID(),signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox',productId:'com.blindmatch.marriage.monthly.seriousness.women'};
  await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[seal.id,receipt]));
  const browse=()=>asMember(db,viewer.id,viewer.sessionId,()=>rpc('public.marriage_browse($1)',[{mode:'all'}]));
  const cards=await browse();assert.equal(cards[0].id,seal.id,'bonus orders otherwise equal candidates first');
  assert.equal(cards[0].membershipTier,'seriousness');
  assert.equal(cards[0].fit,undefined,'paid candidate cannot leak score to free viewer');
  await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[viewer.id,seal.id]);
  assert.ok(!(await browse()).some(p=>p.id===seal.id),'boost never bypasses a block');
  await db.query('insert into marriage.weekly_batches(member_id,week_start) values($1,marriage.current_week()) on conflict do nothing',[viewer.id]);
  for(let i=0;i<5;i++)await db.query('insert into marriage.weekly_candidates(member_id,week_start,slot,candidate_id) values($1,marriage.current_week(),$2,$3)',[viewer.id,i+1,women[i].id]);
  const selected=[];
  for(const w of women)if(await rpc('marriage.free_recommendation_allowed($1,$2)',[viewer.id,w.id]))selected.push(w.id);
  assert.equal(selected.length,3);
  for(let i=0;i<2;i++)for(const w of women){
   const card=await rpc('marriage.discovery_card($1,$2,true)',[viewer.id,w.id]);
   assert.equal('recommendationPercentage' in card,selected.includes(w.id));
   assert.equal('recommendationPercentage' in await rpc('marriage.discovery_card($1,$2,false)',[viewer.id,w.id]),false);
  }
  await assert.rejects(asMember(db,viewer.id,viewer.sessionId,()=>rpc('marriage.free_recommendation_allowed($1,$2)',[viewer.id,seal.id])));
 }finally{await db.close()}
});
