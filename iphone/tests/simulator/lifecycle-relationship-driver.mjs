const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const visible = node => node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
function find(selector, scope=document) {
  return [...scope.querySelectorAll(selector)].find(visible);
}
function label(text, scope=document) {
  return [...scope.querySelectorAll('button, summary')].find(node => visible(node) &&
    (node.textContent.trim() === text || node.getAttribute('aria-label') === text));
}
async function until(description, evaluate, timeout=18000) {
  const deadline=Date.now()+timeout;
  do { const value=await evaluate(); if(value) return value; await sleep(100); } while(Date.now()<deadline);
  const alerts=[...document.querySelectorAll('[role=alert],.form-error')].filter(visible).map(el=>el.innerText);
  throw Error(description+'; alerts='+JSON.stringify(alerts)+'; view='+document.body.innerText.slice(0,550));
}
async function click(description, locate) {
  const el=await until(description,()=>{const node=locate();return node && !node.disabled && node;});
  el.scrollIntoView({block:'nearest'}); el.click();
}
function inputValue(el,value) {
  const parent=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(parent,'value').set.call(el,value);
  el.dispatchEvent(new Event('input',{bubbles:true}));
}
const responsePhone='0550000007'; // Synthetic; the dial action is never activated.
const message1='السلام عليكم، هل يناسبك أن نتحدث عن ترتيب الخطوة المقبلة؟';
const message2='وعليكم السلام، نعم يهمني أن تكون الخطوات واضحة للطرفين.';
const qid=id=>CSS.escape(id);
export async function runRelationship({branch,actors,people,mount,request}) {
  if(!['end','escalate'].includes(branch))throw Error('Unknown relationship branch '+branch);
  let id='';
  const trace=window.relationshipAudit={branch,step:'started',steps:[],status:'running'};
  const mark=step=>{trace.step=step;trace.steps.push(step);};
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const state=(actor,name,...args)=>people[actor].rpc(name,...args);
  async function chat(actor) {
    mount(actor,'chats');
    await click(actor+' opens accepted chat',()=>find('[data-request-row="'+qid(id)+'"]'));
    await until(actor+' sees chat',()=>find('.cm-chat-stage'));
  }
  async function send(body) {
    const input=await until('chat composer',()=>find('textarea[aria-label="رسالتك"]'));
    inputValue(input,body);
    await click('enabled send',()=>find('button[aria-label="إرسال الرسالة"]'));
    return until('saved message with receipt',()=>[...document.querySelectorAll('[data-server-id]')].find(el=>
      el.querySelector('.cm-bubble>p')?.textContent===body && el.querySelector('[data-receipt]')));
  }
  async function read(actor,body) {
    const row=await until(actor+' sees peer message',()=>[...document.querySelectorAll('[data-server-id]')].find(el=>
      el.querySelector('.cm-bubble>p')?.textContent===body && !el.querySelector('.cm-bubble.self')));
    const log=row.closest('.cm-chat-log'); if(log){log.scrollTop=log.scrollHeight;log.dispatchEvent(new Event('scroll'));}
    const sender=actor==='male'?'female':'male';
    await until('server persisted '+actor+' read receipt',async()=>(await state(sender,'marriage_thread_page',id,null))
      .some(message=>message.body===body && (message.readAt||message.readByPeer)));
  }
  async function signature(actor) {
    await chat(actor);
    const checkbox=await until(actor+' signature checkbox',()=>find('.cm-agreement-sign input[type=checkbox]'));
    const submit=find('.cm-agreement-submit');
    check(submit?.disabled,actor+' could submit without signing');
    checkbox.click();
    await click(actor+' signs',()=>find('.cm-agreement-submit'));
    await until(actor+' signature committed',async()=>(await state(actor,'marriage_agreement',id,'read',{}))[actor==='female'?'womanSignedAt':'manSignedAt']);
  }
  async function expiredDetails(actor) {
    await chat(actor);
    const action=await until('expired pact or details',()=>find('.cm-agreement[data-agreement-status=expired]')||label('اختيار الخطوة التالية'));
    if(action.tagName==='BUTTON')action.click();
    await until('expired pact displayed',()=>find('.cm-agreement[data-agreement-status=expired]'));
  }
  async function guide(actor) {
    await chat(actor);
    await click('conversation options',()=>find('button[aria-label="خيارات المحادثة"]'));
    await click('relationship stages',()=>[...document.querySelectorAll('button')].find(node=>visible(node)&&node.querySelector('strong')?.textContent==='مسار التعارف'));
    await until('journey data',()=>find('.nf-journey-track'));
  }
  async function exclusive(actor,accept) {
    await guide(actor);
    if(!find('.nf-journey-consent-check input')) await click('review exclusivity terms',()=>label('مراجعة التعارف الحصري'));
    const box=await until('confirm exclusivity consequences',()=>find('.nf-journey-consent-check input'));
    check(!box.checked,'Exclusivity consent preselected');box.click();
    await click('submit exclusivity decision',()=>label(accept?'الموافقة وبدء التعارف الحصري':'اقتراح التعارف الحصري'));
    await until(actor+' exclusivity state',async()=>{const p=await state(actor,'marriage_progress',id);return accept?p.exclusive:p.consentMine&&!p.exclusive;});
  }
  async function stage(actor,index,accept) {
    const names=index===1?['اقتراح مناقشة أساسيات الزواج','أوافق على مناقشة أساسيات الزواج']:['اقتراح التواصل مع الأهل','أوافق على التواصل مع الأهل'];
    await guide(actor);await click(actor+' stage '+index,()=>label(names[Number(accept)]));
    await until('saved stage '+index,async()=>{const p=await state(actor,'marriage_progress',id);return accept?p.stage===index:p.stage===index-1&&p.mine;});
  }
  async function history(actor) {
    mount(actor,'curated');
    await click('closed relationship history',()=>find('.mo-history .cm-history-heading'));
    const summary=await until('history record matches request ID',()=>find('#history-'+qid(id)));
    summary.click();return summary;
  }
  try {
    if(branch==='end'){
      mark('male opens the female signup in Discovery');
      mount('male','discover');
      await click('all files directory',()=>label('جميع الملفات'));
      const peerRow=()=>find('[data-weekly-person="'+qid(actors.female)+'"]')?.closest('.dr-person-row');
      await click('male sends a request to this exact member',()=>peerRow()?.querySelector('.dr-row-request[data-add]'));
      id=await until('outgoing request persisted',async()=>(await state('male','marriage_inbox')).find(row=>row.person.id===actors.female&&row.status==='pending'&&row.direction==='outgoing')?.id);
      mark('female accepts male request in matches');
      mount('female','curated');
      await click('accept incoming request',()=>find('[data-request-row="'+qid(id)+'"] .mo-action-incoming'));
      await until('mutual acceptance',async()=>(await state('female','marriage_inbox')).some(r=>r.id===id&&r.status==='accepted'));
      mark('male sees unopened pact and cannot send');
      await chat('male');
      await until('unsigned pact waiting',()=>find('.cm-agreement[data-agreement-status=none]'));
      const draft=await until('unsigned pact composer',()=>find('textarea[aria-label="رسالتك"]'));
      inputValue(draft,'مسودة');check(find('button[aria-label="إرسال الرسالة"]')?.disabled,'Unsigned message submission enabled');inputValue(draft,'');
      mark('female signs and proposes duration');await signature('female');
      mark('male reviews duration and signs');await signature('male');
      mark('both exchange messages and receive read receipts');
      await send(message1);await chat('female');await read('female',message1);
      await send(message2);await chat('male');await read('male',message2);
      await until('male sees read receipt',()=>[...document.querySelectorAll('[data-server-id]')].find(el=>el.querySelector('.cm-bubble>p')?.textContent===message1 && el.querySelector('[data-receipt=read]')));
      await chat('female');
      await until('female sees read receipt',()=>[...document.querySelectorAll('[data-server-id]')].find(el=>el.querySelector('.cm-bubble>p')?.textContent===message2 && el.querySelector('[data-receipt=read]')));
      await request('/checkpoint',{requestId:id});
      mark('expiry is visible and male ends pact');await request('/expire',{requestId:id});await expiredDetails('male');
      await click('end expired pact',()=>label('إنهاء التعارف باحترام'));
      const reason=await until('signed pact reason',()=>find('.wd-close-reason input[value=pact]'));
      check(reason.checked,'Pact exit lost closure reason');
      await click('confirm ending',()=>label('تأكيد إنهاء التعارف'));
      for(const actor of ['male','female']){
        await until(actor+' can no longer access active chat',async()=>!(await state(actor,'marriage_inbox')).some(row=>row.id===id));
        const summary=await history(actor);
        check(summary.textContent.includes('أُنهي ميثاق التعارف'),actor+' saw wrong closure reason');
        check(!summary.closest('details').querySelector('a[href^="tel:"]'),actor+' saw unexpected family number');
      }
      mark('both members see the closed pact in history');
    } else {
      mark('restored signed pact, same actors and messages');await request('/reset',{});
      id=await until('restored accepted request',async()=>(await state('male','marriage_inbox')).find(row=>row.person.id===actors.female&&row.status==='accepted')?.id);
      check((await state('male','marriage_thread_page',id,null)).some(row=>row.body===message1),'Checkpoint did not preserve message');
      await request('/expire',{requestId:id});await expiredDetails('female');
      mark('female shares family contact, male reveals and hides it');
      await click('family contact share',()=>label('مشاركة رقم الأهل'));
      const field=await until('family contact input',()=>find('.wd-family-field input'));
      inputValue(field,responsePhone);
      await click('confirm family contact',()=>find('.wd-pact-decision button[type=submit]'));
      await until('handoff confirmation',()=>find('.wd-family-sent'));
      await chat('male');
      await until('reveal is offered',()=>label('عرض رقم الأهل'));
      check(!document.querySelector('a[href^="tel:"]'),'Family phone rendered before reveal');
      await click('explicit reveal',()=>label('عرض رقم الأهل'));
      await until('correct handoff number',()=>find('a[href="tel:+966550000007"]'));
      await click('hide contact',()=>label('إخفاء الرقم'));
      check(!find('a[href^="tel:"]'),'Revealed family number was not hidden');
      mark('two separate affirmative exclusivity decisions');await exclusive('male',false);await exclusive('female',true);
      mark('both members agree to discuss marriage');await stage('female',1,false);await stage('male',1,true);
      mark('both members agree to family contact');await stage('male',2,false);await stage('female',2,true);
      for(const actor of ['male','female']){await guide(actor);await until(actor+' sees final family stage',()=>find('.nf-journey-track [aria-current=step]')?.textContent.includes('التواصل مع الأهل'));}
      mark('family step persisted for both members');
    }
    trace.requestId=id;trace.status='passed';return {branch,requestId:id,steps:[...trace.steps]};
  }catch(e){trace.status='failed';trace.error=String(e.message||e);trace.requestId=id;throw e;}
}
