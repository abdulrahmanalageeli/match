import { useEffect, useRef, useState } from 'react';
import { UserRound } from "../BrandIcons";
import type { ProfilePortrait } from '../types';
import type { CommunitySource } from '../community/data';
import { CaptureWatermark } from '../privacy/CapturePrivacy';

type LoadedPortrait = { signature: string; source: CommunitySource; url: string; key: string; revealed: boolean; blur: number };
const viewKey = (photo: ProfilePortrait) => [photo.id,photo.path,photo.blur,photo.revealed??false].join('|');

export function PortraitPhoto({portrait,source,alt,className,captionClassName,frameClassName}:{portrait:ProfilePortrait;source?:CommunitySource|null;alt:string;className?:string;captionClassName?:string;frameClassName?:string}) {
  const [loaded,setLoaded]=useState<LoadedPortrait|null>(null);
  const element=useRef<HTMLElement|null>(null);
  const invalidate=useRef<(()=>void)|null>(null);
  const signature=[portrait.id,portrait.path,portrait.revealed??false,portrait.revealPolicy??'never'].join('|');
  useEffect(()=>{
    if(!source?.portraitUrl)return;
    let active=true,inFlight=false,inViewport=typeof IntersectionObserver==='undefined',lastCheck=0,generation=0;
    let current:LoadedPortrait|null=null,wake:ReturnType<typeof setTimeout>|undefined;
    function discard(){
      generation++;
      if(current?.url.startsWith('blob:'))URL.revokeObjectURL(current.url);
      current=null;
      if(active)setLoaded(null);
    }
    invalidate.current=discard;
    async function refresh(){
      if(!active||inFlight||document.hidden||!inViewport)return;
      inFlight=true;lastCheck=Date.now();
      let requestGeneration=generation;
      try {
        const info=source!.portraitState?await source!.portraitState(portrait):portrait;
        if(requestGeneration!==generation)return;
        const key=viewKey(info);
        if(current?.key===key)return;
        // Never keep a previously revealed image while replacing/rechecking its access.
        discard();
        requestGeneration=generation;
        let shown=info;
        const url=await source!.portraitUrl(info, authorized=>{shown=authorized;});
        if(!active||document.hidden||!inViewport||requestGeneration!==generation){if(url.startsWith('blob:'))URL.revokeObjectURL(url);return;}
        current={signature,source:source!,url,key:viewKey(shown),revealed:shown.revealed===true,blur:shown.blur};
        setLoaded(current);
      } catch { discard();requestGeneration=generation; }
      finally {inFlight=false;if(active&&requestGeneration!==generation&&!document.hidden&&inViewport)void refresh();}
    }
    function schedule(){
      if(!active||document.hidden||!inViewport||wake!==undefined)return;
      wake=setTimeout(()=>{wake=undefined;void refresh();},Math.max(0,2000-(Date.now()-lastCheck)));
    }
    function visibility(){
      if(document.hidden)discard();
      else {lastCheck=0;void refresh();}
    }
    const anchor=element.current?.parentElement??element.current;
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
      inViewport=entries.some(entry=>entry.isIntersecting);
      if(inViewport)void refresh();
      else if(current?.revealed||inFlight)discard();
    });
    if(anchor)observer?.observe(anchor);
    if(inViewport)void refresh();
    const stop=source.watch(schedule);
    const timer=setInterval(()=>{void refresh();},15000);
    document.addEventListener('visibilitychange',visibility);
    return()=>{active=false;clearTimeout(wake);clearInterval(timer);observer?.disconnect();stop();document.removeEventListener('visibilitychange',visibility);discard();invalidate.current=null;};
  },[source,signature,portrait.id,portrait.path,portrait.revealed,portrait.revealPolicy]);
  const shown=loaded?.signature===signature && loaded.source===source ? loaded : null;
  const photo=shown?<img ref={node=>{element.current=node;}} className={className} src={shown.url} alt={alt} width="640" height="800" decoding="async" onError={()=>invalidate.current?.()}/>:<span ref={node=>{element.current=node;}} className={className} aria-label="الصورة غير متاحة بعد"><UserRound size={30}/></span>;
  if (!captionClassName && !frameClassName) return photo;
  return <>{frameClassName?<div className={frameClassName}>{photo}{shown && <CaptureWatermark scope="profile" variant="photo"/>}</div>:photo}
    {captionClassName && shown && <span className={captionClassName}>{shown.revealed?'الصورة الواضحة متاحة لك بإذن صاحبها':shown.blur>0?'صورة بتمويه اختياري':'صورة شخصية'}</span>}
  </>;
}
