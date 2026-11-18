import {api,node} from './event-api.js';
const $=id=>document.getElementById(id);
let polling=false,busy=false,anonymousKey=null;
function error(e){$('error').textContent=e.message||e;$('error').hidden=false;}
function clearError(){$('error').hidden=true;}
function showLogin(){anonymousKey=null;$('anonymous').replaceChildren();$('anonymous-count').textContent='';$('login').hidden=false;$('dashboard').hidden=true;}
function render(data){
 $('login').hidden=true;$('dashboard').hidden=false;
 $('event-title').textContent=data.event?.title||'THE CIRCLE';
 $('event-subtitle').textContent=data.event?.subtitle||'';
 const anonymous=Array.isArray(data.anonymous)?data.anonymous:[];
 $('anonymous-count').textContent=`${anonymous.length} مشاركة`;
 const key=JSON.stringify(anonymous);
 if(key!==anonymousKey){anonymousKey=key;$('anonymous').replaceChildren(...anonymous.map(x=>node('p',typeof x==='string'?x:x.text)));if(!anonymous.length)$('anonymous').append(node('p','ستظهر المشاركات هنا بدون أسماء.','empty'));}
}
async function refresh(){if(polling||document.hidden)return;polling=true;try{render(await api('hostState'));clearError();}catch(e){if(e.status===401||e.status===403)showLogin();else error(e);}finally{polling=false;}}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;const button=e.currentTarget.querySelector('button');button.disabled=true;clearError();try{await api('hostLogin',{code:$('host-code').value});$('host-code').value='';await refresh();}catch(e){error(e);}finally{busy=false;button.disabled=false;}});
$('logout').addEventListener('click',async()=>{if(busy)return;busy=true;try{await api('hostLogout');showLogin();}catch(e){error(e);}finally{busy=false;}});
const joinURL=new URL('./',location.href).href;$('join-link').href=joinURL;$('join-link').textContent=joinURL;
$('copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(joinURL);$('copy-link').textContent='تم النسخ';setTimeout(()=>$('copy-link').textContent='نسخ رابط المشاركة',2000);}catch{error('حدّد رابط المشاركة وانسخه يدويًا.');}});
setInterval(refresh,3000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('online',refresh);refresh();
