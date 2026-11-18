// Explicit manual QA only. Uses real Luna with fictional answers and memory-only persistence.
// Run with the existing project's OPENAI_API_KEY injected into this process (never printed/saved).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterviewService, CONSENT_VERSION, INTERVIEW_MODEL } from '../api/_lib/interview.mjs';

const directory=resolve('.tmp/full-interview-review');
const remote=process.argv.includes('--remote')?JSON.parse(await readFile(resolve(directory,'access.json'),'utf8')):null;
if (!process.env.OPENAI_API_KEY&&!remote) throw Error('The existing project model credential is unavailable.');
await mkdir(directory,{recursive:true});
const previous=process.argv.includes('--resume')?JSON.parse(await readFile(resolve(directory,'luna-session.json'),'utf8')):null;
let state=previous?.finalSnapshot??{document:null,revision:0},revision=state.revision;
const service=remote?async(input)=>{
 const payload=resolve(directory,'request.json');await writeFile(payload,JSON.stringify({snapshot:state,input}));
 const args=[process.env.WUDAYN_VERCEL_CLI,'curl','/api/review','--deployment',remote.url,'--scope','team_A9No1ttTsWExk5NqWNwDWq96','--','--silent','--show-error','--fail-with-body','--request','POST','--header','Content-Type: application/json','--header','x-review-access: '+remote.token,'--data-binary','@'+payload];
 if(!args[0])throw Error('WUDAYN_VERCEL_CLI is required for protected QA.');
 const response=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let out='',error='';child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>error+=data);child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(Error('Protected QA request failed; CLI exit '+code)));});
 state=JSON.parse(response);return state;
}:createInterviewService({fetcher:async(_url,init)=>{
  const {command,payload}=JSON.parse(init.body);
  if(['save','reserve'].includes(command)&&payload.expectedRevision!==state.revision)return Response.json({code:'40001'},{status:409});
  if(command==='start'&&!state.document)state={document:structuredClone(payload.document),revision:++revision};
  if(command==='save')state={document:structuredClone(payload.document),revision:++revision};
  if(command==='delete')throw Error('Deletion is not part of this QA run.');
  if(command==='reserve')return Response.json({status:'allowed',revision:state.revision});
  return Response.json(state);
}});
const headers={authorization:'Bearer fictional.qa.session'};
const initialSnapshot=previous?.initialSnapshot??await service({action:'start',consentVersion:CONSENT_VERSION},headers);
const artifact=previous??{synthetic:true,source:'real-luna',modelExecution:'real-provider',model:INTERVIEW_MODEL,initialSnapshot,steps:[],finalSnapshot:initialSnapshot};
artifact.source='real-luna';artifact.modelExecution='real-provider';
const save=()=>writeFile(resolve(directory,'luna-session.json'),JSON.stringify(artifact,null,2));
await save();
console.log(JSON.stringify({ready:true,question:state.document.currentQuestion}));
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of input){
  if(!line.trim())continue;
  try{
    const command=JSON.parse(line);
    if(command.done){input.close();break;}
    const question=state.document.currentQuestion;
    const start=performance.now();
    const action=command.review?'review':command.retry?'retry':'answer';
    const snapshot=await service({action,revision:state.revision,...(action==='answer'?{requestId:randomUUID(),answer:command.answer,skip:command.skip===true}:{})},headers);
    const latencyMs=Math.round(performance.now()-start);
    artifact.steps.push({action,question,answer:command.answer??null,snapshot,latencyMs});artifact.finalSnapshot=snapshot;await save();
    console.log(JSON.stringify({turn:snapshot.document.turns.length,latencyMs,status:snapshot.document.status,pendingAnalysis:snapshot.document.pendingAnalysis,mode:snapshot.document.lastMode,question:snapshot.document.currentQuestion,proposals:snapshot.document.proposals.length,personality:snapshot.document.proposals.filter(p=>p.kind==='personality').map(p=>({field:p.fieldId,value:p.values[0],unclear:p.needsClarification}))}));
  }catch(error){console.log(JSON.stringify({error:error?.code??'qa_failed',message:error?.name??'Error'}));}
}
