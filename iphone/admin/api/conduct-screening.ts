import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

type Finding = {finding:'direct_disclosure_threat'|'direct_personal_threat';reportedCategoryAgrees:boolean};
type Decision = 'review'|'hold';
type Config = { endpoint:string; model:string; key:string; project:string; serviceKey:string };
const policy = 'You assist a human safety team. Evaluate only two categorical indicators from a reporter-authorized local exact match for an explicit first-person threat. Use review for missing, conflicting or ambiguous evidence. Hold is permitted only when the indicated direct threat and the reporting category agree and a short pause on new requests pending human review is warranted. Never decide a permanent ban.';
function finding(value:unknown): value is Finding {
  if (!value || typeof value!=='object' || Array.isArray(value)) return false;
  const row=value as Record<string,unknown>;
  return Object.keys(row).length===2 && ['direct_disclosure_threat','direct_personal_threat'].includes(String(row.finding)) && typeof row.reportedCategoryAgrees==='boolean';
}
async function choose(input:Finding,config:Config,fetcher:typeof fetch):Promise<Decision> {
  if (!input.reportedCategoryAgrees) return 'review';
  try {
    const result=await fetcher(config.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),
      headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify({
        model:config.model,store:false,max_completion_tokens:400,
        messages:[{role:'system',content:policy},{role:'user',content:JSON.stringify({finding:input.finding,reportedCategoryAgrees:input.reportedCategoryAgrees})}],
        response_format:{type:'json_schema',json_schema:{name:'conduct_review',strict:true,schema:{type:'object',
          properties:{decision:{type:'string',enum:['review','hold']}},required:['decision'],additionalProperties:false}}}
      })});
    if (!result.ok) return 'review';
    const data=await result.json(), choice=data?.choices?.[0];
    if (data?.model!==config.model || choice?.finish_reason!=='stop' || choice.message?.refusal || typeof choice.message?.content!=='string') return 'review';
    const answer=JSON.parse(choice.message.content);
    return answer && Object.keys(answer).length===1 && answer.decision==='hold' ? 'hold' : 'review';
  } catch { return 'review'; }
}
export async function screenBatch(config:Config,fetcher:typeof fetch=fetch) {
  const headers={apikey:config.serviceKey,...(config.serviceKey.startsWith('eyJ')?{Authorization:'Bearer '+config.serviceKey}:{}),'Content-Type':'application/json'};
  const rpc=async(command:string,ticket:string,decision?:Decision)=>{
    const r=await fetcher(config.project+'/rest/v1/rpc/marriage_conduct_classifier',{method:'POST',headers,
      signal:AbortSignal.timeout(4000),body:JSON.stringify({command,ticket,model_version:config.model,decision:decision??null})});
    if(!r.ok)throw Error('screening_queue_unavailable');
    return r.json();
  };
  let assessed=0;
  for(let i=0;i<3;i++){
    const ticket=randomUUID(), next=await rpc('claim',ticket);
    if(next===null)break;
    // No provider call if the database payload is unexpected.
    const decision=finding(next)?await choose(next,config,fetcher):'review';
    await rpc('finish',ticket,decision); assessed++;
  }
  return {assessed};
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).end();
  const env=process.env;
  const auth=req.headers.authorization;
  if(!env.CRON_SECRET||typeof auth!=='string'||!timingSafeEqual(createHash('sha256').update(auth).digest(),createHash('sha256').update('Bearer '+env.CRON_SECRET).digest()))return res.status(401).end();
  if(env.WUDAYN_CONDUCT_CLASSIFIER_ENABLED!=='true')return res.status(200).json({enabled:false});
  const {WUDAYN_CONDUCT_MODEL_ENDPOINT:endpoint,WUDAYN_CONDUCT_APPROVED_MODEL:model,WUDAYN_CONDUCT_MODEL_KEY:key,NISFAYN_SUPABASE_URL:project,NISFAYN_SERVICE_ROLE_KEY:serviceKey}=env;
  if(env.VERCEL_ENV!=='production'||!project||project!=='https://wupkifqbwhhebwrgvwai.supabase.co'||!serviceKey||!endpoint||!model||!key
    ||!/^[A-Za-z0-9_.:-]{1,80}$/.test(model))return res.status(503).end();
  try {
    const url=new URL(endpoint);
    if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)return res.status(503).end();
    return res.status(200).json(await screenBatch({endpoint,model,key,project,serviceKey}));
  } catch { return res.status(503).end(); }
}
