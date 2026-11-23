import test from 'node:test';
import assert from 'node:assert/strict';
import recover from '../api/member-recovery.ts';

test('password recovery sends only to the verified server-resolved address and reports provider acceptance accurately', async t => {
  const old = Object.fromEntries(['NISFAYN_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','WUDAYN_MEMBER_RECOVERY_URL'].map(k=>[k,process.env[k]]));
  const project='https://wupkifqbwhhebwrgvwai.supabase.co',redirect='https://launch.example.invalid/?auth=recovery';
  Object.assign(process.env,{NISFAYN_SUPABASE_URL:project,VITE_SUPABASE_PUBLISHABLE_KEY:'local-fixture-key',WUDAYN_MEMBER_RECOVERY_URL:redirect});
  t.after(()=>{for (const [key,value] of Object.entries(old)) { if (value===undefined) delete process.env[key]; else process.env[key]=value; }});
  let permission=403,provider=200,verified='actual@example.invalid';
  const requests=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    requests.push({url,body:JSON.parse(options.body),headers:options.headers});
    return String(url).includes('/rest/')?Response.json({email:verified},{status:permission}):Response.json({},{status:provider});
  });
  const attempt=async()=>{
    const res={statusCode:0,body:null,setHeader(){},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;},end(){return this;}};
    await recover({method:'POST',headers:{authorization:'Bearer fixture-jwt'},body:{ticket:'case-fixture',email:'injected@example.invalid'}},res);
    return res;
  };
  assert.equal((await attempt()).statusCode,403);
  assert.equal(requests.length,1);
  permission=200;
  const accepted=await attempt();assert.equal(accepted.statusCode,202);assert.deepEqual(accepted.body,{accepted:true});
  assert.equal(requests.at(-1).url,project+'/auth/v1/recover?redirect_to='+encodeURIComponent(redirect));
  assert.deepEqual(requests.at(-1).body,{email:verified});
  assert.equal(requests.at(-1).headers.Authorization,undefined);
  provider=429;assert.equal((await attempt()).statusCode,429);
  provider=500;assert.equal((await attempt()).statusCode,502);
  verified='';const previous=requests.length;
  assert.equal((await attempt()).statusCode,409);assert.equal(requests.length,previous+1);
});
