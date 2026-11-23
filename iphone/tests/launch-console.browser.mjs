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
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const db=await createDatabase();
const origin='https://launch-fixture.test';
let browser;
try {
 const user=async()=>{const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};await addUser(db,u);return u;};
 const owner=await user(),member=await user();
 await seedCommunicationMember(db,member,'woman');
 await db.query("insert into marriage.staff_accounts(user_id,display_name,role) values($1,'المالك','owner')",[owner.id]);
 const methods={
   wudayn_publish:['action','payload'],wudayn_publications:['platform','build','opened'],
   marriage_admin_launch_analytics:['date_from','date_to'],marriage_ops_inspect:['command','input'],
   marriage_admin_member_signals:['target','days']
 };
 let pending=Promise.resolve();
 function rpc(path,name,params){
   const run=async()=>{
     assert.ok(Object.hasOwn(methods,name),name);
     const staff=path.startsWith('/staff/');
     assert.equal(staff,name!=='wudayn_publications');
     const values=methods[name].map(key=>params[key]??null);
     const sql='select public.'+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') as data';
     const exec=async()=>(await db.query(sql,values)).rows[0].data;
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
 import {MemberOperations} from './admin/src/MemberOperations';
 import {PublicationCenter,usePublishedCopy} from './src/publishing/PublicationCenter';
 const page=location.pathname;
 function HelpText(){return <p data-testid="help">{usePublishedCopy('help.intro','النص الأصلي')}</p>}
 function Member(){const [opened,consume]=useState(new URL(location.href).searchParams.get('notice'));return <PublicationCenter owner='${member.id}' screen="inbox" enabled openedId={opened} onConsumed={()=>consume(null)} navigate={view=>{location.hash=view}}><HelpText/></PublicationCenter>}
 createRoot(document.querySelector('#root')).render(page==='/staff/analytics'?<LaunchAnalytics onQueue={()=>{}} onMember={()=>{}}/>:
   page==='/staff/member'?<MemberOperations/>:page==='/staff/publish'?<PublicationAdmin staffId='${owner.id}'/>:
   <Member/>);`;
 const compiled=await build({absWorkingDir:root,stdin:{resolveDir:root,loader:'tsx',contents:entry},jsx:'automatic',bundle:true,outfile:'bundle.js',write:false,logLevel:'silent',
   define:{'import.meta.env.VITE_WUDAYN_WEB_BUILD':'"28"'},alias:{react:dirname(require.resolve('react/package.json')),'react-dom':dirname(require.resolve('react-dom/package.json'))},
   plugins:[{name:'disposable-transport',setup(b){
     b.onResolve({filter:/^\.\.\/cloud$/},args=>args.importer.endsWith('PublicationCenter.tsx')?{path:'member',namespace:'rpc'}:undefined);
     b.onResolve({filter:/^\.\.\/notifications\/push$/},args=>args.importer.endsWith('PublicationCenter.tsx')?{path:'native',namespace:'rpc'}:undefined);
     b.onLoad({filter:/^native$/,namespace:'rpc'},()=>({contents:'export function readNativeBuild(){throw Error("Native API called from web");}'}));
     b.onResolve({filter:/^\.\/client$/},args=>args.importer.includes('admin')?{path:'admin',namespace:'rpc'}:undefined);
     b.onLoad({filter:/.*/,namespace:'rpc'},({path})=>({contents:path==='admin'?
       "export const client=null,call=window.fixtureRpc,friendly=e=>e.message;":
       "export const cloudSessionId=async()=>'"+member.id+"',callRpc=window.fixtureRpc,cloud={rpc:async(n,p)=>{const data=await window.fixtureRpc(n,p);window.completedReads=(window.completedReads||0)+1;return {data}},channel:()=>({on:()=>({subscribe:()=>({})})}),removeChannel:()=>{}};"}));
   }}]});
 const assets=new Map(compiled.outputFiles.map(file=>['/'+file.path.split(/[\\/]/).pop(),file.contents]));
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({locale:'ar-SA',viewport:{width:402,height:874},reducedMotion:'reduce'});
 page.setDefaultTimeout(5500);
 const errors=[];page.on('pageerror',err=>{errors.push(err.message);console.error('Browser error:',err.message);});
 await page.exposeBinding('fixtureRpc',({frame},name,args)=>rpc(new URL(frame.url()).pathname,name,args));
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(url.origin!==origin)return route.abort();
   if(p.startsWith('/staff/')||p==='/member')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/bundle.css"><main id="root"></main><script src="/bundle.js"></script></html>'});
   if(assets.has(p))return route.fulfill({body:Buffer.from(assets.get(p)),contentType:p.endsWith('.js')?'text/javascript':'text/css'});
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
 const oldId=randomUUID();
 const older={id:oldId,screen:'all',placement:'inbox',title:'تنويه سابق',body:'تفاصيل التنويه.',ends:new Date(Date.now()+86400000).toISOString()};
 const publish=payload=>rpc('/staff/publish','wudayn_publish',{action:'publish',payload});
 await publish(older);
 for(let i=0;i<100;i++)await publish({...older,id:randomUUID(),title:'تحديث أحدث'});
 await visit('/member?notice='+oldId);
 await page.waitForFunction(()=>window.completedReads>=2);
 await page.getByRole('dialog').getByText(older.title,{exact:true}).waitFor();
 await rpc('/staff/publish','wudayn_publish',{action:'withdraw',payload:{id:oldId}});
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 console.log('PASS: real analytics, account lookup, publish → member read and navigate, remote copy → withdrawal and fallback');
}finally{await browser?.close();await db.close();}
