import {remount} from '../registration-matching-fixture.tsx';
import {interviewTransport,opening} from 'virtual:lifecycle-interview';

const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const all = (selector,scope=document) => Array.from(scope.querySelectorAll(selector));
const normalized = text => (text || '').replace(/\s+/g,' ').trim();
const nameOf = node => normalized(node.getAttribute('aria-label') || Array.from(node.labels||[]).map(label=>label.textContent).join(' ') || node.textContent);
const matches = (value,expected) => expected instanceof RegExp ? expected.test(value) : value===expected;
const visible = node => node && node.getClientRects().length>0 && getComputedStyle(node).visibility!=='hidden';
const named=(selector,expected)=>all(selector).find(node=>visible(node)&&matches(nameOf(node),expected));
const button=expected=>named('button',expected);
const ensure=(ok,reason)=>{if(!ok)throw Error(reason);};
function step(name) {
  window.lifecycleSignupStep=name;
  console.log('[lifecycle signup] '+name);
}
async function until(read,description) {
  for(let i=0;i<350;i++){
    const result=read();
    if(result)return result;
    await sleep(40);
  }
  throw Error(window.lifecycleSignupStep+' / '+description+' / '+document.body.innerText.slice(-1500));
}
async function tap(read,description){
  const node=await until(()=>{const value=read();return visible(value)&&!value.disabled&&value;},description);
  node.click();
  await sleep(38);
}
const press=name=>tap(()=>button(name),'button '+name);
const tapCss=selector=>tap(()=>document.querySelector(selector),selector);
const next=()=>tapCss('.nf-intake-actions > button[type=submit]');
const chapter=name=>{step(name);return until(()=>document.querySelector('main[data-chapter="'+name+'"]'),name);};
function setValue(node,value){
  const proto=node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:node instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));
}
async function fill(read,value){
  const node=await until(read,'field '+value);
  setValue(node,value);
  await sleep(25);
}
const field=(selector,value)=>fill(()=>document.querySelector(selector),value);
const labelField=(name,value)=>fill(()=>named('input:not([type=checkbox]),textarea',name),value);
async function select(label,value){
  await press(label);
  await tap(()=>named('[role=option]',value),'option '+value);
}
async function check(read,description) {
  const input=await until(read,description);
  if(!input.checked) {
    ensure(!input.disabled,'Disabled '+description);
    input.click();
    await sleep(25);
  }
  ensure(input.checked,description+' did not stick');
}
const originalFetch=window.fetch.bind(window);
function isolate(gender){
  const interview=interviewTransport();
  let sms;
  window.fetch=async(input,init={})=>{
    const path=new URL(typeof input==='string'?input:input.url||input,document.baseURI);
    if(path.pathname==='/api/interview') return interview({
      request:()=>({postDataJSON:()=>JSON.parse(init.body)}),
      fulfill:({json})=>new Response(JSON.stringify(json),{headers:{'Content-Type':'application/json'}})
    });
    if(path.pathname==='/api/signup-sms'){
      const p=JSON.parse(init.body);
      if(p.action==='send'){
        ensure(p.email===gender+'@example.test'&&p.phone===(gender==='man'?'+966500000101':'+966500000102')&&p.deviceId&&p.consent===true,'SMS send identity or consent');
        sms={proof:'local-'+gender,deviceId:p.deviceId};return Response.json({proof:sms.proof});
      }
      ensure(p.action==='verify'&&sms&&p.proof===sms.proof&&p.deviceId===sms.deviceId&&p.otp==='424242','SMS verification');
      return Response.json({verified:true});
    }
    if(path.protocol==='blob:'||path.protocol==='data:'||path.origin===location.origin&&!path.pathname.startsWith('/api/'))return originalFetch(input,init);
    throw Error('Offline fixture blocked '+path.hostname+path.pathname);
  };
}
async function upload() {
  const input=await until(()=>document.querySelector('input[type=file]'),'portrait picker');
  const canvas=document.createElement('canvas');canvas.width=500;canvas.height=600;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#bd9a9a';ctx.fillRect(0,0,500,600);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const data=new DataTransfer();data.items.add(new File([blob],'fictional.png',{type:'image/png'}));
  input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  await press('اعتماد الإطار');
}
let running=false;
window.runLifecycleSignup=async gender=>{
  if(running||!['man','woman'].includes(gender))throw Error('Expected one isolated man or woman registration');
  running=true;
  try {
    step('account / '+gender);
    isolate(gender);
    sessionStorage.removeItem('qa-account');sessionStorage.removeItem('qa-draft');
    delete window.__submitted;
    remount();
    await until(()=>document.querySelector('input[name=email]')||button('المتابعة بالبريد الإلكتروني'),'account entry');
    if(!visible(document.querySelector('input[name=email]')))await press('المتابعة بالبريد الإلكتروني');
    await field('input[name=email]',gender+'@example.test');
    await field('input[name=password]','synthetic-password-only');
    const agreements=all('.wd-entry-agreements input[type=checkbox]');
    ensure(agreements.length===3&&agreements.every(item=>item.required),'Three required entry agreements');
    for(const agreement of agreements)await check(()=>agreement,'entry agreement');
    await press('تأكيد الجوال وإنشاء الحساب');
    step('SMS / '+gender);
    await field('.nf-sms-dialog input[type=tel]',gender==='man'?'0500000101':'0500000102');
    await press('إرسال رمز التحقق');
    await field('.nf-sms-code','424242');await press('تأكيد وإنشاء حسابي');
    const person=gender==='man'?'خالد':'سارة',carry=gender==='woman';
    await chapter('identity');
    await labelField('الاسم الأول',person);await labelField('اسم العائلة','الناصر');
    await field('[data-field=displayName]',person);await press(carry?'امرأة':'رجل');await next();
    await field('[data-field=birthDate]',carry?'1997-04-15':'1995-03-02');await next();
    await press('الرياض');await select(/^ما جنسيتك/,'سعودي');await next();
    await press(/^لم يسبق.*الزواج$/);await next();
    await chapter('compatibility');
    await press('ابدأ الحوار مع لونا');await field('#wi-answer',opening);await press('إرسال الرسالة');
    const card='.wi-hybrid-card',fieldId=()=>document.querySelector(card+' fieldset')?.dataset.fieldId;
    await until(()=>document.querySelector(card),'first assessment field');
    for(let i=0;document.querySelector(card);i++){
      ensure(i<65,'Assessment did not finish');
      const before=fieldId();
      step('assessment '+(i+1)+' '+(before||'shared choice'));
      const active=()=>document.querySelector(card+' fieldset .wi-hybrid-option')||document.querySelector(card+' .wi-saved-arrangement button');
      await tap(active,'assessment answer');
      await until(()=>fieldId()!==before||!document.querySelector(card),'advance '+before);
    }
    const carryInput=await until(()=>document.querySelector('.wi-profile-carry-choice input'),'review carry-forward');
    ensure(!carryInput.checked,'Carry-forward starts unchecked');if(carry)await check(()=>carryInput,'carry profile facts');
    await press('اعتماد إجاباتي');await press('متابعة إعداد الملف');await next();
    await chapter('details');
    // The fixture's own React root remounts; only its persisted draft can restore this chapter.
    await until(()=>sessionStorage.getItem('qa-draft'),'saved account draft');
    await sleep(850);remount();await chapter('details');
    const slide=()=>document.querySelector('.wd-signup-slides[data-chapter=details]');
    for(let i=0;slide();i++){
      ensure(i<12,'Details did not advance');const index=Number(slide().dataset.slideIndex);step('details '+index);
      if(index===1){
        await labelField(/^الطول/,carry?'165':'178');await labelField(/^الوزن/,carry?'60':'75');
        await tap(()=>all('.nf-tone-choices button')[2],'skin tone');
      }else if(index===2){
        await tap(()=>all('.nf-language-chips label').find(node=>nameOf(node)==='العربية'),'Arabic language');
        await select(/^عند اختلاف اللغة/,'أفضّل أن نتحدث لغة مشتركة');
      }else if(index===4){
        if(carry)ensure(!button('خلال ٣–٦ أشهر'),'Repeated accepted timing');else await press('خلال ٣–٦ أشهر');
        await press('أفضل لقاءً بحضور الأهل قبل الخطوة الرسمية');
      }else if(index===5){await press(/لا (أرغب|أقبل|أفضل|أفكر).*التعدد/);}
      else if(index===6){if(button(/^عدد الأبناء/))await select(/^عدد الأبناء/,'دون أبناء');await press('لا أستخدم أيًا منها');}
      await next();await until(()=>!slide()||Number(slide().dataset.slideIndex)!==index,'details slide '+index);
    }
    await chapter('criteria');await press(/لا تفضيل لديّ في المعايير المتبقية/);await next();
    await chapter('preferences');if(!carry)await press('من البداية');await next();
    await chapter('story');
    if(!carry)await select(/^مجال العمل أو الوضع المهني/,'التقنية والبرمجة');
    await select(/^المؤهل الدراسي/,'بكالوريوس');await next();
    ensure((await until(()=>document.querySelector('[data-field=bio]'),'biography')).value,'Missing introduction');await next();
    for(const choice of all('.nf-prompt-choices button')){
      await tap(()=>choice,'profile prompt');await field('.nf-prompt-editor textarea','التفاهم والاحترام مهمان في حياتي.');
    }
    await next();await press('أبحث عن زواج جاد');await next();
    await chapter('avatar');
    if(carry)await tap(()=>named('[role=tab]',/صورة بتمويه اختياري/),'female portrait');
    await upload();
    if(carry){await field('#portrait-blur:enabled','100');await field('.nf-photo-reveal select','family');}
    const permission=await until(()=>document.querySelector('.nf-photo-consent input'),'portrait consent');
    ensure(!permission.checked,'New portrait consent starts unchecked');await check(()=>permission,'portrait consent');
    await until(()=>document.body.innerText.includes(carry?'صورتك جاهزة بإعدادات الخصوصية التي اخترتِها.':'صورتك جاهزة، اكتملت مطابقة الصورة.'),'processed portrait');
    await next();await chapter('readiness');
    await press('أقدر أبدأ خطوة رسمية قريب');await check(()=>named('input[type=checkbox]',/أوافق على اتفاق العضوية/),'membership agreement');await next();
    await chapter('review');
    const integrity=()=>named('input[type=checkbox]',/أقرّ بصدق إجاباتي/);
    ensure(!(await until(integrity,'integrity declaration')).checked,'Integrity declaration starts unchecked');
    await next();await until(()=>all('[role=alert]').some(node=>node.textContent.includes('إقرار صدق الإجابات')),'required integrity alert');
    ensure(!window.__submitted,'Submitted without accepting declaration');await check(integrity,'integrity declaration');await next();
    const result=await until(()=>window.__submitted,'submitted profile');
    const {account,profile,photo,photoStatus}=result;
    ensure(profile.displayName===person&&profile.gender===gender&&profile.profession==='التقنية والبرمجة','Submitted identity or profession');
    ensure(profile.marriageBasics.marriageTimeline==='three_to_six_months'&&Object.keys(profile.personalityAnswers).length===15,'Submitted assessment or timeline');
    ensure(profile.signupConsents.assessment&&profile.signupConsents.sensitivePublication===false,'Submitted consent');
    ensure(profile._applicationIntegrity==='wudayn-application-integrity-v1'&&profile._membershipReadiness.family==='early','Submitted integrity or readiness');
    ensure(photoStatus===(carry?'ready':'verified')&&(!carry||photo.blur===100&&photo.revealPolicy==='family'),'Submitted photo status or privacy');
    step('submitted / '+gender);return {account,profile,photo};
  }finally{running=false;}
};
