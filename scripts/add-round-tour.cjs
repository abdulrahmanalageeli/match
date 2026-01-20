#!/usr/bin/env node
/*
  Adds an interactive guided tour to app/routes/welcome.tsx for Round mode (step 4):
  - Inserts tour state, steps, positioning handlers
  - Adds a Help button in the round container
  - Adds data-tour anchors to key elements
  - Injects a guided overlay before the feedback section
  Safe to run multiple times (checks for markers).
*/
const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'app', 'routes', 'welcome.tsx');
if (!fs.existsSync(filePath)) {
  console.error('welcome.tsx not found at: ' + filePath);
  process.exit(1);
}

let src = fs.readFileSync(filePath, 'utf8');
let changed = false;

function insertAfter(anchor, insertion) {
  const idx = src.indexOf(anchor);
  if (idx === -1) return false;
  const pos = idx + anchor.length;
  src = src.slice(0, pos) + insertion + src.slice(pos);
  return true;
}

function insertBefore(anchor, insertion) {
  const idx = src.indexOf(anchor);
  if (idx === -1) return false;
  src = src.slice(0, idx) + insertion + src.slice(idx);
  return true;
}

function replaceOnce(find, replace) {
  if (src.includes(replace)) return false;
  const next = src.replace(find, replace);
  if (next !== src) {
    src = next;
    return true;
  }
  return false;
}

// 1) Insert tour state after showRound1Guide state
if (!src.includes('const [showRoundTour')) {
  const guideStateAnchor = 'const [showRound1Guide, setShowRound1Guide] = useState(false);';
  const stateBlock = '\n  \n  // Interactive guide (tour) for Round mode\n' +
    '  const [showRoundTour, setShowRoundTour] = useState(false);\n' +
    '  const [roundTourStep, setRoundTourStep] = useState(0);\n' +
    '  const [tourRect, setTourRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);\n' +
    '  const [tourCalloutPos, setTourCalloutPos] = useState<{ top: number; left: number } | null>(null);\n';
  if (insertAfter(guideStateAnchor, stateBlock)) {
    changed = true;
    console.log('✔ Inserted tour state');
  } else {
    console.warn('✖ Could not find anchor to insert tour state');
  }
}

// 2) Insert steps/positioning block before survey recovery section
if (!src.includes('// --- Round Tour: steps and positioning')) {
  const surveyAnchor = '\n  // Check if user needs SURVEY RECOVERY';
  const tourBlock = '\n  // --- Round Tour: steps and positioning (selector-based) ---\n' +
    '  const roundTourSteps = useMemo(() => [\n' +
    '    { key: \'partner\', title: \'شريكك\', desc: \'هنا يظهر رقم شريكك في هذه الجولة.\', selector: "[data-tour=\"partner\"]" },\n' +
    '    { key: \'table\', title: \'رقم الطاولة\', desc: \'توجه إلى هذه الطاولة لتبدأ الحوار مع شريكك.\', selector: "[data-tour=\"table\"]" },\n' +
    '    { key: \'tabs\', title: \'مجموعات الأسئلة\', desc: \'٣ مجموعات متنوعة من الأسئلة. يمكنك التبديل بينها بحرية.\', selector: "[data-tour=\"tabs\"]" },\n' +
    '    { key: \'level\', title: \'مستوى السؤال\', desc: \'اللون والأيقونة يوضحان عمق السؤال ونوعه.\', selector: "[data-tour=\"level\"]" },\n' +
    '    { key: \'question\', title: \'السؤال الحالي\', desc: \'اقرأ السؤال هنا وابدأ حواراً ممتعاً.\', selector: "[data-tour=\"question\"]" },\n' +
    '    { key: \'nav\', title: \'التنقل بين الأسئلة\', desc: \'استخدم السابق/التالي للتنقل بسهولة.\', selector: "[data-tour=\"nav\"]" },\n' +
    '    { key: \'progress\', title: \'شريط التقدم\', desc: \'يوضح عدد الأسئلة المتبقية.\', selector: "[data-tour=\"progress\"]" },\n' +
    '    { key: \'discuss\', title: \'أسئلة للنقاش\', desc: \'مواضيع جاهزة لتوسيع الحوار عند الحاجة.\', selector: "[data-tour=\"discuss\"]" },\n' +
    '  ], []);\n\n' +
    '  const updateTourPosition = () => {\n' +
    '    if (typeof window === \'undefined\') return;\n' +
    '    const stepObj = roundTourSteps[roundTourStep];\n' +
    '    if (!stepObj) return;\n' +
    '    const el = document.querySelector(stepObj.selector) as HTMLElement | null;\n' +
    '    if (!el) {\n' +
    '      for (let i = 1; i < roundTourSteps.length; i++) {\n' +
    '        const idx = (roundTourStep + i) % roundTourSteps.length;\n' +
    '        const cand = document.querySelector(roundTourSteps[idx].selector) as HTMLElement | null;\n' +
    '        if (cand) { setRoundTourStep(idx); break; }\n' +
    '      }\n' +
    '      return;\n' +
    '    }\n' +
    '    const rect = el.getBoundingClientRect();\n' +
    '    setTourRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });\n' +
    '    const calloutWidth = 320;\n' +
    '    const desiredTop = rect.top + rect.height + 12;\n' +
    '    const altTop = Math.max(12, rect.top - 12 - 160);\n' +
    '    const calloutTop = desiredTop + 160 < window.innerHeight ? desiredTop : altTop;\n' +
    '    const maxLeft = window.innerWidth - calloutWidth - 12;\n' +
    '    const calloutLeft = Math.min(rect.left, maxLeft);\n' +
    '    setTourCalloutPos({ top: calloutTop, left: calloutLeft });\n' +
    '  };\n\n' +
    '  useEffect(() => {\n' +
    '    if (!showRoundTour) return;\n' +
    '    updateTourPosition();\n' +
    '    const onResize = () => updateTourPosition();\n' +
    '    const onScroll = () => updateTourPosition();\n' +
    '    window.addEventListener(\'resize\', onResize);\n' +
    '    window.addEventListener(\'scroll\', onScroll, { passive: true } as any);\n' +
    '    return () => {\n' +
    '      window.removeEventListener(\'resize\', onResize);\n' +
    '      window.removeEventListener(\'scroll\', onScroll as any);\n' +
    '    };\n' +
    '  }, [showRoundTour, roundTourStep, currentQuestionIndex, activeQuestionSet, dark]);\n\n' +
    '  useEffect(() => {\n' +
    '    if (!showRoundTour) return;\n' +
    '    const onKey = (e: KeyboardEvent) => {\n' +
    '      if (e.key === \'Escape\') setShowRoundTour(false);\n' +
    '      if (e.key === \'ArrowRight\') setRoundTourStep((s) => Math.min(s + 1, roundTourSteps.length - 1));\n' +
    '      if (e.key === \'ArrowLeft\') setRoundTourStep((s) => Math.max(s - 1, 0));\n' +
    '    };\n' +
    '    window.addEventListener(\'keydown\', onKey);\n' +
    '    return () => window.removeEventListener(\'keydown\', onKey);\n' +
    '  }, [showRoundTour, roundTourSteps.length]);\n\n';
  const done = insertBefore(surveyAnchor, tourBlock);
  if (done) { changed = true; console.log('✔ Inserted tour steps/handlers'); }
  else console.warn('✖ Could not find anchor to insert tour steps/handlers');
}

// 2b) Repair invalid selector quotes if present
{
  let before = src;
  src = src
    .replace(/selector:\s*"\[data-tour="partner"\]"/g, 'selector: \'[data-tour="partner"]\'')
    .replace(/selector:\s*"\[data-tour="table"\]"/g, 'selector: \'[data-tour="table"]\'')
    .replace(/selector:\s*"\[data-tour="tabs"\]"/g, 'selector: \'[data-tour="tabs"]\'')
    .replace(/selector:\s*"\[data-tour="level"\]"/g, 'selector: \'[data-tour="level"]\'')
    .replace(/selector:\s*"\[data-tour="question"\]"/g, 'selector: \'[data-tour="question"]\'')
    .replace(/selector:\s*"\[data-tour="nav"\]"/g, 'selector: \'[data-tour="nav"]\'')
    .replace(/selector:\s*"\[data-tour="progress"\]"/g, 'selector: \'[data-tour="progress"]\'')
    .replace(/selector:\s*"\[data-tour="discuss"\]"/g, 'selector: \'[data-tour="discuss"]\'');
  if (src !== before) { changed = true; console.log('✔ Repaired selector quote styles'); }
}

// 2c) Normalize z-index class for overlay to satisfy Tailwind v4 lint
{
  const before = src;
  src = src.replace(/z-\[9999\]/g, 'z-9999');
  if (src !== before) { changed = true; console.log('✔ Normalized z-index class'); }
}

// 3) Help/Tour button before Player Avatar anchor (safe insertion point within container)
if (!src.includes('aria-label="دليل سريع"')) {
  const helpAnchor = '\n              {/* Player Avatar - Right corner (original position) */}';
  const button = '\n              {/* Help/Tour button */}\n' +
    '              <button onClick={() => { setShowRoundTour(true); setRoundTourStep(0); setTimeout(() => updateTourPosition(), 0); }} className={`absolute -top-3 -left-3 z-10 w-10 h-10 rounded-full border-2 shadow-lg transition-all hover:scale-110 ${dark ? "bg-slate-700 border-slate-500 hover:bg-slate-600" : "bg-white border-gray-300 hover:bg-gray-50"}`} title="دليل سريع" aria-label="دليل سريع">\n' +
    '                <HelpCircle className={`w-5 h-5 mx-auto ${dark ? "text-slate-300" : "text-gray-600"}`} />\n' +
    '              </button>\n';
  if (insertBefore(helpAnchor, button)) {
    changed = true;
    console.log('✔ Inserted Help/Tour button');
  } else {
    console.warn('✖ Could not locate Player Avatar anchor to insert Help/Tour button');
  }
}

// 4) data-tour anchors
// Partner Info
{
  const re = /(\{\/\* Partner Info \*\/\}\s*\n\s*<div\s+)(className="flex flex-col items-center gap-2 flex-1")/g;
  const prev = src;
  src = src.replace(re, '$1data-tour="partner" $2');
  if (src !== prev) { changed = true; console.log('✔ Added data-tour="partner"'); }
}
// Table Info
{
  const re = /(\{\/\* Table Info \*\/\}\s*\n\s*<div\s+)(className="flex flex-col items-center gap-2 flex-1")/g;
  const prev = src;
  src = src.replace(re, '$1data-tour="table" $2');
  if (src !== prev) { changed = true; console.log('✔ Added data-tour="table"'); }
}
// Discussion button (via aria-label)
{
  const re = /(<button)([^>]*?aria-label="فتح أسئلة النقاش"[^>]*>)/g;
  const prev = src;
  src = src.replace(re, '$1 data-tour="discuss"$2');
  if (src !== prev) { changed = true; console.log('✔ Added data-tour="discuss"'); }
}
// Tabs container
{
  const re = /(<div\s+)(className=\{`inline-flex items-center p-1 rounded-full border )/g;
  const prev = src;
  src = src.replace(re, '$1data-tour="tabs" $2');
  if (src !== prev) { changed = true; console.log('✔ Added data-tour="tabs"'); }
}
// Level header
{
  const re = /(<div\s+)(className="text-center mb-6")/g;
  const prev = src;
  src = src.replace(re, '$1data-tour="level" $2');
  if (src !== prev) { changed = true; console.log('✔ Added data-tour="level"'); }
}
// Question card (relative p-6 rounded-xl border)
{
  const re = /(<div\s+)(className=\{`relative p-6 rounded-xl border )/g;
  const prev = src;
  src = src.replace(re, '$1data-tour="question" $2');
  if (src !== prev) { changed = true; console.log('✔ Added data-tour="question"'); }
}
// Navigation controls variants
{
  let prev = src;
  src = src.replace(/(<div\s+)(className="flex items-center justify-between mt-6")/g, '$1data-tour="nav" $2');
  src = src.replace(/(<div\s+)(className="flex justify-between items-center mt-6")/g, '$1data-tour="nav" $2');
  if (src !== prev) { changed = true; console.log('✔ Added data-tour="nav"'); }
}
// Progress using comments anchors
{
  let prev = src;
  src = src.replace(/(\{\/\* Progress Bar \*\/\}[\s\S]*?\n\s*<div\s+)(className="mt-4")/g, '$1data-tour="progress" $2');
  src = src.replace(/(\{\/\* Progress indicator \*\/\}[\s\S]*?\n\s*<div\s+)(className="mt-4")/g, '$1data-tour="progress" $2');
  if (src !== prev) { changed = true; console.log('✔ Added data-tour="progress"'); }
}

// 5) Guided Tour Overlay before step === 5 block
if (!src.includes('{step === 4 && showRoundTour')) {
  const anchor = '{step === 5 && (';
  const overlay = '        {/* Guided Tour Overlay */}\n' +
    '        {step === 4 && showRoundTour && (\n' +
    '          <div className="fixed inset-0 z-[9999]">\n' +
    '            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRoundTour(false)} />\n' +
    '            {tourRect && (\n' +
    '              <div className="absolute rounded-xl border-2 border-cyan-400" style={{ top: tourRect.top, left: tourRect.left, width: tourRect.width, height: tourRect.height, boxShadow: "0 0 0 4px rgba(34,211,238,0.35), 0 10px 25px rgba(0,0,0,0.35)", pointerEvents: "none" }} />\n' +
    '            )}\n' +
    '            {tourCalloutPos && (\n' +
    '              <div className={`absolute max-w-[320px] p-4 rounded-xl shadow-xl border ${dark ? "bg-slate-800 border-slate-600 text-slate-100" : "bg-white border-gray-200 text-gray-800"}`} style={{ top: tourCalloutPos.top, left: tourCalloutPos.left }}>\n' +
    '                <div className="flex items-start gap-2">\n' +
    '                  <Info className="w-5 h-5 text-cyan-500 mt-0.5" />\n' +
    '                  <div>\n' +
    '                    <h4 className="font-bold mb-1">{roundTourSteps[roundTourStep]?.title}</h4>\n' +
    '                    <p className="text-sm opacity-90">{roundTourSteps[roundTourStep]?.desc}</p>\n' +
    '                  </div>\n' +
    '                </div>\n' +
    '                <div className="flex items-center justify-between mt-3">\n' +
    '                  <button onClick={() => setShowRoundTour(false)} className={`${dark ? "bg-slate-700 hover:bg-slate-600" : "bg-gray-100 hover:bg-gray-200"} px-3 py-1.5 rounded-lg text-sm font-medium`}>\n' +
    '                    تخطي\n' +
    '                  </button>\n' +
    '                  <div className="flex items-center gap-2">\n' +
    '                    <button disabled={roundTourStep === 0} onClick={() => { setRoundTourStep(s => Math.max(0, s - 1)); setTimeout(() => updateTourPosition(), 0); }} className={`${dark ? "bg-slate-700 hover:bg-slate-600" : "bg-gray-100 hover:bg-gray-200"} px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50`}>\n' +
    '                      السابق\n' +
    '                    </button>\n' +
    '                    <button onClick={() => { if (roundTourStep >= roundTourSteps.length - 1) { setShowRoundTour(false); } else { setRoundTourStep(s => Math.min(s + 1, roundTourSteps.length - 1)); setTimeout(() => updateTourPosition(), 0); } }} className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800">\n' +
    '                      {roundTourStep >= roundTourSteps.length - 1 ? "إنهاء" : "التالي"}\n' +
    '                    </button>\n' +
    '                  </div>\n' +
    '                </div>\n' +
    '                <div className="text-[11px] mt-2 opacity-70 text-right">{roundTourStep + 1} / {roundTourSteps.length}</div>\n' +
    '              </div>\n' +
    '            )}\n' +
    '          </div>\n' +
    '        )}\n\n';
  const done = replaceOnce(anchor, overlay + '        ' + anchor);
  if (done) { changed = true; console.log('✔ Inserted guided overlay'); }
  else console.warn('✖ Could not inject overlay before step === 5 block');
}

if (!changed) {
  console.log('No changes were applied (file may already be updated).');
} else {
  const backup = filePath + '.bak.' + Date.now();
  fs.writeFileSync(backup, src);
  fs.writeFileSync(filePath, src);
  console.log('✅ Guided tour applied. Backup saved at: ' + backup);
}
