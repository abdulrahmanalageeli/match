import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, asService } from './harness.mjs';

test('pair replies persist server-derived quotes, reject forged targets and preserve agreement gates', async () => {
  const db=await createDatabase();
  try {
    const rpc=(action,session='',payload={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload]).then(r=>r.rows[0].value));
    const a='a'.repeat(64), b='b'.repeat(64), original=randomUUID(), reply=randomUUID();
    await rpc('login',a,{actor:'abdulrahman'}); await rpc('login',b,{actor:'reham'});
    const proposal=await rpc('agreement_propose',b,{days:7,signed:true});
    await rpc('agreement_accept',a,{proposalId:proposal.seriousness.proposalId,signed:true});
    await rpc('send',a,{body:'Original question',clientId:original});
    await rpc('send',b,{body:'My answer',clientId:reply,replyToId:original,reply:{body:'forged quote'}});
    let state=await rpc('state',a);
    assert.deepEqual(state.messages.find(m=>m.id===reply).reply,{id:original,body:'Original question',sender:'abdulrahman'});
    state=await rpc('send',b,{body:'My answer',clientId:reply,replyToId:original});
    assert.equal(state.messages.length,2);
    await assert.rejects(rpc('send',b,{body:'Changed',clientId:reply,replyToId:reply}));
    await assert.rejects(rpc('send',b,{body:'Bad target',clientId:randomUUID(),replyToId:randomUUID()}));
    await assert.rejects(rpc('send','invalid',{body:'Unauthorized',clientId:randomUUID(),replyToId:original}));
    const quoted=(action,session,payload)=>asService(db,()=>db.query('select public.nisfayn_test_chat_reply($1,$2,$3) value',[action,session,payload]).then(r=>r.rows[0].value));
    const audio=randomUUID(), file=randomUUID();
    const reserve=async(actor,id,mime,extra={})=>{
      const item=await quoted('media_reserve',actor,{id,mime,size:120,...extra});
      await db.query("insert into storage.objects(bucket_id,name,metadata) values('nisfayn-test-chat',$1,$2)",[item.path,{size:120,mimetype:mime}]);
      return quoted('media_publish',actor,{id});
    };
    await reserve(a,audio,'audio/mp4',{duration:5,replyToId:reply});
    await reserve(b,file,'image/jpeg',{viewOnce:true,replyToId:audio,atSeconds:2});
    const clocked=randomUUID();
    await quoted('send',a,{body:'هنا تحديدًا',clientId:clocked,replyToId:audio,atSeconds:3});
    const sample=(await rpc('state',b)).messages;
    assert.deepEqual(sample.find(m=>m.id===audio).reply,{id:reply,body:'My answer',sender:'reham'});
    assert.deepEqual(sample.find(m=>m.id===file).reply,{id:audio,body:'رسالة صوتية',sender:'abdulrahman',atSeconds:2});
    assert.equal(sample.find(m=>m.id===clocked).reply.atSeconds,3);
    await assert.rejects(quoted('send',b,{body:'invalid',clientId:randomUUID(),replyToId:file,atSeconds:1}));
    const safe=await quoted('send',a,{body:'وصلت',clientId:randomUUID(),replyToId:file});
    assert.deepEqual(safe.messages.at(-1).reply,{id:file,sender:'reham',body:'صورة لمرة واحدة'});
    await rpc('reset',a);
    await assert.rejects(rpc('send',b,{body:'Agreement required',clientId:randomUUID(),replyToId:original}));
    assert.equal((await rpc('state',a)).messages.length,6);
  } finally { await db.close(); }
});
