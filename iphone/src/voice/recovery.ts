export function fatalVoiceError(error: unknown): boolean {
 const e=error as {status?:number;code?:string;name?:string;message?:string};
 return [400,401,403,404].includes(e?.status||0)||/NotAllowed|NotFound|PERMISSION|DENIED|INVALID.*(TOKEN|APP)|TOKEN.*INVALID|NOT_AUTHORIZED|غير مسموح|انتهت الجلسة|التعارف مغلق|المكالمة غير متاحة|الميكروفون/.test(`${e?.name} ${e?.code} ${e?.message}`);
}
export async function retryVoice<T>(work:()=>Promise<T>,active:()=>boolean,retrying:()=>void,wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms))):Promise<T>{
 for(let attempt=0;;attempt++){
  if(!active())throw new DOMException('Call cancelled','AbortError');
  try{return await work();}catch(error){
   if(!active()||fatalVoiceError(error)||attempt>=2)throw error;
   retrying();await wait(attempt===0?700:2000);
  }
 }
}
