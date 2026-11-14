import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
export default async function maintenance(req: VercelRequest,res: VercelResponse) {
  res.setHeader("Cache-Control","no-store");
  if(!["GET","POST"].includes(req.method??""))return res.status(405).json({error:"method_not_allowed"});
  const {CRON_SECRET,NISFAYN_SUPABASE_URL,NISFAYN_SERVICE_ROLE_KEY}=process.env;
  if(!CRON_SECRET||typeof req.headers.authorization!=="string"||!timingSafeEqual(
    createHash("sha256").update(req.headers.authorization).digest(),createHash("sha256").update("Bearer "+CRON_SECRET).digest()
  ))return res.status(401).json({error:"unauthorized"});
  if(process.env.VERCEL_ENV!=="production"||!NISFAYN_SERVICE_ROLE_KEY||NISFAYN_SUPABASE_URL!=="https://wupkifqbwhhebwrgvwai.supabase.co")
    return res.status(503).json({error:"maintenance_not_configured"});
  const headers={apikey:NISFAYN_SERVICE_ROLE_KEY,...(NISFAYN_SERVICE_ROLE_KEY.startsWith("eyJ")?{Authorization:"Bearer "+NISFAYN_SERVICE_ROLE_KEY}:{}),"Content-Type":"application/json"};
  const call=async(path:string,body:unknown)=>{
    const reply=await fetch(NISFAYN_SUPABASE_URL+path,{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
    if(!reply.ok)throw new Error("maintenance_unavailable");
    const text=await reply.text();return text?JSON.parse(text):null;
  };
  try {
    const paths:unknown=await call("/rest/v1/rpc/marriage_photo_cleanup_batch",{});
    const uuid="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    const objectPath=new RegExp("^"+uuid+"/"+uuid+"\\.jpg$");
    if(!Array.isArray(paths)||paths.length>100||paths.some(path=>typeof path!=="string"||!objectPath.test(path)))throw new Error("invalid_cleanup_batch");
    if(paths.length){
      const removed=await fetch(NISFAYN_SUPABASE_URL+"/storage/v1/object/nisfayn-private-photos",{method:"DELETE",headers,body:JSON.stringify({prefixes:paths}),signal:AbortSignal.timeout(12000)});
      if(!removed.ok)throw new Error("storage_cleanup_unavailable");
      await call("/rest/v1/rpc/marriage_photo_cleanup_done",{paths});
    }
    const galleryPaths:unknown=await call("/rest/v1/rpc/marriage_gallery_cleanup_batch",{});
    const galleryPath=new RegExp("^(?:"+uuid+"|test/(?:reham|abdulrahman))/"+uuid+"\\.jpg$");
    if(!Array.isArray(galleryPaths)||galleryPaths.length>100||galleryPaths.some(path=>typeof path!=="string"||!galleryPath.test(path)))throw new Error("invalid_gallery_cleanup_batch");
    if(galleryPaths.length){
      const removed=await fetch(NISFAYN_SUPABASE_URL+"/storage/v1/object/nisfayn-profile-gallery",{method:"DELETE",headers,body:JSON.stringify({prefixes:galleryPaths}),signal:AbortSignal.timeout(12000)});
      if(!removed.ok)throw new Error("gallery_cleanup_unavailable");
      await call("/rest/v1/rpc/marriage_gallery_cleanup_done",{paths:galleryPaths});
    }
    const portraitPaths:unknown=await call("/rest/v1/rpc/marriage_portrait_cleanup_batch",{});
    const portraitPath=new RegExp("^(?:"+uuid+"|test/(?:reham|abdulrahman))/"+uuid+"(?:-clear)?\\.jpg$");
    if(!Array.isArray(portraitPaths)||portraitPaths.length>100||portraitPaths.some(path=>typeof path!=="string"||!portraitPath.test(path)))throw new Error("invalid_portrait_cleanup_batch");
    if(portraitPaths.length){
      const removed=await fetch(NISFAYN_SUPABASE_URL+"/storage/v1/object/nisfayn-profile-portraits",{method:"DELETE",headers,body:JSON.stringify({prefixes:portraitPaths}),signal:AbortSignal.timeout(12000)});
      if(!removed.ok)throw new Error("portrait_cleanup_unavailable");
      await call("/rest/v1/rpc/marriage_portrait_cleanup_done",{paths:portraitPaths});
    }
    const chatPaths:unknown=await call("/rest/v1/rpc/nisfayn_chat_cleanup_batch",{});
    const chatPath=new RegExp("^(?:reham|abdulrahman)/"+uuid+"$");
    if(!Array.isArray(chatPaths)||chatPaths.length>100||chatPaths.some(path=>typeof path!=="string"||!chatPath.test(path)))throw new Error("invalid_chat_cleanup_batch");
    if(chatPaths.length){
      const removed=await fetch(NISFAYN_SUPABASE_URL+"/storage/v1/object/nisfayn-test-chat",{method:"DELETE",headers,body:JSON.stringify({prefixes:chatPaths}),signal:AbortSignal.timeout(12000)});
      if(!removed.ok)throw new Error("chat_cleanup_unavailable");
      await call("/rest/v1/rpc/nisfayn_chat_cleanup_done",{paths:chatPaths});
    }
    const memberChatPaths:unknown=await call("/rest/v1/rpc/marriage_chat_media_cleanup",{});
    const memberChatPath=new RegExp("^"+uuid+"/"+uuid+"/"+uuid+"$");
    if(!Array.isArray(memberChatPaths)||memberChatPaths.length>30||memberChatPaths.some(path=>typeof path!=="string"||!memberChatPath.test(path)))throw new Error("invalid_member_chat_cleanup_batch");
    if(memberChatPaths.length){
      const removed=await fetch(NISFAYN_SUPABASE_URL+"/storage/v1/object/nisfayn-member-chat",{method:"DELETE",headers,body:JSON.stringify({prefixes:memberChatPaths}),signal:AbortSignal.timeout(12000)});
      if(!removed.ok)throw new Error("member_chat_cleanup_unavailable");
      await call("/rest/v1/rpc/marriage_chat_media_cleanup",{paths:memberChatPaths});
    }
    const verificationPaths:unknown=await call("/rest/v1/rpc/marriage_verification_cleanup_batch",{});
    const verificationPath=new RegExp("^"+uuid+"/"+uuid+"\\.(jpg|png|pdf)$");
    if(!Array.isArray(verificationPaths)||verificationPaths.length>100||verificationPaths.some(path=>typeof path!=="string"||!verificationPath.test(path)))throw new Error("invalid_verification_cleanup_batch");
    if(verificationPaths.length){
      const removed=await fetch(NISFAYN_SUPABASE_URL+"/storage/v1/object/nisfayn-verification-evidence",{method:"DELETE",headers,body:JSON.stringify({prefixes:verificationPaths}),signal:AbortSignal.timeout(12000)});
      if(!removed.ok)throw new Error("verification_cleanup_unavailable");
      await call("/rest/v1/rpc/marriage_verification_cleanup_done",{paths:verificationPaths});
    }
    const cleaned=await call("/rest/v1/rpc/marriage_operations_cleanup",{});
    if(!cleaned||![cleaned.faultGroups,cleaned.notificationJobs].every(value=>Number.isSafeInteger(value)&&value>=0))throw new Error("invalid_cleanup_counts");
    const counts={photos:paths.length,portraits:portraitPaths.length,chatMedia:chatPaths.length,memberChatMedia:memberChatPaths.length,verificationEvidence:verificationPaths.length,faultGroups:cleaned.faultGroups,notificationJobs:cleaned.notificationJobs};
    console.info(JSON.stringify({event:"nisfayn_maintenance",...counts}));
    return res.status(200).json(counts);
  }catch{
    console.error(JSON.stringify({event:"nisfayn_maintenance_failed"}));
    return res.status(503).json({error:"maintenance_unavailable"});
  }
}
