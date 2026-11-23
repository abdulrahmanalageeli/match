import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {classifyEnvelope} from '../api/conduct-classifier.ts';
import {screenBatch} from '../api/conduct-screening.ts';

test('classifier callback binds ticket, model, decision and freshness to the signature',()=>{
  const stamp='1764000000', now=Number(stamp)*1000, ticket='38052d73-b543-486b-9a94-824b48571b72', key='s'.repeat(40);
  const model='approved:2026-11', input={command:'finish',ticket,model,decision:'hold'};
  const signature=createHmac('sha256',key).update(JSON.stringify(['conduct-v1',stamp,'finish',ticket,model,'hold'])).digest('hex');
  const verify=(value,at=now)=>classifyEnvelope(value,stamp,signature,key,model,at);
  assert.deepEqual(verify(input),{command:'finish',ticket,model_version:model,decision:'hold'});
  assert.equal(verify({...input,decision:'review'}),null);
  assert.equal(verify({...input,memberId:ticket}),null);
  assert.equal(verify({...input,model:'unapproved'}),null);
  assert.equal(verify(input,now+121000),null);
});

test('opt-in screening worker sends categorical indicators only and defaults to human review on provider failure',async()=>{
  const config={endpoint:'https://provider.example.invalid/v1/chat/completions',model:'approved-model-v1',key:'fake',project:'https://project.example.invalid',serviceKey:'fake'};
  for(const fail of [false,true]){
    let done=false, received=false;
    const result=await screenBatch(config,async (url,init)=>{
      const body=JSON.parse(init.body);
      if(url===config.endpoint){
        received=true;
        assert.deepEqual(JSON.parse(body.messages[1].content),{finding:'direct_disclosure_threat',reportedCategoryAgrees:true});
        assert.equal(body.store,false); assert.equal(body.model,config.model);
        if(fail)throw Error('offline');
        return Response.json({model:config.model,choices:[{finish_reason:'stop',message:{content:'{"decision":"hold"}'}}]});
      }
      if(body.command==='claim')return Response.json(done?null:{finding:'direct_disclosure_threat',reportedCategoryAgrees:true});
      assert.equal(body.command,'finish');assert.equal(body.decision,fail?'review':'hold');done=true;
      return Response.json({recorded:true});
    });
    assert.deepEqual(result,{assessed:1});assert.equal(received,true);
  }
});
