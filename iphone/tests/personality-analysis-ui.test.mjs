import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createElement,createRef} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

let loader,PersonalityAnalysis,FitDetails,comparePreferences,catalog;
before(async()=>{
 loader=await createServer({configFile:false,appType:'custom',logLevel:'error',plugins:[{name:'static-motion-for-copy-tests',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/motion/Reanimated.tsx'))return "import {createElement} from 'react';export const MotionReveal=({children,duration,distance,...props})=>createElement('div',props,children);";}}],optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false}});
 ({PersonalityAnalysis}=await loader.ssrLoadModule('/src/compatibility/PersonalityAnalysis.tsx'));
 ({FitDetails}=await loader.ssrLoadModule('/src/compatibility/FitDetails.tsx'));
 ({comparePreferences}=await loader.ssrLoadModule('/src/compatibility/model.ts'));
 ({personalityQuestions:catalog}=await loader.ssrLoadModule('/src/compatibility/personality.ts'));
});
after(()=>loader?.close());
function pair(){
 const answers=Object.fromEntries(catalog.map(item=>[item.id,'D']));
 const a={id:'a',gender:'woman',age:27,city:'الرياض',preferredMinAge:25,preferredMaxAge:40,personalityVersion:'personality-v1',personalityAnswers:answers};
 const b={...a,id:'b',gender:'man',age:31,personalityAnswers:{...answers,initiative:'E',openness:'B',planning:'A',novelty:'B',conflict_pace:'B',quiet_comfort:'C'}};
 return {a,b,fit:comparePreferences(a,b).fit};
}
const render=fit=>renderToStaticMarkup(createElement(PersonalityAnalysis,{fit,id:'personality-proof',panelRef:createRef()}));

test('complete evidence shows supported insights without exposing scoring arithmetic',()=>{
 const {fit}=pair(),html=render(fit);
 assert.equal((html.match(/role="meter"/g)||[]).length,4);
 assert.match(html,/٨ من ١٢ عبارة متقاربة/);
 assert.doesNotMatch(html,/٩٢٥|÷|نقاط كل عبارة|لكل عبارة الوزن نفسه/);
 assert.match(html,/نقطة تقارب/);assert.match(html,/مساحة لفهم أعمق/);
 assert.match(html,/كيف نقرأ انسجام الشخصية/);assert.match(html,/المرجع يوضح حدود التنبؤ/);
 assert.doesNotMatch(html,/personalityAnswers|option_code|social_energy|value="[A-E]"/);
});

test('incomplete assessments never display evidence bars or calculated conclusions',()=>{
 const {a,b}=pair();delete b.personalityAnswers.planning;
 const html=render(comparePreferences(a,b).fit);
 assert.match(html,/نحتاج صوتكما معًا/);assert.match(html,/لا نُكمل الإجابات الناقصة بالتخمين/);
 assert.doesNotMatch(html,/role="meter"|نقطة تقارب|مجموع النقاط ÷ عدد العبارات/);
});

test('legacy and inconsistent evidence gracefully withhold unsupported breakdowns',()=>{
 const {fit}=pair();
 const legacy={...fit,personality:{...fit.personality}};
 delete legacy.personality.method;delete legacy.personality.domains;delete legacy.personality.distribution;
 const broken={...fit,personality:{...fit.personality,distribution:{same:12,near:0,different:0,far:0,opposite:0}}};
 const malformed={...legacy,personality:{...legacy.personality,similarities:{bad:true},differences:null}};
 for(const value of [legacy,malformed]){
  const html=render(value);assert.match(html,/تفصيل الحساب والمحاور غير متاح/);assert.doesNotMatch(html,/role="meter"|نقطة تقارب|مجموع النقاط ÷ عدد العبارات/);
 }
 const invalid=render(broken);assert.match(invalid,/تعذّر التحقق من تفاصيل النتيجة/);assert.doesNotMatch(invalid,/نحتاج صوتكما معًا|role="meter"/);
});

test('the score exposes a direct accessible explanation control and retains separate preferences',()=>{
 const html=renderToStaticMarkup(createElement(FitDetails,{fit:pair().fit}));
 assert.match(html,/class="nf-personality-explain" aria-controls="[^"]+"/);assert.match(html,/لماذا هذه النسبة؟/);
 assert.match(html,/data-fit-score="preferences"/);assert.match(html,/data-fit-score="personality"/);
 assert.equal((html.match(/ما وراء انسجام الشخصية/g)||[]).length,1);
});
