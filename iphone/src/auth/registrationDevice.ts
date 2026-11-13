import { Capacitor,registerPlugin } from '@capacitor/core';
import { cloud } from '../cloud';
export type SignupVerification={phoneProof:string;deviceId:string};
const native=registerPlugin<{status():Promise<{installationId:string}>}>('NisfaynPush');
let fallback:string|undefined;
export async function registrationDeviceId():Promise<string>{
 if(Capacitor.getPlatform()==='ios'&&Capacitor.isNativePlatform()){
  const status=await native.status();
  if(!/^[a-f0-9-]{36}$/i.test(status.installationId))throw Error('تعذّر قراءة معرّف تثبيت التطبيق.');
  return 'ios:'+status.installationId.toLowerCase();
 }
 let value:string|null=null;
 try{value=localStorage.getItem('wudayn.signup.device');}catch{/* Restricted storage uses an in-memory installation ID. */}
 if(!value||!/^[a-f0-9-]{36}$/i.test(value)){
  value=fallback??crypto.randomUUID();fallback=value;
  try{localStorage.setItem('wudayn.signup.device',value);}catch{/* Device warnings remain best-effort. */}
 }
 return 'web:'+value.toLowerCase();
}
export async function recordRegistrationDevice(){
 if(!cloud)return;
 const id=await registrationDeviceId();
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('wudayn-device-v1:'+id));
 const device_hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 await cloud.rpc('marriage_register_device',{device_hash});
}
