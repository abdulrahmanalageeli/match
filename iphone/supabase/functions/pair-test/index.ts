import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { mintVoiceToken } from '../_shared/voice.ts';
import { testMediaLimit, validateTestMedia } from '../_shared/test-media.ts';
import { parsePortraitUpload, portraitRequestLimit, portraitPolicies } from '../_shared/portrait-media.ts';
import { downloadChatMedia, viewOnceUpload, chatObjectPath } from '../_shared/chat-media.ts';
import { projectPairState } from '../_shared/pair-privacy.ts';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,apikey,x-test-session,x-client-id,x-duration-ms,x-portrait-blur,x-portrait-reveal,x-profile-revision,x-view-once','Access-Control-Allow-Methods':'POST,OPTIONS'};
const allowed=new Set(['portrait_info','portrait_remove','heartbeat','interest','uninterest','dismiss_person','report_person','rematch_request','rematch_accept','rematch_decline','match_seen','rewind','gallery_list','gallery_url','gallery_remove','notifications','notifications_read','profile_visit','state','send','read','delivered','profile','close','reset','step','logout','call_start','call_accept','call_decline','call_end','token','permission_invite','permission_accept','permission_decline','media_url','agreement_propose','agreement_accept','agreement_family']);
const bucket='nisfayn-test-chat';
allowed.add('portrait_policy');
allowed.add('message_delete');
allowed.add('message_react');
allowed.add('passport');
allowed.add('family');
const validSession=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const validId=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers});
  const url=Deno.env.get('SUPABASE_URL')!;
  if(new URL(url).hostname!=='wupkifqbwhhebwrgvwai.supabase.co')throw Error('Wrong project');
  const client=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc=async(action:string,session='',payload={})=>{
   const {data,error}=await client.rpc('nisfayn_test_rpc',{action,session_token:session,payload});
   if(error)throw Object.assign(Error(error.code==='42501'?'انتهت الجلسة أو أُغلق التعارف.':error.message),{status:error.code==='42501'?403:400});
   if(data?.profiles&&['reham','abdulrahman'].includes(data.actor)){
    const {data:claims,error:claimError}=await client.rpc('marriage_test_manual_verification_badges',{test_token:session});
    // Verification eligibility is stricter than reading an existing tester session.
    // A paused account must still reach its settings; unavailable claims stay hidden.
    data.manualVerifications=claimError?{reham:[],abdulrahman:[]}:claims;
   }
   return projectPairState(data);
  };
  const galleryUpload=new URL(req.url).searchParams.get('action')==='gallery_upload';
  const portraitUpload=new URL(req.url).searchParams.get('action')==='portrait_upload';
  const upload=new URL(req.url).searchParams.get('action')==='upload';
  const session=req.headers.get('x-test-session');
  if(galleryUpload||portraitUpload){if(!validSession(session))return Response.json({error:"يرجى تسجيل الدخول."},{status:401,headers});await rpc("state",session);}
  const portraitBlur=req.headers.get('x-portrait-blur');
  const revealPolicy=req.headers.get('x-portrait-reveal')||'never';
  if(portraitUpload&&!portraitPolicies.includes(revealPolicy as typeof portraitPolicies[number]))return Response.json({error:'خيار كشف الصورة غير صالح.'},{status:400,headers});
  if(portraitUpload&&(!portraitBlur||!/^\d{1,3}$/.test(portraitBlur)||Number(portraitBlur)>100))return Response.json({error:'درجة التمويه غير صالحة.'},{status:400,headers});
  const profileRevision=req.headers.get('x-profile-revision');
  if(portraitUpload&&(!profileRevision||!/^[0-9a-f]{32}$/.test(profileRevision)))return Response.json({error:'حدّث الملف قبل رفع الصورة.'},{status:400,headers});
  if(upload){
   if(!validSession(session))return Response.json({error:'يرجى تسجيل الدخول.'},{status:401,headers});
   // Authenticate before reading the larger binary body.
   const state=await rpc('state',session);
   if(!state.matched)return Response.json({error:'التعارف مغلق.'},{status:403,headers});
   if(!['accepted','family'].includes(state.seriousness?.status))return Response.json({error:'أكملا اتفاق الجدية والمدة قبل بدء التواصل.'},{status:403,headers});
  }
  const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
  if(!reader)throw Error('Invalid body');
  const max=portraitUpload?portraitRequestLimit:galleryUpload?3145728:upload?testMediaLimit:24000;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();return Response.json({error:'حجم الملف أكبر من الحد المسموح.'},{status:413,headers});}chunks.push(value);}
  const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}
  if(portraitUpload&&validSession(session)){
   const images=await parsePortraitUpload(bytes,req.headers.get('content-type')||'',Number(portraitBlur),revealPolicy);
   const p=await rpc('portrait_prepare',session,{blur:Number(portraitBlur),revealPolicy,expectedRevision:profileRevision});
   try{
    const storage=client.storage.from('nisfayn-profile-portraits');
    const {error}=await storage.upload(p.path,images.blurred,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});
    if(error)throw Error('تعذّر رفع الصورة. حاول مجددًا.');
    if(images.clear){
     if(!p.clearPath)throw Error('تعذّر تجهيز النسخة الخاصة.');
     const {error:clearError}=await storage.upload(p.clearPath,images.clear,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});
     if(clearError)throw Error('تعذّر رفع النسخة الخاصة. تبقى الصورة السابقة كما هي.');
    }
    return Response.json(await rpc('portrait_commit',session,{id:p.id,expectedRevision:profileRevision}),{headers});
   }catch(error){
    // A lost commit response must never delete a newly published or previous portrait.
    const state=await rpc('state',session).catch(()=>null);
    if(state?.profiles?.[state.actor]?.portrait?.id===p.id)return Response.json(state,{headers});
    // Abandoned reservations/objects are reclaimed by the scoped cleanup worker.
    throw error;
   }
  }
  if(galleryUpload&&validSession(session)){
   const meta=validateTestMedia(bytes,req.headers.get('content-type')||'',null);if(meta.mime!=='image/jpeg')throw Error('اختر صورة JPEG.');
   const p=await rpc('gallery_prepare',session);const galleryBucket=client.storage.from('nisfayn-profile-gallery');
   const {error}=await galleryBucket.upload(p.path,bytes,{contentType:'image/jpeg',upsert:false});
   if(error){await rpc('gallery_remove',session,{id:p.id});throw Error('تعذّر رفع الصورة.');}
   await rpc('gallery_commit',session,{id:p.id});return Response.json({ok:true},{headers});
  }
  if(upload&&validSession(session)){
   const id=req.headers.get('x-client-id');if(!validId(id))throw Error('معرّف الملف غير صالح.');
   const meta=validateTestMedia(bytes,req.headers.get('content-type')||'',req.headers.get('x-duration-ms'));
   const viewOnce=viewOnceUpload(req.headers.get('x-view-once'),meta.mime);
   // Sweep only abandoned uploads. Published photos/audio are never removed here.
   const stale=await rpc('media_stale',session) as {id:string;path:string}[];
   for(const item of stale){const {error}=await client.storage.from(bucket).remove([item.path]);if(!error)await rpc('media_purge',session,{id:item.id});}
   const reservation=await rpc('media_reserve',session,{id,...meta,viewOnce});
   if(reservation.already)return Response.json(await rpc('state',session),{headers});
   let stored=Boolean(reservation.resume);
   try{
    if(!reservation.resume){
     const {error}=await client.storage.from(bucket).upload(reservation.path,bytes,{contentType:meta.mime,upsert:false,cacheControl:'120'});
     if(error)throw Error('تعذّر رفع الملف. حاول مجددًا.');stored=true;
    }
    const state=await rpc('media_publish',session,{id});
    return Response.json(state,{headers});
   }catch(error){
    // If publish succeeded but its response was lost, never remove an attached file.
    const state=await rpc('state',session).catch(()=>null);
    const published=state?.messages?.some((m:{attachment?:{id:string}})=>m.attachment?.id===id);
    if(published)return Response.json(state,{headers});
    if(state){if(stored)await client.storage.from(bucket).remove([reservation.path]);await rpc('media_abort',session,{id}).catch(()=>{});}
    throw error;
   }
  }
  const body=JSON.parse(new TextDecoder().decode(bytes));
  if(new URL(req.url).searchParams.get('action')==='media_download'){
   return await downloadChatMedia(body,rpc,async path=>{
    const {data,error}=await client.storage.from(bucket).download(path);
    if(error||!data)throw Error('تعذّر فتح الملف. إذا كان لمرة واحدة، اطلب من المرسل إرساله مجددًا.');
    return data;
   },headers);
  }
  if(new URL(req.url).searchParams.get('action')==='portrait_download'){
   if(!validSession(body.session)||!validId(body.payload?.id))return Response.json({error:'يرجى تسجيل الدخول.'},{status:401,headers});
   const photo=await rpc('portrait_info',body.session,{id:body.payload.id});
   if(!photo?.path||photo.id!==body.payload.id)throw Error('الصورة غير متاحة.');
   const {data:image,error}=await client.storage.from('nisfayn-profile-portraits').download(photo.path);
   if(error||!image)throw Error('تعذّر تحميل الصورة.');
   return new Response(image,{headers:{...headers,'Content-Type':'image/jpeg','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}});
  }
  if(body.action==='login'){
   if(!await rpc('attempt'))return Response.json({error:'محاولات كثيرة. انتظر دقيقة.'},{status:429,headers});
   const password=Deno.env.get('NISFAYN_TEST_PASSWORD');
   if(!['abdulrahman','reham'].includes(body.actor)||body.actor==='abdulrahman'&&(!password||body.password!==password))return Response.json({error:'كلمة المرور غير صحيحة.'},{status:401,headers});
   const session=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
   await rpc('login',session,{actor:body.actor});
   return Response.json({session,...await rpc('state',session)},{headers});
  }
  if(!allowed.has(body.action)||!validSession(body.session))return Response.json({error:'يرجى تسجيل الدخول.'},{status:401,headers});
  let data=await rpc(body.action,body.session,body.payload||{});
  if(body.action==='message_delete'&&data){
   const path=data._deletedMediaPath;delete data._deletedMediaPath;
   if(typeof path==='string'&&chatObjectPath.test(path)){
    // The authoritative tombstone is already committed; queued cleanup retries failures.
    try{const {error}=await client.storage.from(bucket).remove([path]);
     if(!error)await client.rpc('nisfayn_chat_cleanup_done',{paths:[path]});
    }catch{/* A cleanup failure must not undo a successful deletion. */}
   }
  }
  if(body.action==='token')data=mintVoiceToken(data,{appId:Deno.env.get('AGORA_APP_ID')!,certificate:Deno.env.get('AGORA_APP_CERTIFICATE')!});
  if(body.action==='gallery_remove'&&data.path)await client.storage.from('nisfayn-profile-gallery').remove([data.path]);
  if(body.action==='portrait_info'&&data&&!data.revealed&&!body.payload?.metadataOnly){
   const {data:link,error}=await client.storage.from('nisfayn-profile-portraits').createSignedUrl(data.path,120);
   if(error||!link)throw Error('تعذّر فتح الصورة. حاول مجددًا.');
   data={...data,url:link.signedUrl,expiresAt:new Date(Date.now()+120000).toISOString()};
  }
  if(body.action==='media_url'||body.action==='gallery_url'){
   const {data:link,error}=await client.storage.from(body.action==='gallery_url'?'nisfayn-profile-gallery':bucket).createSignedUrl(data.path,120);
   if(error||!link)throw Error('تعذّر فتح الملف. حاول مجددًا.');
   data={url:link.signedUrl,expiresAt:new Date(Date.now()+120000).toISOString()};
  }
  return Response.json(data,{headers});
 }catch(e){return Response.json({error:e instanceof Error&&/[\u0600-\u06ff]/.test(e.message)?e.message:'تعذّر إتمام العملية.'},{status:(e as {status?:number}).status||500,headers});}
});
