import ts from 'typescript';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), root=path.join(app,'src'), cache=new Map();
function load(file){
 file=path.resolve(file);if(!path.extname(file))file+='.ts';
 if(cache.has(file))return cache.get(file);
 if(!file.startsWith(root+path.sep))throw Error('Outside source');
 if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
 const exports={};cache.set(file,exports);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require:id=>{if(id.endsWith('.css'))return{};if(id.includes('BrandIcons'))return new Proxy({},{get:()=>()=>null});if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id));return require(id)},Intl,URL,Date,Set,Map});return exports;
}
const result={catalog:load(root+'/compatibility/catalog.json'),personality:load(root+'/compatibility/personality-catalog.json'),marriage:load(root+'/compatibility/marriage.ts'),appearance:load(root+'/compatibility/appearance.ts'),profile:load(root+'/profile/profileOptions.ts'),beena:load(root+'/beena/model.ts'),readiness:load(root+'/readiness/model.ts'),help:load(root+'/help/guide.ts')};
const output=path.join(app,'native/Resources');fs.mkdirSync(output,{recursive:true});
result.memberCopy=load(root+'/member-ar.json');
result.interests=load(root+'/compatibility/model.ts').interests;
result.profileCapture=load(root+'/interview/profile-catalog.json');
fs.writeFileSync(path.join(output,'native-catalog.json'),JSON.stringify(result,null,2));
const {renderToStaticMarkup}=require('react-dom/server'), React=require('react');
const {LegalNotice}=load(root+'/legal/LegalNotice.tsx');
const html=renderToStaticMarkup(React.createElement(LegalNotice));
const text=html.replace(/<\/(h[1-6]|p|li|summary|header|section|div)>/g,'\n\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/\n{3,}/g,'\n\n');
fs.writeFileSync(path.join(output,'privacy-ar.txt'),text);
console.log('Generated native catalogs and legal text');
