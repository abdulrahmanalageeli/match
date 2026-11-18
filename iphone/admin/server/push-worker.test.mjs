import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {createHash,timingSafeEqual} from 'node:crypto';

test('worker drains multiple batches, rechecks rotated routes and retries lost acknowledgments without resending', async()=>{
  const source=await readFile(new URL('../api/push.ts',import.meta.url),'utf8');
  const handlerSource=stripTypeScriptTypes(source.replace(/^import .*;$/gm,'').replace('export default async function handler','async function handler'));
  const jobs=Array.from({length:24},(_,i)=>({id:String(i),leaseId:'lease',kind:'message',environment:'sandbox',token:'old-address'}));
  const sent=[], finished=[], responses=[];
  let loseAck=true;
  const rpc=async(url,init)=>{
    const method=url.pathname.split('/').at(-1),args=JSON.parse(init.body);
    let result;
    switch(method){
      case 'nisfayn_enqueue_deadline_reminders': result=0; break;
      case 'marriage_push_claim': result=jobs.splice(0,args.batch_size);break;
      case 'nisfayn_test_push_claim':result=[];break;
      case 'nisfayn_push_delivery':
        assert.equal(args.claimed_token,'old-address');
        result=args.job_id==='0'?{retry:true}:args.job_id==='1'?null:{preview:'private'};break;
      case 'marriage_push_finish':
        if(args.job_id==='2' && loseAck){loseAck=false;throw Error('lost acknowledgment');}
        finished.push([args.job_id,args.result]);result=true;break;
      default:throw Error(method);
    }
    return {ok:true,json:async()=>result};
  };
  const env={CRON_SECRET:'fixture',VERCEL_ENV:'production',NISFAYN_PUSH_ENABLED:'true',NISFAYN_SERVICE_ROLE_KEY:'fixture',
    NISFAYN_SUPABASE_URL:'https://wupkifqbwhhebwrgvwai.supabase.co',APNS_TEAM_ID:'fixture',APNS_KEY_ID:'fixture',
    APNS_PRIVATE_KEY_BASE64:'fixture',APNS_ENVIRONMENT:'sandbox',APNS_TOPIC:'com.blindmatch.marriage'};
  const handler=vm.runInNewContext(handlerSource+';handler',{process:{env},URL,AbortSignal,Date,createHash,timingSafeEqual,fetch:rpc,
    console:{info(){},error(){}},openApns:()=>({send:async j=>{sent.push(j.id);return 'sent';},close(){}})});
  const res={setHeader(){},status(n){responses.push(n);return this;},json(x){return x;}};
  const counts=await handler({method:'GET',headers:{authorization:'Bearer fixture'}},res);
  assert.deepEqual(responses,[200]);assert.equal(counts.claimed,24);assert.equal(counts.sent,22);
  assert.equal(new Set(sent).size,22);assert.equal(sent.length,22);assert.equal(finished.length,24);
  assert(finished.some(([id,outcome])=>id==='0' && outcome==='retry'));
  assert(finished.some(([id,outcome])=>id==='1' && outcome==='revoked'));
});
