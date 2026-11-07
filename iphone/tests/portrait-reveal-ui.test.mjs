import test, {after, before} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

let loader,ProfilePhotoChoice;
before(async()=>{
 loader=await createServer({configFile:false,appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false}});
 ({ProfilePhotoChoice}=await loader.ssrLoadModule('/src/onboarding/ProfilePhotoChoice.tsx'));
});
after(()=>loader?.close());
const noop=()=>{};
const base={onAvatar:noop,inferred:{style:'hijab',skinTone:'tone_4'},onChange:noop,consented:true,onConsent:noop,sensitiveAllowed:true,onSensitiveConsent:noop,onBusy:noop,onPolicyChange:noop};
const photo={id:'photo',path:'private/photo.jpg',blur:65};
const render=props=>renderToStaticMarkup(createElement(ProfilePhotoChoice,{...base,...props}));

test('legacy flattened photos keep blur by default and cannot opt in without selecting a source image',()=>{
 const html=render({existing:photo});
 assert.match(html,/<option value="never" selected="">/);
 for(const policy of ['matched','serious','family'])assert.match(html,new RegExp(`<option value="${policy}" disabled="">`));
 assert.match(html,/لا يمكن استعادة التفاصيل من النسخة المموّهة/);
 assert.doesNotMatch(html,/باختيار هذا الموعد، توافقين/);
});

test('a retained clear copy permits stage-only edits and explains who gets access and reversals',()=>{
 const html=render({existing:{...photo,hasClear:true,revealPolicy:'family'}});
 assert.match(html,/<option value="family" selected="">/);
 assert.doesNotMatch(html,/<option value="(?:matched|serious|family)" disabled/);
 assert.match(html,/نسخة واضحة خاصة/);assert.match(html,/يبقى التمويه ظاهرًا لبقية الأعضاء/);
 assert.match(html,/عند التراجع عن المرحلة أو إنهاء التعارف/);assert.match(html,/لا يمكن سحب صورة حفظها الطرف الآخر سابقًا/);
});

test('a clear public image disables automatic reveal and the parent draft choice survives remount',()=>{
 const clear=render({existing:{...photo,blur:0}});
 assert.match(clear,/<select id="portrait-reveal" disabled="">/);
 assert.match(clear,/صورتك واضحة بالفعل/);
 const edited=render({existing:{...photo,hasClear:true,revealPolicy:'matched'},revealPolicy:'serious'});
 assert.match(edited,/<option value="serious" selected="">/);
 assert.doesNotMatch(edited,/<option value="matched" selected/);
});
