// Opt-in live smoke check: only synthetic content, no real chat mutations.
import assert from 'node:assert/strict';
import { PROJECT_URL, PUBLISHABLE_KEY } from '../api/_lib/ai.mjs';
const site = 'https://nisfayn-preview.vercel.app';
const post = async (url, body, headers = {}) => {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json', ...headers }, body: JSON.stringify(body), signal:AbortSignal.timeout(30000) });
  return { status:response.status, data:await response.json() };
};
const opener = {mode:'opener',profile:{bio:'شخصية توضيحية تحب القراءة والمشي بعد العمل.',interests:['القراءة','المشي']}};
const denied = await post(site+'/api/ai',opener);
assert.equal(denied.status,401,JSON.stringify(denied));
const login = await post(PROJECT_URL+'/functions/v1/pair-test',{action:'login',actor:'reham',password:''},{apikey:PUBLISHABLE_KEY});
assert.equal(login.status,200,'Private tester login');
assert.equal(typeof login.data.session,'string','Private tester session');
const headers = {'x-test-session':login.data.session};
for (const body of [opener,{mode:'demo_reply',personaId:'p01',messages:[{role:'user',content:'أهلًا، كيف تقضي نهاية الأسبوع عادة؟ هذه محادثة اختبار لشخصية توضيحية.'}]}]) {
  const result = await post(site+'/api/ai',body,headers);
  assert.equal(result.status,200,JSON.stringify(result));
  assert.equal(result.data.source,'openai');
  assert.ok(result.data.text.length>0&&result.data.text.length<=450);
  console.log(JSON.stringify({mode:body.mode,status:result.status,source:result.data.source,text:result.data.text}));
}
console.log('PASS: unauthenticated access rejected; live opener and fictional reply generated.');
