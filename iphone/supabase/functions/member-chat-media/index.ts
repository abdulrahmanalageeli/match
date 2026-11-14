import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { testMediaLimit, validateTestMedia } from '../_shared/test-media.ts';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bucket='nisfayn-member-chat';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type, x-request-id, x-client-id, x-duration-ms, x-view-once','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
class MediaError extends Error {constructor(readonly status:number,message:string){super(message);}}
async function readBody(req:Request,limit:number){
 const reader=req.body?.getReader();if(!reader)throw new MediaError(400,'الملف غير صالح.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new MediaError(413,'الحد الأقصى للملف ٨ ميجابايت.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return bytes;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return Response.json({error:'طريقة غير متاحة.'},{status:405,headers});
 try{
  const url=Deno.env.get('SUPABASE_URL')||'';
  if(new URL(url).hostname!=='wupkifqbwhhebwrgvwai.supabase.co')throw new MediaError(503,'الخدمة غير مهيأة.');
  const authorization=req.headers.get('authorization')||'';
  if(!/^Bearer \S+$/i.test(authorization))throw new MediaError(401,'يرجى تسجيل الدخول.');
  const key=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
  const {data:identity,error:authError}=await client.auth.getUser(authorization.slice(7));
  if(authError||!identity.user)throw new MediaError(401,'انتهت الجلسة. سجّل الدخول مجددًا.');
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
  const storage=admin.storage.from(bucket);
  async function rpc(action:string,requestId:string,mediaId:string,payload:Record<string,unknown>={}){
   const {data,error}=await client.rpc('marriage_chat_media',{action,request_id:requestId,media_id:mediaId,payload});
   if(error)throw new MediaError(error.code==='42501'?403:error.code==='22023'?400:409,'الملف غير متاح. تحقق من التعارف واتفاق الجدية ثم حاول مجددًا.');
   return data;
  }
  const action=new URL(req.url).searchParams.get('action');
  if(action==='upload'){
   const requestId=req.headers.get('x-request-id')||'',id=req.headers.get('x-client-id')||'';
   if(!uuid.test(requestId)||!uuid.test(id))throw new MediaError(400,'معرّف الملف غير صالح.');
   const bytes=await readBody(req,testMediaLimit);
   let meta:ReturnType<typeof validateTestMedia>;
   try{meta=validateTestMedia(bytes,req.headers.get('content-type')||'',req.headers.get('x-duration-ms'));}catch(error){throw new MediaError(400,(error as Error).message);}
   const kind=meta.mime.startsWith('image/')?'photo':'audio';
   const once=req.headers.get('x-view-once')||'false';
   if(!['true','false'].includes(once)||kind==='audio'&&once==='true')throw new MediaError(400,'خيار العرض غير صالح.');
   const reservation=await rpc('prepare',requestId,id,{...meta,kind,viewOnce:once==='true'});
   if(reservation.already)return Response.json({id},{headers});
   try{
    const {error}=await storage.upload(reservation.path,bytes,{contentType:meta.mime,upsert:false,cacheControl:'0'});
    // A retry can encounter its already uploaded object. SQL verifies its exact metadata before publishing.
    if(error&&!['409','400'].includes(String(error.statusCode)))throw new MediaError(503,'تعذّر رفع الملف. حاول مجددًا.');
    await rpc('commit',requestId,id);
   }catch(error){
    // Abort returns a path only when nothing was published; never remove a committed attachment after a lost response.
    const abandoned=await rpc('abort',requestId,id).catch(()=>null);
    if(abandoned?.path)await storage.remove([abandoned.path]);
    if(abandoned?.already)return Response.json({id},{headers});
    throw error;
   }
   // Scoped best-effort cleanup for deleted messages/accounts and abandoned reservations.
   try{const {data}=await admin.rpc('marriage_chat_media_cleanup');if(Array.isArray(data)&&data.length){const paths=data.map(item=>typeof item==='string'?item:item.path);const {error}=await storage.remove(paths);if(!error)await admin.rpc('marriage_chat_media_cleanup',{paths});}}catch{/* A later upload retries cleanup. */}
   return Response.json({id},{headers});
  }
  if(action==='download'){
   let input;try{input=JSON.parse(new TextDecoder().decode(await readBody(req,2048)));}catch{throw new MediaError(400,'طلب الملف غير صالح.');}
   if(!input||!uuid.test(input.requestId)||!uuid.test(input.mediaId)||typeof input.viewOnce!=='boolean')throw new MediaError(400,'طلب الملف غير صالح.');
   const grant=await rpc(input.viewOnce?'open':'access',input.requestId,input.mediaId);
   const {data,error}=await storage.download(grant.path);
   if(error||!data)throw new MediaError(404,'تعذّر فتح الملف.');
   return new Response(data,{headers:{...headers,'Content-Type':grant.mime,'Content-Disposition':'inline'}});
  }
  throw new MediaError(400,'إجراء غير صالح.');
 }catch(error){return Response.json({error:error instanceof MediaError?error.message:'تعذّر إكمال طلب الملف. حاول مجددًا.'},{status:error instanceof MediaError?error.status:503,headers});}
});
