import currentTraits from '../src/compatibility/personality-catalog.json' with {type:'json'};
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createElement,createRef} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

let loader,PersonalityAnalysis,FitDetails,ScoreTile,comparePreferences,catalog;
before(async()=>{
 loader=await createServer({configFile:false,appType:'custom',logLevel:'error',plugins:[{name:'static-motion-for-copy-tests',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/motion/Reanimated.tsx'))return "import {createElement} from 'react';export const MotionReveal=({children,duration,distance,...props})=>createElement('div',props,children);";}}],optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false}});
 ({PersonalityAnalysis}=await loader.ssrLoadModule('/src/compatibility/PersonalityAnalysis.tsx'));
 ({FitDetails}=await loader.ssrLoadModule('/src/compatibility/FitDetails.tsx'));
 ({ScoreTile}=await loader.ssrLoadModule('/src/compatibility/ScoreTile.tsx'));
 ({comparePreferences}=await loader.ssrLoadModule('/src/compatibility/model.ts'));
 const {personalityQuestionsFor}=await loader.ssrLoadModule('/src/compatibility/personality.ts');
 catalog=personalityQuestionsFor('personality-v1');
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
 assert.match(html,/كيف نقرأ انسجام الشخصية/);assert.match(html,/تبقى إجابات كل طرف خاصة/);
 assert.doesNotMatch(html,/personalityAnswers|option_code|social_energy|value="[A-E]"/);
});

test('incomplete assessments never display evidence bars or calculated conclusions',()=>{
 const {a,b}=pair();delete b.personalityAnswers.planning;
 const html=render(comparePreferences(a,b).fit);
 assert.match(html,/تقييم الشخصية غير مكتمل/);assert.match(html,/تكمّل التقييم من «ملفي وتفضيلاتي» في الإعدادات/);
 assert.doesNotMatch(html,/role="meter"|نقطة تقارب|مجموع النقاط ÷ عدد العبارات/);
});

test('legacy and inconsistent evidence gracefully withhold unsupported breakdowns',()=>{
 const {fit}=pair();
 const legacy={...fit,personality:{...fit.personality}};
 delete legacy.personality.method;delete legacy.personality.domains;delete legacy.personality.distribution;
 const broken={...fit,personality:{...fit.personality,distribution:{same:12,near:0,different:0,far:0,opposite:0}}};
 const malformed={...legacy,personality:{...legacy.personality,similarities:{bad:true},differences:null}};
 for(const value of [legacy,malformed]){
  const html=render(value);assert.match(html,/تفاصيل المحاور غير متاحة/);assert.doesNotMatch(html,/role="meter"|نقطة تقارب|مجموع النقاط ÷ عدد العبارات/);
 }
 const invalid=render(broken);assert.match(invalid,/ما قدرنا نتحقق من تفاصيل النتيجة/);assert.doesNotMatch(invalid,/تقييم الشخصية غير مكتمل|role="meter"/);
});

test('the score exposes a direct accessible explanation control and retains separate preferences',()=>{
 const html=renderToStaticMarkup(createElement(FitDetails,{fit:pair().fit}));
 assert.match(html,/class="nf-personality-explain" aria-controls="[^"]+"/);assert.match(html,/لماذا هذه النسبة؟/);
 assert.match(html,/data-fit-score="preferences"/);assert.match(html,/data-fit-score="personality"/);
 assert.equal((html.match(/ما وراء انسجام الشخصية/g)||[]).length,1);
});

test('current pairs display both existing percentage tiles and mixed instruments keep practical fit', () => {
  const {a,b}=pair();
  const current = {...a,assessmentVersion:'marriage-v4',personalityVersion:'personality-v2'};
  const mixed = renderToStaticMarkup(createElement(FitDetails,{fit:comparePreferences(current,b).fit}));
  assert.match(mixed,/data-fit-score="preferences"/);
  assert.doesNotMatch(mixed,/data-fit-score="personality"/);

  const answers=Object.fromEntries(currentTraits.map(item=>[item.id,'C']));
  const peer={...b,assessmentVersion:'marriage-v4',personalityVersion:'personality-v2',personalityAnswers:answers};
  const fit=comparePreferences({...current,personalityAnswers:answers},peer).fit;
  const html=renderToStaticMarkup(createElement(FitDetails,{fit}));
  assert.match(html,/data-fit-score="personality"/);
  assert.match(html,/>100%<\/bdi>/);
  assert.match(html,/تشابه الإجابات الشخصية/);
  assert.equal((html.match(/role="meter"/g)||[]).length,5);
});

test('Explore and profile details render the actual practical percentage, including zero', () => {
 const base = {...pair().fit, assessmentComplete:true, provisional:false, covered:16, total:16};
 for (const percentage of [0, 81, 100]) {
  const tile = renderToStaticMarkup(createElement(ScoreTile,{percentage,variant:'logo'}));
  const label = new Intl.NumberFormat('ar-SA').format(percentage);
  assert.ok(tile.includes('>' + label + '٪</bdi>'));
  for (const version of ['marriage-v3','marriage-v4']) {
   const fit = {...base, version, percentage};
   const details = renderToStaticMarkup(createElement(FitDetails,{fit}));
   assert.ok(details.includes('>' + percentage + '%</bdi>'));
  }
 }
 const partial = renderToStaticMarkup(createElement(FitDetails,{fit:{...base, provisional:true, percentage:81}}));
 assert.doesNotMatch(partial,/>81%<\/bdi>/);
});
