// Opt-in generation of one publishable example from two fictional catalog profiles.
import OpenAI from 'openai';
import {writeFile} from 'node:fs/promises';
import {analysisRequest,validateReport,DEEP_MODEL} from '../api/_lib/deep-compatibility.mjs';
import {demoEvidence} from '../api/_lib/demo-deep-evidence.mjs';

const snapshot={a:demoEvidence('wp01'),b:demoEvidence('p01')};
const client=new OpenAI({maxRetries:0,timeout:120000});
const completion=await client.chat.completions.create(analysisRequest(snapshot));
const {findings}=validateReport(completion,snapshot);
await writeFile(new URL('../src/community/deepExample.json',import.meta.url),JSON.stringify({
 model:DEEP_MODEL,first:'wp01',second:'p01',findings:findings.map(({evidence,...item})=>item),
},null,2)+'\n');
console.log('Validated fictional Sol report:',findings.length,'findings');
