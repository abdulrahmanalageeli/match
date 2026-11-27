import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, readFile} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'.tmp/member-gifts');
await mkdir(output,{recursive:true});
const bundle=await build({absWorkingDir:root,stdin:{loader:'tsx',resolveDir:root,contents:`
 import {createRoot} from 'react-dom/client';
 import {GiftMembership} from './src/membership/GiftMembership';
 import './src/design.css';import './src/flows.css';import './src/typography.css';
 createRoot(document.querySelector('#root')).render(<div className="phone-app" dir="rtl"><GiftMembership
 owner="41e302c4-cc8d-4e9d-bf81-b9472709a121" back={()=>{}} attention={location.hash==='#inbox'?1:0}
 target={location.hash==='#profile'?{id:'c7002dc3-4506-4720-b1da-c7835ef82bb5',name:'سارة'}:undefined}
 settle={async s=>{await window.giftRpc('verify',s);}} refreshAccount={async()=>{}}/></div>);`},
 bundle:true, jsx:'automatic',outfile:'app.js',write:false,define:{'import.meta.env':'{}'},external:['/fonts/*','/brand/*'],plugins:[{name:'gift-services',setup(b){
 // Bundle the actual Frame shell without the unrelated native welcome animation.
 b.onLoad({filter:/[\\/]Screens\.tsx$/},async ({path})=>{
   const shell=(await readFile(path,'utf8')).split('export function Frame(')[1].split('export { Welcome }')[0];
   return {contents:"import {useLayoutEffect} from 'react';import {ArrowRight} from './BrandIcons';import {Brand} from './Brand';export function Frame("+shell,loader:'tsx'};
 });
 b.onResolve({filter:/^\.\.\/(billing|cloud)$/},a=>{
 if(a.importer.endsWith('GiftMembership.tsx'))return{path:a.path,namespace:'gift-services'};
 });
 b.onLoad({filter:/.*/,namespace:'gift-services'},a=>({contents:a.path==='../cloud'?'export const callRpc=(name,body)=>window.giftRpc(name,body);':
 `const localized={
   'com.blindmatch.marriage.gift.premium.30d':'١٤٩٫٩٩ ر.س',
   'com.blindmatch.marriage.gift.premium.30d.women':'٩٩٫٩٩ ر.س',
   'com.blindmatch.marriage.gift.seriousness.30d':'٢٩٩٫٩٩ ر.س',
   'com.blindmatch.marriage.gift.seriousness.30d.women':'١٩٩٫٩٩ ر.س'
 };
 export const isIOSBilling=()=>true,giftPrice=async productId=>{
   if(!localized[productId]) throw Error('unexpected gift product');
   return {productId,price:localized[productId],currency:'SAR'};
 },

 buyGift=async(quote,token)=>{
   const reply=await window.giftRpc('apple',{quote,token});
   if(reply.code)throw Object.assign(new Error(reply.code),reply);
   return reply.jws;
 };`}));
 }}]});
const assets=new Map(bundle.outputFiles.map(f=>['/'+basename(f.path),f.contents]));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:402,height:874},locale:'ar-SA',reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let incoming=false,purchase='ok',sent=null;const calls=[];
 await page.exposeFunction('giftRpc',async(name,body)=>{
   calls.push({name,body});
   if(name==='wudayn_received_gifts')return incoming?[{id:'in',tier:'premium',senderName:'عبدالله',days:30}]:[];
   if(name==='wudayn_sent_gifts')return sent?[sent]:[];
   if(name==='wudayn_prepare_gift'){sent={id:'out',tier:body.selected_tier,status:'waiting',productId:null,recipientName:null};return{orderToken:'out',productId:sent.productId};}
   if(name==='wudayn_gift_checkout')return{orderToken:'signed-order',productId:sent.productId};
   if(name==='apple')return purchase==='ok'?{jws:'verified-fixture'}:{code:purchase};
   if(name==='wudayn_release_gift_checkout'){assert.equal(body.order_token,'signed-order');return;}
   if(name==='verify'){assert.equal(body,'verified-fixture');sent.status='delivered';return;}
   if(name==='wudayn_accept_gift'||name==='wudayn_decline_gift'){incoming=false;return;}
   throw Error(name);
 });
 await page.route('**/*',async r=>{
   const path=new URL(r.request().url()).pathname;
   if(assets.has(path))return r.fulfill({body:Buffer.from(assets.get(path)),contentType:path.endsWith('.css')?'text/css':'application/javascript'});
   if(/^\/(fonts|brand)\//.test(path))return r.fulfill({body:await readFile(resolve(root,'public','.'+path))});
   await r.fulfill({contentType:'text/html',body:'<!DOCTYPE html><html dir="rtl" lang="ar"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>'});
 });
 const btn=name=>page.getByRole('button',{name,exact:true});
 await page.goto('https://gift.test/');await page.locator('.wd-gift-prices').getByText('١٤٩٫٩٩ ر.س',{exact:true}).waitFor();
 await page.locator('.wd-gift-prices').getByText('٩٩٫٩٩ ر.س',{exact:true}).waitFor();
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:resolve(output,'gift-402.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.getByRole('button',{name:/وسام الجدية/}).click();
 await page.getByRole('textbox',{name:'رقم جوال المستلم'}).fill('٠٥٥ ١٢٣ ٤٥٦٧');
 await btn('إرسال دعوة الإهداء').click();await page.getByText('بانتظار قبول الدعوة',{exact:true}).waitFor();
 const invitation=calls.find(c=>c.name==='wudayn_prepare_gift').body;
 assert.equal(invitation.recipient_phone,'+966551234567');assert.equal(invitation.selected_tier,'seriousness');
 assert(!calls.some(c=>c.name==='apple'));
 const womenSeriousness='com.blindmatch.marriage.gift.seriousness.30d.women';
 Object.assign(sent,{status:'ready',recipientName:'سارة',productId:womenSeriousness});await btn('تحديث الهدايا').click();
 const buy=page.getByRole('button',{name:/إهداء ٣٠ يومًا/});await buy.waitFor();
 assert.match(await buy.innerText(),/١٩٩٫٩٩/);
 await page.screenshot({path:resolve(output,'gift-checkout-402.png')});
 purchase='CANCELLED';await buy.click();await page.getByText('ما اكتمل الدفع. تقدر ترجع للهدية لاحقًا.',{exact:true}).waitFor();
 purchase='OFFER_CHANGED';await buy.click();await page.getByRole('alert').filter({hasText:'تغيّر السعر'}).waitFor();
 purchase='OFFER_UNAVAILABLE';await buy.click();await page.getByRole('alert').filter({hasText:'تعذّر تأكيد سعر الهدية'}).waitFor();
 assert.equal(calls.filter(c=>c.name==='wudayn_release_gift_checkout').length,3);
 assert(!calls.some(c=>c.name==='verify'));
 purchase='ok';await buy.click();
 await page.getByText('وصلت الهدية',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.name==='verify').length,1);
 assert.equal(calls.find(c=>c.name==='apple').body.token,'signed-order');
 assert(calls.filter(c=>c.name==='apple').every(c=>c.body.quote.productId===womenSeriousness&&c.body.quote.price==='١٩٩٫٩٩ ر.س'));
 incoming=true;await btn('تحديث الهدايا').click();await btn('قبول الدعوة').click();await btn('قبول الدعوة').waitFor({state:'hidden'});
 incoming=true;await btn('تحديث الهدايا').click();await btn('اعتذار').click();await btn('اعتذار').waitFor({state:'hidden'});
 await page.goto('https://gift.test/?from=profile#profile');await page.getByText('سارة',{exact:true}).waitFor();
 await btn('إرسال دعوة الإهداء').click();await page.getByText('بانتظار قبول الدعوة',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.name==='wudayn_prepare_gift').at(-1).body.recipient_member,'c7002dc3-4506-4720-b1da-c7835ef82bb5');
 Object.assign(sent,{status:'ready',recipientName:'عبدالله',productId:'com.blindmatch.marriage.gift.premium.30d'});
 await btn('تحديث الهدايا').click();await buy.waitFor();assert.match(await buy.innerText(),/١٤٩٫٩٩/);await buy.click();
 await page.getByText('وصلت الهدية',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.name==='apple').at(-1).body.quote.productId,'com.blindmatch.marriage.gift.premium.30d');
 assert.deepEqual(errors,[]);
 console.log('PASS 402px RTL gift creation by Saudi phone and profile, recipient consent/decline, displayed Apple quote, verification and delivered state.');
}finally{await browser.close();}
