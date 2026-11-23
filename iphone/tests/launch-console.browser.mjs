// Exercise the shipped React views against the migrated SQL, with disposable member and MFA sessions.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createDatabase, addUser, asMember } from '../supabase/tests/harness.mjs';
import { seedCommunicationMember } from '../supabase/tests/communication-fixture.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const db=await createDatabase();
const origin='https://launch-fixture.test';
const dbHost='wupkifqbwhhebwrgvwai.supabase.co';
const webConfig=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8'));
const policy=webConfig.headers.flatMap(rule=>rule.headers).find(header=>header.key.toLowerCase()==='content-security-policy').value;
const connections=policy.split(';').map(s=>s.trim()).find(s=>s.startsWith('connect-src ')).split(/\s+/);
assert.ok(connections.includes('wss://'+dbHost));
assert.ok(!connections.includes('wss://*.supabase.co'));
let browser;
try {
 const user=async()=>{const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};await addUser(db,u);return u;};
 const owner=await user(),member=await user(),installation=randomUUID();
 await seedCommunicationMember(db,member,'woman');
 await db.query("insert into marriage.staff_accounts(user_id,display_name,role) values($1,'المالك','owner')",[owner.id]);
 const methods={
   wudayn_publish:['action','payload'],wudayn_publications:['platform','build','opened'],
   wudayn_registration_phase:['action','expected_revision','member'],wudayn_launch_alert:['subscribe','installation'],
   marriage_admin_launch_analytics:['date_from','date_to'],marriage_ops_inspect:['command','input'],
   marriage_admin_member_signals:['target','days']
 };
 let pending=Promise.resolve();
 function rpc(path,name,params){
   const run=async()=>{
     assert.ok(Object.hasOwn(methods,name),name);
     const staff=path.startsWith('/staff/');
     assert.equal(staff,!['wudayn_publications','wudayn_launch_alert'].includes(name));
     const values=methods[name].map(key=>params[key]??null);
     const sql='select public.'+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') as data';
     const exec=async()=>(await db.query(sql,values)).rows[0].data;
     if(path.startsWith('/public/')){
       await db.exec('set role anon');
       try{return await exec();}finally{await db.exec('reset role');}
     }
     if(!staff)return asMember(db,member.id,member.sessionId,exec);
     await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.id,session_id:owner.sessionId,role:'authenticated',aal:'aal2'})]);
     await db.exec('set role authenticated');
     try{return await exec();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)");}
   };
   const result=pending.then(run);pending=result.catch(error=>console.error('RPC failed:',name,error.message));return result;
 }
 const entry=`
 import {createRoot} from 'react-dom/client';
 import {useState} from 'react';
 import {PublicationAdmin} from './admin/src/PublicationAdmin';
 import {LaunchAnalytics} from './admin/src/LaunchAnalytics';
 import {RegistrationWait} from './src/release/RegistrationWait';
 import {MemberOperations} from './admin/src/MemberOperations';
 import {PublicationCenter,usePublishedCopy} from './src/publishing/PublicationCenter';
 const page=location.pathname;
 function HelpText(){return <p data-testid="help">{usePublishedCopy('help.intro','النص الأصلي')}</p>}
 function Member(){const [opened,consume]=useState(new URL(location.href).searchParams.get('notice'));const isPublic=page.startsWith('/public/');return <PublicationCenter owner={isPublic?null:'${member.id}'} screen={isPublic?page.split('/').pop():'inbox'} enabled openedId={opened} onConsumed={()=>consume(null)} navigate={view=>{location.hash=view}}><HelpText/></PublicationCenter>}
 createRoot(document.querySelector('#root')).render(page==='/staff/analytics'?<LaunchAnalytics onQueue={()=>{}} onMember={()=>{}}/>:
   page==='/staff/member'?<MemberOperations/>:page==='/staff/publish'?<PublicationAdmin staffId='${owner.id}'/>:
   page==='/wait'?<RegistrationWait owner='${member.id}' subscribed={false} onRefresh={async()=>{}} onSettings={()=>{location.hash='settings'}}/>:<Member/>);`;
 const compiled=await build({absWorkingDir:root,stdin:{resolveDir:root,loader:'tsx',contents:entry},jsx:'automatic',bundle:true,outfile:'bundle.js',write:false,logLevel:'silent',
   define:{'import.meta.env.VITE_WUDAYN_WEB_BUILD':'"28"'},alias:{react:dirname(require.resolve('react/package.json')),'react-dom':dirname(require.resolve('react-dom/package.json'))},
   plugins:[{name:'disposable-transport',setup(b){
     b.onResolve({filter:/^\.\.\/cloud$/},args=>/(PublicationCenter|RegistrationWait)\.tsx$/.test(args.importer)?{path:'member',namespace:'rpc'}:undefined);
     b.onResolve({filter:/^\.\.\/notifications\/push$/},args=>/(PublicationCenter|RegistrationWait)\.tsx$/.test(args.importer)?{path:'native',namespace:'rpc'}:undefined);
     b.onLoad({filter:/^native$/,namespace:'rpc'},()=>({contents:`export function readNativeBuild(){throw Error('Native API called from web');} export async function registerPushDevice(){window.pushAttempts=(window.pushAttempts||0)+1;if(!window.pushAllowed)throw Error('لم يتم السماح بالإشعارات.');return '${installation}';}`}));
     b.onResolve({filter:/^\.\/client$/},args=>args.importer.includes('admin')?{path:'admin',namespace:'rpc'}:undefined);
     b.onLoad({filter:/.*/,namespace:'rpc'},({path})=>({contents:path==='admin'?
       "export const client=null,call=window.fixtureRpc,friendly=e=>e.message;":
       "export const cloudSessionId=async()=>location.pathname.startsWith('/public/')?null:'"+member.id+"',callRpc=window.fixtureRpc,cloud={rpc:async(n,p)=>{const data=await window.fixtureRpc(n,p);window.completedReads=(window.completedReads||0)+1;if(window.completedReads>=2)document.documentElement.dataset.synced='yes';return {data}},channel:topic=>{const handlers=new Map();const c={on:(kind,filter,cb)=>{handlers.set(filter.event,cb);return c},subscribe:()=>{const socket=new WebSocket('wss://"+dbHost+"/realtime/v1/websocket');socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.topic===topic)handlers.get(msg.event)?.(msg)};return socket}};return c},removeChannel:s=>s.close()};"}));
   }}]});
 const assets=new Map(compiled.outputFiles.map(file=>['/'+file.path.split(/[\\/]/).pop(),file.contents]));
 browser=await chromium.launch({headless:true,channel:process.env.WUDAYN_BROWSER_CHANNEL||'chrome'});
 const page=await browser.newPage({locale:'ar-SA',viewport:{width:402,height:874},reducedMotion:'reduce'});
 page.setDefaultTimeout(5500);
 let broadcastSocket;
 await page.routeWebSocket('wss://'+dbHost+'/**',ws=>{broadcastSocket=ws});
 const errors=[];page.on('pageerror',err=>{errors.push(err.message);console.error('Browser error:',err.message);});
 await page.exposeBinding('fixtureRpc',({frame},name,args)=>rpc(new URL(frame.url()).pathname,name,args));
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(url.origin!==origin)return route.abort();
   if(p.startsWith('/staff/')||p.startsWith('/public/')||p==='/member'||p==='/wait')return route.fulfill({contentType:'text/html; charset=utf-8',headers:{'Content-Security-Policy':policy},body:'<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/bundle.css"><main id="root"></main><script src="/bundle.js"></script></html>'});
   if(assets.has(p))return route.fulfill({body:Buffer.from(assets.get(p)),contentType:p.endsWith('.js')?'text/javascript':'text/css'});
   if(/^\/brand\/welcome\/(discovery|compatibility|journey)\.webp$/.test(p))return route.fulfill({body:await readFile(resolve(root,'public','.'+p)),contentType:'image/webp'});
   if(p==='/brand/wudayn-emblem-v2.png')return route.fulfill({body:await readFile(resolve(root,'public','.'+p)),contentType:'image/png'});
   return route.fulfill({status:404,body:''});
 });
 const visit=path=>page.goto(origin+path);
 const btn=name=>page.getByRole('button',{name,exact:true});
 await visit('/staff/analytics');
 await page.locator('.la-table').first().waitFor();
 await visit('/staff/member');
 await page.locator('.mo-query input').fill(member.id);await btn('بحث').click();
 await page.getByRole('heading',{name:'عضو اختبار',exact:true}).waitFor();
 await page.getByText('الحساب والتسجيل',{exact:true}).click();
 await page.getByText('تأكيد الجوال',{exact:true}).waitFor();
 await visit('/staff/publish');
 async function submit(){await btn('معاينة قبل النشر').click();await btn('تأكيد النشر').click();await page.getByRole('status').filter({hasText:'حُفظ النشر'}).waitFor();}
 const title='تحديث مجرّب';
 await page.getByLabel('العنوان',{exact:true}).fill(title);await page.getByLabel('النص',{exact:true}).fill('راجع آخر التحديثات.');
 await page.getByLabel('الانتقال عند الضغط').selectOption('discover');
 await submit();
 await visit('/member');await page.getByText('جديد وُدَين',{exact:true}).click();await btn(title).click();
 await btn('فتح الاستكشاف').click();assert.equal(new URL(page.url()).hash,'#discover');
 await visit('/staff/publish');await page.getByLabel('موضع النشر').selectOption('setting');
 await page.getByLabel('المحتوى أو الميزة').selectOption('help.intro');
 await page.getByLabel('العنوان',{exact:true}).fill('تحديث الدليل');await page.getByLabel('النص',{exact:true}).fill('مقدمة من فريق وُدَين');
 await submit();
 await visit('/member');await page.getByText('مقدمة من فريق وُدَين',{exact:true}).waitFor();
 await visit('/staff/publish');await page.locator('.wd-admin-record').filter({hasText:'تحديث الدليل'}).getByRole('button',{name:'سحب',exact:true}).click();
 await page.getByRole('status').filter({hasText:'سُحب المنشور'}).waitFor();
 await visit('/member');await page.getByText('جديد وُدَين',{exact:true}).waitFor();assert.equal(await page.getByTestId('help').textContent(),'النص الأصلي');
 // Publish with this tab already open. Deliver the migrated DB's broadcast over
 // the exact websocket origin permitted by the deployed member CSP.
 const before=await page.evaluate(()=>window.completedReads);
 const liveTitle='تنويه فوري في الصفحة المفتوحة';
 await db.exec('delete from realtime.messages');
 await rpc('/staff/publish','wudayn_publish',{action:'publish',payload:{id:randomUUID(),screen:'inbox',placement:'banner',title:liveTitle,body:'تنويه فوري',ends:new Date(Date.now()+86400000).toISOString()}});
 const signal=(await db.query("select topic,event from realtime.messages where topic='wudayn:publications' and event='refresh'")).rows[0];
 assert.ok(signal && broadcastSocket);
 broadcastSocket.send(JSON.stringify(signal));
 await page.locator('.wd-pub-banner').getByText(liveTitle,{exact:true}).waitFor({timeout:4000});
 assert.ok(await page.evaluate(()=>window.completedReads)>before);
 const oldId=randomUUID();
 const older={id:oldId,screen:'all',placement:'inbox',title:'تنويه سابق',body:'تفاصيل التنويه.',ends:new Date(Date.now()+86400000).toISOString()};
 const publish=payload=>rpc('/staff/publish','wudayn_publish',{action:'publish',payload});
 await publish(older);
 for(let i=0;i<100;i++)await publish({...older,id:randomUUID(),title:'تحديث أحدث'});
 await visit('/member?notice='+oldId);
 await page.locator('html[data-synced=yes]').waitFor({state:'attached'});
 await page.getByRole('dialog').getByText(older.title,{exact:true}).waitFor();
 await rpc('/staff/publish','wudayn_publish',{action:'withdraw',payload:{id:oldId}});
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await page.getByRole('dialog').waitFor({state:'hidden'});
 // Show the real phase setting immediately to anonymous welcome and signup visitors.
 const changePhase=(action,revision)=>rpc('/staff/publish','wudayn_registration_phase',{action,expected_revision:revision});
 const locked=await changePhase('lock',0);
 await asMember(db,member.id,member.sessionId,()=>db.query("select public.marriage_push_register($1,'production',$2)",['b'.repeat(64),installation]));
 await visit('/wait');
 for(const [label,id] of [['الاكتشاف','discovery'],['التوافق','compatibility'],['التعارف','journey']]){
   const selector=btn(label);
   await selector.click();
   assert.equal(await selector.getAttribute('aria-pressed'),'true');
   const image=page.getByRole('figure').getByRole('img');
   assert.equal(await image.getAttribute('src'),'/brand/welcome/'+id+'.webp');
   await image.evaluate(img=>img.decode());
 }
 assert.equal(await page.evaluate(()=>window.pushAttempts||0),0);
 await btn('نبّهني عند الإطلاق').click();
 await page.getByRole('alert').waitFor();
 await page.evaluate(()=>{window.pushAllowed=true});
 await btn('نبّهني عند الإطلاق').click();
 await page.getByRole('status').waitFor();
 await btn('إلغاء تنبيه الإطلاق').click();
 await btn('نبّهني عند الإطلاق').waitFor();
 await btn('إعدادات حسابي').click();assert.equal(new URL(page.url()).hash,'#settings');
 const earlyNotice=page.getByRole('complementary',{name:'التسجيل المبكر مفتوح'});
 for(const screen of ['welcome','register']){
   await visit('/public/'+screen);
   await earlyNotice.waitFor();
   assert.equal(await earlyNotice.getByRole('button').count(),0);
 }
 await db.exec('delete from realtime.messages');
 await changePhase('open',locked.revision);
 const phaseSignal=(await db.query("select topic,event from realtime.messages where topic='wudayn:publications' and event='registration-phase'")).rows[0];
 assert.ok(phaseSignal && broadcastSocket);
 broadcastSocket.send(JSON.stringify(phaseSignal));
 await earlyNotice.waitFor({state:'detached',timeout:4000});
 assert.deepEqual(errors,[]);
 console.log('PASS: real analytics, account lookup, publish → member read and navigate, remote copy → withdrawal and fallback, waiting-room previews and permission controls, anonymous welcome and signup → live opening');
}finally{await browser?.close();await db.close();}
