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
    await rpc('reset',a);
    await assert.rejects(rpc('send',b,{body:'Agreement required',clientId:randomUUID(),replyToId:original}));
    assert.equal((await rpc('state',a)).messages.length,2);
  } finally { await db.close(); }
});
