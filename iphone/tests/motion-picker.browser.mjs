import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const {chromium} = createRequire(import.meta.url)(process.env.NISFAYN_PLAYWRIGHT_MODULE ||
  'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {SheetChoiceSelect} from '/src/ui/SheetChoiceSelect.tsx';
import '/src/motion.css';
function Picker(){
  const [value,onChange]=React.useState('');
  return React.createElement(SheetChoiceSelect,{label:'المدينة',value,onChange,
    options:[{value:'riyadh',label:'الرياض'},{value:'jeddah',label:'جدة'}]});
}
createRoot(document.getElementById('root')).render(React.createElement(Picker));`;
const server = await createServer({mode:'demo',cacheDir:resolve('node_modules/.vite-motion-picker'),
  optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react']},
  server:{host:'127.0.0.1',port:5347,strictPort:true,hmr:false,watch:null},
  plugins:[{name:'picker-qa',configureServer(dev){
    dev.middlewares.use(async(req,res,next)=>{
      if(req.url!=='/picker')return next();
      res.setHeader('Content-Type','text/html');
      res.end(await dev.transformIndexHtml('/picker','<!doctype html><html dir="rtl" lang="ar"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="phone-app" id="root"></div><script type="module" src="/@id/__x00__picker"></script></body></html>'));
    });},resolveId(id){if(id==='virtual:picker')return '\0picker';},load(id){if(id==='\0picker')return fixture;}}]});
await server.listen();
let browser;
try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const [width,height,reduced] of [[375,667,false],[390,844,false],[430,932,true]]){
    const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:5347/picker');
    const row=page.locator('.nf-sheet-choice-row');
    await row.click();
    const search=page.getByRole('combobox');
    await search.fill('جد');
    await page.evaluate(()=>{window.returnCues=0;document.addEventListener('animationstart',e=>{if(e.animationName==='nf-picked-value')window.returnCues++;});});
    await search.press('Enter');
    assert.match(await row.innerText(),/جدة/);
    assert(await row.evaluate(el=>el===document.activeElement));
    if(!reduced)await page.waitForFunction(()=>window.returnCues===1);
    await row.click();
    await page.keyboard.press('Escape');
    assert(await row.evaluate(el=>el===document.activeElement));
    assert.equal(await page.evaluate(()=>window.returnCues),reduced?0:1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.close();
  }
  console.log('PASS picker selection, search, Escape, focus return, one committed-value cue and Reduced Motion at three widths');
} finally {await browser?.close();await server.close();}
