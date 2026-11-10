import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { mintVoiceToken } from '../_shared/voice.ts';

const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try {
  if(req.method!=='POST')return Response.json({error:'method'},{status:405,headers});
  // Bound the streaming body, not just Content-Length.
  const reader=req.body?.getReader();let size=0,text='';const decoder=new TextDecoder();
  if(!reader)throw Error('body');
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return Response.json({error:'size'},{status:413,headers});}text+=decoder.decode(value,{stream:true});}
  const body=JSON.parse(text+decoder.decode());
  if(!uuid.test(body.installation))return Response.json({error:'device'},{status:400,headers});
  const url=Deno.env.get('SUPABASE_URL')!;
  if(url!=='https://wupkifqbwhhebwrgvwai.supabase.co')throw Error('project');
  const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  let result;
  if(body.command==='register'){
   const params={installation:body.installation,device_environment:body.environment,device_token:body.voipToken||null};
   if(typeof body.testerSession==='string'&&/^[0-9a-f]{64}$/.test(body.testerSession)){
    result=await service.rpc('nisfayn_test_native_register',{...params,session_token:body.testerSession});
   }else{
    const authorization=req.headers.get('Authorization')||'';
    if(!/^Bearer [^\s]+$/.test(authorization))return Response.json({error:'session'},{status:401,headers});
    const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
    result=await client.rpc('marriage_native_call_register',params);
   }
  }else{
   if(typeof body.credential!=='string'||!/^[0-9a-f]{64}$/.test(body.credential)||!['state','token','accept','decline','end','device','unregister'].includes(body.command))return Response.json({error:'session'},{status:401,headers});
   if(!['device','unregister'].includes(body.command)&&!uuid.test(body.callId))return Response.json({error:'call'},{status:400,headers});
   result=await service.rpc('nisfayn_native_call',{installation:body.installation,credential:body.credential,command:body.command,call_id:body.callId||null,device_token:body.voipToken||null});
  }
  if(result.error)return Response.json({error:'المكالمة غير متاحة أو انتهت الجلسة.'},{status:result.error.code==='42501'?403:result.error.code==='P0001'?429:400,headers});
  if(body.command==='token'){
   if(!result.data||result.data.callId!==body.callId)return Response.json({error:'انتهت المكالمة.'},{status:409,headers});
   return Response.json(mintVoiceToken(result.data,{appId:Deno.env.get('AGORA_APP_ID')!,certificate:Deno.env.get('AGORA_APP_CERTIFICATE')!}),{headers});
  }
  return Response.json(result.data,{headers});
 }catch{return Response.json({error:'تعذّر الاتصال مؤقتًا.'},{status:503,headers});}
});
