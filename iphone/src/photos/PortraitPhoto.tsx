import { useEffect, useRef, useState } from 'react';
import type { ProfilePortrait } from '../types';
import type { CommunitySource } from '../community/data';
import { DiscoveryPhoto } from '../privacy/DiscoveryPhoto';

type LoadedPortrait = { signature: string; source: CommunitySource; url: string; key: string; revealed: boolean; blur: number };
const viewKey = (photo: ProfilePortrait) => [photo.id,photo.path,photo.blur,photo.revealed??false].join('|');

export function PortraitPhoto({portrait,source,alt,className,captionClassName,frameClassName,discovery}:{portrait:ProfilePortrait;source?:CommunitySource|null;alt:string;className?:string;captionClassName?:string;frameClassName?:string;discovery?:{name:string;compact?:boolean}}) {
  const [loaded,setLoaded]=useState<LoadedPortrait|null>(null);
  const element=useRef<HTMLElement|null>(null);
  const invalidate=useRef<(()=>void)|null>(null);
  const prefetch=Boolean(discovery && source?.portraitUrlResolvesState);
  const signature=[viewKey(portrait),portrait.revealPolicy??'never'].join('|');
  useEffect(()=>{
    if(!source?.portraitUrl)return;
    let active=true,inFlight=false,inViewport=typeof IntersectionObserver==='undefined',lastCheck=0,generation=0;
    let nearViewport=false,attemptedPrefetch=false;
    let current:LoadedPortrait|null=null,wake:ReturnType<typeof setTimeout>|undefined;
    function discard(){
      generation++;
      if(current?.url.startsWith('blob:'))URL.revokeObjectURL(current.url);
      current=null;
      if(active)setLoaded(null);
    }
    invalidate.current=discard;
    function canRefresh(){
      return inViewport || (nearViewport && !attemptedPrefetch && !portrait.revealed && !current);
    }
    async function refresh(){
      if(!active||inFlight||document.hidden||!canRefresh())return;
      if(!inViewport)attemptedPrefetch=true;
      inFlight=true;lastCheck=Date.now();
      let requestGeneration=generation;
      try {
        // On a cold load the cloud download already selects the authorized variant.
        // Continue rechecking access while an existing image is on screen.
        const needsCheck = current !== null || !source!.portraitUrlResolvesState;
        const info=needsCheck && source!.portraitState?await source!.portraitState(portrait):portrait;
        if(requestGeneration!==generation)return;
        const key=viewKey(info);
        if(current?.key===key)return;
        // Never keep a previously revealed image while replacing/rechecking its access.
        discard();
        requestGeneration=generation;
        let shown=info;
        const mayKeep=(variant:ProfilePortrait)=>active && !document.hidden && requestGeneration===generation &&
          (inViewport || (nearViewport && !variant.revealed));
        const url=await source!.portraitUrl(info, authorized=>{shown=authorized;return mayKeep(authorized);});
        if(!mayKeep(shown)){if(url.startsWith('blob:'))URL.revokeObjectURL(url);return;}
        current={signature,source:source!,url,key:viewKey(shown),revealed:shown.revealed===true,blur:shown.blur};
        setLoaded(current);
      } catch { if(requestGeneration===generation){discard();requestGeneration=generation;} }
      finally {inFlight=false;if(active&&requestGeneration!==generation&&!document.hidden&&canRefresh())void refresh();}
    }
    function schedule(){
      if(!active||document.hidden||!inViewport||wake!==undefined)return;
      wake=setTimeout(()=>{wake=undefined;void refresh();},Math.max(0,2000-(Date.now()-lastCheck)));
    }
    function visibility(){
      if(document.hidden){attemptedPrefetch=false;discard();}
      else {lastCheck=0;void refresh();}
    }
    const anchor=element.current?.parentElement??element.current;
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
      const wasVisible=inViewport;
      inViewport=entries[entries.length-1]?.isIntersecting===true;
      if(inViewport){attemptedPrefetch=false;void refresh();}
      else if(current?.revealed || (wasVisible && inFlight))discard();
    });
    // Only preload a live discovery variant whose fresh authorization permits
    // it offscreen. The strict viewport observer still owns revealed photos.
    const nearby=prefetch && typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{
      nearViewport=entries[entries.length-1]?.isIntersecting===true;
      if(nearViewport)void refresh();
      else {
        if(attemptedPrefetch && !inViewport && current)discard();
        attemptedPrefetch=false;
      }
    },{rootMargin:'240px 0px'}):null;
    if(anchor){observer?.observe(anchor);nearby?.observe(anchor);}
    if(inViewport)void refresh();
    const stop=source.watch(schedule);
    const timer=setInterval(()=>{void refresh();},15000);
    document.addEventListener('visibilitychange',visibility);
    return()=>{active=false;clearTimeout(wake);clearInterval(timer);observer?.disconnect();nearby?.disconnect();stop();document.removeEventListener('visibilitychange',visibility);discard();invalidate.current=null;};
  },[source,signature,prefetch,portrait.id,portrait.path,portrait.revealed,portrait.revealPolicy]);
  const shown=loaded?.signature===signature && loaded.source===source ? loaded : null;
  const photo=discovery ? <DiscoveryPhoto {...discovery} src={shown?.url} observe={node=>{element.current=node;}}/> : shown?<img data-access-checked-portrait="" ref={node=>{element.current=node;}} className={className} src={shown.url} alt={alt} width="640" height="800" decoding="async" onError={()=>invalidate.current?.()}/>:<span data-access-checked-portrait="" ref={node=>{element.current=node;}} className={className} role="img" aria-label="الصورة غير متاحة بعد"/>;
  if (!captionClassName && !frameClassName) return photo;
  return <>{frameClassName?<div className={frameClassName}>{photo}</div>:photo}
    {captionClassName && shown && <span className={captionClassName}>{shown.revealed?'الصورة الواضحة متاحة لك بإذن صاحبها':shown.blur>0?'صورة بتمويه اختياري':'صورة شخصية'}</span>}
  </>;
}
