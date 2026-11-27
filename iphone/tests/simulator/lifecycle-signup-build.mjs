import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {initialInterviewDocument, confirmProfileChoices} from '../../api/_lib/interview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const input = resolve(here,'lifecycle-signup.html');
const outDir = resolve(root,process.argv[2] || '.tmp/simulator-signup');
const previous = await readFile(resolve(root,'tests/registration-matching.browser.mjs'),'utf8');
const match = name => {
  const start = 'const '+name+' = '+String.fromCharCode(96);
  const i = previous.indexOf(start), end = previous.indexOf(String.fromCharCode(96)+';',i+start.length);
  if(i<0 || end<0) throw Error('Missing browser fixture '+name);
  return previous.slice(i+start.length,end);
};
const cloud = match('cloud');
const portrait = match('portrait');
const transportStart = previous.indexOf('const opening = ');
const transportEnd = previous.indexOf('async function register(',transportStart);
if (transportStart<0 || transportEnd<0) throw Error('Missing interview fixture');
const transport = previous.slice(transportStart,transportEnd);
const openingDoc = initialInterviewDocument(true);
// The server validator evaluates the same three synthetic facts as the pinned browser control.
// Precompute every validated proposal variant so the native fixture does not need Node server modules.
const facts=[];
const proofDoc={...openingDoc,turns:[], profileProposals:[]};
const testTransport=new Function('initialInterviewDocument','confirmProfileChoices','assert',transport+';return {opening,profileFacts};')(()=>openingDoc,confirmProfileChoices,{});
for(const item of testTransport.profileFacts) {
  const proposal={id:'profile:'+item.fieldId,fieldId:item.fieldId,values:[item.value],mode:null,exclude:false,summary:item.quote,evidence:[{turnId:'opening',quote:item.quote}],needsClarification:false};
  const doc={...proofDoc,profileProposals:[proposal]};
  facts.push(confirmProfileChoices(doc,[proposal]).profileConfirmed[0]);
}
const moduleCode = [
  'const assert={equal:(a,b)=>{if(a!==b)throw Error("interview introduction mismatch")}};',
  'const initialInterviewDocument=()=>('+JSON.stringify(openingDoc)+');',
  'const expected='+JSON.stringify(facts)+';',
  'function confirmProfileChoices(doc,choices){return {...doc,profileConfirmed:choices.map(c=>{const p=expected.find(v=>v.id===c.id); if(!p||JSON.stringify(p.values)!==JSON.stringify(c.values))throw Error("unrecognized choice");return p})}}',
  transport,
  'export {interviewTransport,opening};'
].join('\n');
const mountFile='/tests/registration-matching-fixture.tsx';
const mountSource=await readFile(resolve(root,mountFile.slice(1)),'utf8');
const mountAt=mountSource.indexOf("createRoot(document.getElementById('root')!).render(");
if(mountAt<0) throw Error('Registration fixture mount changed');
const element=mountSource.slice(mountAt).replace(/^createRoot\(document.getElementById\('root'\)!\)\.render\(/,'').trim().replace(/\);$/,'');
const reactMount=mountSource.slice(0,mountAt)+'let lifecycleRoot: ReturnType<typeof createRoot> | undefined; export function remount(){lifecycleRoot?.unmount();lifecycleRoot=createRoot(document.getElementById("root")!);lifecycleRoot.render('+element+');}\n';

await build({
  root,configFile:resolve(root,'vite.config.ts'),configLoader:'runner',publicDir:false,
  plugins:[{name:'isolated-ios-signup',enforce:'pre',
    resolveId(id){if(id==='virtual:lifecycle-interview')return '\0'+id;},
    load(id) {
      const path=id.replaceAll('\\','/');
      if(id==='\0virtual:lifecycle-interview')return moduleCode;
      if(path.endsWith(mountFile))return reactMount;
      if(path.endsWith('/src/cloud.ts'))return {code:cloud+'\nexport default {};',syntheticNamedExports:true};
      if(path.endsWith('/src/photos/stagedPortrait.ts'))return portrait;
    }
  }],
  build:{outDir,emptyOutDir:false,copyPublicDir:false,reportCompressedSize:false,minify:false,rollupOptions:{input}}
});
