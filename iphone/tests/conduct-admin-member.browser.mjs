// Real staff/member React screens and migrated PostgreSQL. Only the auth transport and model
// response are local fixtures. No requests leave the browser fixture origin.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createDatabase, addUser, asMember, asService } from '../supabase/tests/harness.mjs';
import { seedCommunicationMember, signCommunicationAgreement } from '../supabase/tests/communication-fixture.mjs';
import { screenBatch } from '../admin/api/conduct-screening.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
let playwright;
try { playwright=require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { playwright=require('C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package'); }
const db=await createDatabase();
const origin='https://conduct-fixture.test';
let browser;
try {
  const makeUser=async(label)=>{
    const actor={id:randomUUID(), sessionId:randomUUID(), email:label+'@example.invalid'};
    await addUser(db,actor); return actor;
  };
  const owner=await makeUser('owner'), member=await makeUser('member'), peer=await makeUser('peer'), candidate=await makeUser('candidate');
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'owner','فريق وُدَين')",[owner.id]);
  for(const [u,gender] of [[member,'woman'],[peer,'man'],[candidate,'man']]){
    await seedCommunicationMember(db,u,gender);
    await db.query("update marriage.members set manual_access_until=now()+interval '1 week' where id=$1",[u.id]);
  }
  const scalar=async(sql,args)=>(await db.query('select '+sql+' result',args)).rows[0].result;
  const call=(u,sql,args)=>asMember(db,u.id,u.sessionId,()=>scalar(sql,args));
  const connection=await call(member,'public.marriage_request($1)',[peer.id]);
  await call(peer,"public.marriage_act($1,'accept')",[connection]);
  await signCommunicationAgreement(call,member,peer,connection);
  let queue=Promise.resolve();
  const exclusive=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  const transport=async(path,name,params={})=>exclusive(async()=>{
    const args=[params.command||'list',params.input||{}];
    if(path==='/member' && name==='marriage_member_conduct'){
      return call(member,'public.marriage_member_conduct($1,$2)',args);
    }
    assert.equal(path,'/staff');assert.equal(name,'marriage_staff_conduct');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.id,session_id:owner.sessionId,role:'authenticated',aal:'aal2'})]);
    await db.exec('set role authenticated');
    try { return await scalar('public.marriage_staff_conduct($1,$2)',args); }
    finally { await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)"); }
  });
  const compiled=await build({
    absWorkingDir:root,stdin:{resolveDir:root,loader:'tsx',contents:
      "import {createRoot} from 'react-dom/client';import {ConductCenter} from './src/conduct/ConductCenter';import {ConductAdmin} from './admin/src/ConductAdmin';"+
      "createRoot(document.querySelector('#root')).render(location.pathname==='/staff'?<ConductAdmin/>:<ConductCenter owner='"+member.id+"'/>);"},
    jsx:'automatic',bundle:true,outfile:'bundle.js',write:false,logLevel:'silent',
    alias:{react:dirname(require.resolve('react/package.json')),'react-dom':dirname(require.resolve('react-dom/package.json'))},
    plugins:[{name:'local-auth',setup(b){
      b.onResolve({filter:/^\.\.\/cloud$/},()=>({path:'member-rpc',namespace:'qa'}));
      b.onResolve({filter:/^\.\/client$/},args=>args.importer.endsWith('ConductAdmin.tsx')?{path:'staff-rpc',namespace:'qa'}:undefined);
      b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:"export const callRpc=window.fixtureRpc;export const call=window.fixtureRpc;export function friendly(e){return e.message}"}));
    }}]
  });
  const assets=new Map(compiled.outputFiles.map(f=>['/'+f.path.split(/[\\/]/).pop(),f.contents]));
  assets.set('/member.css',(await Promise.all(['design','flows','screens'].map(name=>readFile(resolve(root,'src/'+name+'.css'),'utf8')))).join('\n'));
  assets.set('/staff.css',await readFile(resolve(root,'admin/src/style.css'),'utf8'));
  browser=await playwright.chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:402,height:874},isMobile:true,hasTouch:true,locale:'ar-SA',reducedMotion:'reduce'});
  page.on('pageerror',error=>console.error('Browser error:',error.message));
  page.setDefaultTimeout(6000);
  await page.exposeBinding('fixtureRpc',({frame},name,params)=>transport(new URL(frame.url()).pathname,name,params));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url()), path=url.pathname;
    if(url.origin!==origin)return route.abort();
    if(path==='/staff'||path==='/member')return route.fulfill({contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+path+'.css"><link rel="stylesheet" href="/bundle.css"><main id="root" class="'+(path==='/member'?'phone-app':'')+'"></main><script src="/bundle.js"></script></html>'});
    if(assets.has(path))return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:Buffer.from(assets.get(path))});
    if(path==='/brand/wudayn-emblem-v2.png'||/^\/fonts\/[a-zA-Z0-9_-]+\.woff2$/.test(path)){
      return route.fulfill({contentType:path.endsWith('.png')?'image/png':'font/woff2',body:await readFile(resolve(root,'public','.'+path))});
    }
    return route.fulfill({status:404,body:''});
  });
  const open=path=>page.goto(origin+path);
  const button=name=>page.getByRole('button',{name,exact:true});
  const dialog=page.getByRole('dialog');
  const issue=async(kind,policy,explanation,options={})=>{
    await open('/staff');await button('إصدار إجراء').click();
    await page.getByLabel('معرّف العضو').fill(member.id);
    await page.getByRole('combobox',{name:/^الإجراء/}).selectOption(kind);
    await page.getByRole('combobox',{name:/^السبب/}).selectOption(policy);
    await page.getByLabel('التوضيح الذي سيقرأه العضو').fill(explanation);
    if(options.hours)await page.getByLabel(/مدة إيقاف/).fill(String(options.hours));
    if(options.urgent)await page.getByLabel(/حماية عاجلة/).check();
    await button('معاينة الإجراء').click();
    await page.getByText('معاينة إشعار العضو',{exact:true}).waitFor();
    assert.equal(await exclusive(()=>scalar('(select count(*)::int from marriage.conduct_cases where explanation=$1)',[explanation])),0);
    await button('تأكيد وإرسال الإشعار').click();
    await page.getByText('تم تسجيل الإجراء وإتاحة إشعار العضو.',{exact:true}).waitFor();
  };
  const openNotice=async title=>{
    await open('/member');
    if(!await dialog.count()) {
      // Notices already read are still accessible through the permanent history entry.
      await page.locator('.wd-conduct-entry,dialog[open]').first().waitFor();
    }
    if(!await dialog.isVisible())await button('إشعارات حسابك').click();
    await dialog.getByRole('heading',{name:title,exact:true}).waitFor();
  };
  const review=async(reason,decision,reply)=>{
    await open('/staff');
    const row=page.locator('article').filter({hasText:reason});
    await row.getByRole('button',{name:'مراجعة الحالة'}).click();
    await row.getByRole('combobox',{name:/^القرار/}).selectOption(decision);
    await row.getByLabel('توضيح النتيجة للعضو').fill(reply);
    await row.getByRole('button',{name:'اعتماد القرار وإبلاغ العضو'}).click();
    await page.getByText('حُفظ القرار وأُرسلت النتيجة إلى إشعارات العضو.',{exact:true}).waitFor();
  };
  const appeal=async(note)=>{
    await button('طلب مراجعة من الفريق').click();
    await dialog.getByLabel(/ما الذي تود/).fill(note);
    await button('إرسال طلب المراجعة').click();
    await dialog.getByText('طلبك قيد المراجعة',{exact:true}).waitFor();
  };
  const propose=()=>exclusive(()=>call(member,'public.marriage_request($1)',[candidate.id]));
  const message=(body)=>exclusive(()=>call(member,'public.marriage_message($1,$2,$3)',[connection,body,randomUUID()]));
  await issue('warning','contact','تنبيه تجريبي بشأن حدود التواصل');
  await openNotice('تنبيه من الفريق');await button('اطّلعت على التنبيه').click();await dialog.getByText('تم الاطلاع',{exact:true}).waitFor();
  await issue('pledge','contact','تعهّد تجريبي بشأن حدود التواصل');
  await openNotice('تعهّد سلوكي');
  await assert.rejects(propose(),/إرسال طلبات التعارف/);assert.ok(await message('رسالة تجريبية في محادثة قائمة'));
  await appeal('مراجعة صياغة التعهّد');await review('مراجعة صياغة التعهّد','upheld','تمت مراجعة سبب التعهّد.');
  await openNotice('تعهّد سلوكي');await button('أوافق على هذا التعهّد').click();
  await dialog.getByText('تم تأكيد التعهّد',{exact:true}).waitFor();
  await issue('restriction','contact','تقييد تجريبي لإرسال الطلبات',{hours:6});
  await openNotice('تقييد مؤقت');await dialog.getByText('ينتهي بتوقيت الرياض',{exact:true}).waitFor();
  await assert.rejects(propose(),/إرسال طلبات التعارف/);await message('هذه المحادثة متاحة أثناء التقييد');
  await exclusive(()=>db.query("update marriage.conduct_cases set ends_at=now()-interval '1 second' where explanation=$1",['تقييد تجريبي لإرسال الطلبات']));
  await openNotice('تقييد مؤقت');await dialog.getByText('انتهت مدة التقييد',{exact:true}).waitFor();
  assert.ok(await propose());

  // Exercise the real outbox and claim/finish RPCs. Only the designated provider response is controlled.
  const evidence=await message('راح أنشر صورك');
  await exclusive(()=>call(peer,'public.marriage_report_incident_with_screen($1,$2,$3,$4)',[connection,evidence,'انتهاك الخصوصية',randomUUID()]));
  const config={project:'https://database.invalid',endpoint:'https://model.invalid',model:'fixture-approved',key:'test',serviceKey:'test'};
  await exclusive(()=>screenBatch(config,async(url,init)=>{
    const body=JSON.parse(init.body);
    if(url===config.endpoint){
      assert.deepEqual(JSON.parse(body.messages[1].content),{finding:'direct_disclosure_threat',reportedCategoryAgrees:true});
      return Response.json({model:config.model,choices:[{finish_reason:'stop',message:{content:'{"decision":"hold"}'}}]});
    }
    assert.equal(url,config.project+'/rest/v1/rpc/marriage_conduct_classifier');
    return Response.json(await asService(db,()=>scalar('public.marriage_conduct_classifier($1,$2,$3,$4)',[body.command,body.ticket,body.model_version,body.decision])));
  }));
  await openNotice('تقييد مؤقت');await dialog.getByText('رصد وُدَين الآلي',{exact:true}).waitFor();
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth && getComputedStyle(el).direction==='rtl' && getComputedStyle(el).animationName==='none'));
  await mkdir(resolve(root,'.tmp/conduct-check'),{recursive:true});
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:resolve(root,'.tmp/conduct-check/live-rpc-member-review.png')});
  await appeal('أرجو مراجعة قرار الرصد');await review('أرجو مراجعة قرار الرصد','lifted','رُفع التقييد بعد فحص الحالة.');
  await openNotice('تقييد مؤقت');await dialog.getByText('رُفع التقييد بعد فحص الحالة.',{exact:true}).waitFor();

  await issue('suspension','safety','إيقاف عاجل بعد المراجعة',{urgent:true});
  const suspendedSession=await exclusive(()=>call(member,'public.marriage_state()',[]));
  assert.equal(suspendedSession.user.id,member.id,'sign-in can load a suspended member and mount the appeal center');
  await openNotice('إيقاف الحساب');await appeal('مراجعة الإيقاف البشري');
  await review('مراجعة الإيقاف البشري','lifted','رُفع إيقاف الحساب بعد المراجعة.');
  await openNotice('إيقاف الحساب');await dialog.getByText('رُفع إيقاف الحساب بعد المراجعة.',{exact:true}).waitFor();
  assert.deepEqual((await exclusive(()=>db.query('select suspended,review_status from marriage.members where id=$1',[member.id]))).rows[0],{suspended:false,review_status:'pending'});
  console.log('PASS 28 staff warning/pledge + acknowledged copy; 29 request-only enforcement/expiry and existing chat; 30 consented controlled classifier + actual member appeal, staff outcome + suspended access/restoration (402px RTL reduced motion).');
} finally { await browser?.close();await db.close(); }
