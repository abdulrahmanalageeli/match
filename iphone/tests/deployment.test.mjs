import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeployment, marriageProjectUrl } from '../src/deployment.ts';

test('staging refuses both live databases and cannot fall back to production', () => {
  const key='sb_publishable_synthetic';
  for(const url of [undefined,marriageProjectUrl,'https://xytwdgiihfmxiflwuxti.supabase.co','https://other.example','http://stage.supabase.co','https://stage.supabase.co/extra']) {
    assert.equal(resolveDeployment({mode:'staging',url,key}).ready,false);
  }
  assert.equal(resolveDeployment({mode:'staging',url:'https://stagingfixture.supabase.co'}).ready,false);
  assert.equal(resolveDeployment({mode:'staging',url:'https://stagingfixture.supabase.co',key}).ready,true);
});
test('demo and invalid configuration stay disconnected; production is pinned', () => {
  assert.equal(resolveDeployment({}).url,marriageProjectUrl);
  for(const mode of ['demo','preview','typo']) assert.deepEqual(resolveDeployment({mode}),{selected:true,url:'',key:'',ready:false});
  for(const url of ['https://another.supabase.co','https://xytwdgiihfmxiflwuxti.supabase.co','https://user:pass@wupkifqbwhhebwrgvwai.supabase.co']) {
    assert.equal(resolveDeployment({url,key:'sb_publishable_synthetic'}).ready,false);
  }
  assert.equal(resolveDeployment({url:marriageProjectUrl,key:'service_key'}).ready,false);
  assert.equal(resolveDeployment({dev:true,local:true}).selected,false);
  assert.equal(resolveDeployment({mode:'staging',dev:true,local:true}).selected,true);
});
