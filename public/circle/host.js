import {api,node,clock} from './event-api.js';
const $=id=>document.getElementById(id);
let state=null, polling=false, busy=false, resetId=null, rosterKey='', anonymousKey='';
function error(e){$('error').textContent=e.message||e;$('error').hidden=false;}
function clearError(){$('error').hidden=true;}
function showCode(name,code){$('code-name').textContent=name;$('issued-code').textContent=code;$('code-result').hidden=false;$('code-result').scrollIntoView({behavior:'smooth',block:'nearest'});}
async function act(action,data={}){if(busy)return;busy=true;clearError();try{const result=await api(action,data);await refresh();return result;}catch(e){error(e);}finally{busy=false;}}
function render(s){state=s;$('login').hidden=true;$('dashboard').hidden=false;$('event-title').textContent=s.event.title;$('event-subtitle').textContent=s.event.subtitle;
 if(!$('slides').options.length){for(const slide of s.slides){const option=node('option',`${slide.page} · ${slide.label||slide.title}`);option.value=slide.id;$('slides').append(option);}}
 $('slides').value=s.event.currentSlide;$('current-question').textContent=s.slide?.title||'';
 const participants=s.participants||[],votes=s.votes||[],active=participants.filter(p=>p.active!==false);
 const activeIds=new Set(active.map(p=>p.id));const currentVotes=votes.filter(v=>(v.slideId===s.event.currentSlide||v.slide_id===s.event.currentSlide)&&activeIds.has(v.participantId||v.participant_id));
 $('vote-count').textContent=`${currentVotes.length} صوت / ${active.length} مشارك`;$('participant-count').textContent=active.length;
 const votable=s.slide?.kind==='scenario'&&s.slide?.responseMode==='vote';
 for(const id of ['toggle-voting','toggle-reveal','restart','add-time'])$(id).disabled=!votable;
 $('toggle-voting').textContent=s.event.votingOpen?'إغلاق التصويت':'فتح التصويت';$('toggle-reveal').textContent=s.event.revealed?'إخفاء الأسماء':'إظهار الأسماء';
 const key=JSON.stringify(participants);if(key!==rosterKey){rosterKey=key;$('participants').replaceChildren();for(const p of participants){const row=node('div',undefined,'participant'+(p.active===false?' removed':''));const title=node('span',p.name,'participant-name');if(p.active===false)title.append(node('small',' · محذوف'));const actions=node('div',undefined,'participant-actions');const reset=node('button','رمز جديد');reset.addEventListener('click',()=>{resetId=p.id;$('reset-name').textContent=p.name;$('reset-code').value='';$('reset-dialog').showModal();});const remove=node('button',p.active===false?'استعادة':'إزالة');remove.addEventListener('click',()=>{if(p.active===false||confirm(`إزالة ${p.name} من المشاركين؟ تبقى إجاباته محفوظة في التقرير.`))act(p.active===false?'hostRestore':'hostRemove',{participantId:p.id});});actions.append(reset,remove);row.append(title,actions);$('participants').append(row);}if(!participants.length)$('participants').append(node('p','بانتظار أول المشاركين.','empty'));}
 const anonymous=s.anonymous||[];$('anonymous-count').textContent=anonymous.length;const akey=JSON.stringify(anonymous);if(akey!==anonymousKey){anonymousKey=akey;$('anonymous').replaceChildren(...anonymous.map(x=>node('p',x.text)));if(!anonymous.length)$('anonymous').append(node('p','ستظهر المشاركات هنا بدون أسماء.','empty'));}}
async function refresh(){if(polling||document.hidden)return;polling=true;try{render(await api('hostState'));clearError();}catch(e){if(e.status===401){state=null;$('login').hidden=false;$('dashboard').hidden=true;}else error(e);}finally{polling=false;}}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const code=$('host-code').value;const result=await act('hostLogin',{code});if(result)$('host-code').value='';});
$('add-form').addEventListener('submit',async e=>{e.preventDefault();const name=$('new-name').value.trim();const code=$('new-code').value.trim();const result=await act('hostAdd',{name,...(code?{code}:{})});if(result){showCode(result.participant?.name||name,result.loginCode);$('add-form').reset();}});
$('reset-form').addEventListener('submit',async e=>{e.preventDefault();const code=$('reset-code').value.trim();const result=await act('hostResetCode',{participantId:resetId,...(code?{code}:{})});if(result){$('reset-dialog').close();showCode(result.participant?.name||$('reset-name').textContent,result.loginCode);}});
$('cancel-reset').addEventListener('click',()=>$('reset-dialog').close());
$('copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('issued-code').textContent);$('copy-code').textContent='تم النسخ';setTimeout(()=>$('copy-code').textContent='نسخ الرمز',2000);}catch{error('حدّد الرمز وانسخه يدويًا.');}});
$('slides').addEventListener('change',()=>act('hostSlide',{slideId:$('slides').value}));
for(const [id,delta] of [['prev',-1],['next',1]])$(id).addEventListener('click',()=>{if(!state)return;const index=state.slides.findIndex(s=>s.id===state.event.currentSlide);const next=state.slides[index+delta];if(next)act('hostSlide',{slideId:next.id});});
$('toggle-voting').addEventListener('click',()=>{const open=!state.event.votingOpen;act('hostControl',{votingOpen:open,...(open?{endsAt:new Date(Date.now()+180000).toISOString()}: {})});});
$('toggle-reveal').addEventListener('click',()=>act('hostControl',{revealed:!state.event.revealed}));
$('restart').addEventListener('click',()=>act('hostControl',{votingOpen:true,endsAt:new Date(Date.now()+180000).toISOString()}));
$('add-time').addEventListener('click',()=>act('hostControl',{votingOpen:true,endsAt:new Date(Math.max(Date.now(),new Date(state.event.endsAt).getTime()||0)+30000).toISOString()}));
$('logout').addEventListener('click',async()=>{await act('hostLogout');location.reload();});
setInterval(refresh,2500);setInterval(()=>{if(state)$('timer').textContent=clock(state.event.endsAt);},250);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('online',refresh);refresh();
