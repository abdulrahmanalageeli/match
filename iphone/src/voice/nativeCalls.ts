import { Capacitor, registerPlugin } from '@capacitor/core';
import { useEffect, useRef } from 'react';
import { cloud, cloudConnection } from '../cloud';
import { marriageProjectUrl, marriagePublishableKey } from '../deployment';

type Device={installation:string;environment:'production'|'sandbox';voipToken:string|null};
type Controls={managed:boolean;account:string|null;callId:string|null;joined:boolean;muted:boolean;peer:boolean;route:string};
export const nativeCalls=registerPlugin<{
 callDevice():Promise<Device>;
 configureCalls(value:{installation:string;credential:string;account:string}):Promise<void>;
 clearCalls():Promise<void>;
 callState():Promise<Controls>;
 audioRoutes():Promise<void>;
}>('NisfaynVoice');
let managed=false;
export const nativeBackgroundCalls=()=>managed;

export function useNativeCalls(owner:string|null,testerSession?:string){
 const previous=useRef<string|null>(null);
 const serial=useRef<Promise<void>>(Promise.resolve());
 useEffect(()=>{
  if(!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=='ios')return;
  const account=testerSession?'tester:'+testerSession:owner;
  let active=true,lastBound=0;
  const bind=()=>{
   if(document.hidden||Date.now()-lastBound<6*60*60*1000)return;
   serial.current=serial.current.catch(()=>{}).then(async()=>{
    if(!active)return;
    if(!account){if(previous.current){await nativeCalls.clearCalls();previous.current=null;managed=false;}return;}
    // A cold-start call can already be connected before the web page initializes.
    const state=await nativeCalls.callState();
    managed=state.managed;
    if(state.managed&&state.account!==account){await nativeCalls.clearCalls();managed=false;}
    if(state.callId&&state.managed&&state.account===account){previous.current=account;return;}
    const device=await nativeCalls.callDevice();
    const session=testerSession?null:(await cloud?.auth.getSession())?.data.session;
    if(!testerSession&&session?.user.id!==owner)return;
    const response=await fetch(marriageProjectUrl+'/functions/v1/native-call',{
     method:'POST',headers:{'Content-Type':'application/json',apikey:marriagePublishableKey,...(session?{Authorization:'Bearer '+session.access_token}:{})},
     body:JSON.stringify({...device,command:'register',...(testerSession?{testerSession}:{})}),signal:AbortSignal.timeout(12000),
    });
    if(!response.ok)throw Error('Native registration unavailable');
    const credentials=await response.json();
    if(!active)return;
    await nativeCalls.configureCalls({...credentials,account});managed=true;previous.current=account;lastBound=Date.now();
   }).catch(()=>{/* Older builds retain their existing foreground calls. */});
  };
  if(!testerSession&&cloudConnection.url!==marriageProjectUrl)return;
  bind();document.addEventListener('visibilitychange',bind);
  return()=>{active=false;document.removeEventListener('visibilitychange',bind);};
 },[owner,testerSession]);
}

/** Call creation already checks mutual permission. This only wakes eligible phones. */
export async function ringNativePhones(callId:string,testerSession?:string){
 try{
  const session=testerSession?null:(await cloud?.auth.getSession())?.data.session;
  if(!testerSession&&(!session||cloudConnection.url!==marriageProjectUrl))return;
  await fetch('https://nisfayn-admin.vercel.app/api/call-push',{
   method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.access_token}:{})},
   body:JSON.stringify({callId,...(testerSession?{testerSession}:{})}),signal:AbortSignal.timeout(10000),
  });
 }catch{/* In-app ringing remains available if the push service is unreachable. */}
}
