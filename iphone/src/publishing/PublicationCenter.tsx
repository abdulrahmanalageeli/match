import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, Bell, ChevronDown, ChevronLeft, X } from '../BrandIcons';
import { NoticeHeader } from '../ui/NoticeHeader';
import { cloud, cloudSessionId } from '../cloud';
import './publications.css';

import { publicationBuild } from './appBuild';
export type PublicationDestination = 'discover' | 'membership' | 'settings' | 'inbox' | 'application';
type Publication = { id:string; placement:'news'|'inbox'|'banner'|'setting'; screen:string; title:string; body:string; destination:PublicationDestination|null; key:string|null; stamp:string; expires:string; opened:boolean };
const PublicationContext = createContext<Publication[]>([]);
export function usePublishedItems(){return useContext(PublicationContext);}
export function usePublishedCopy(key:string, fallback:string) {
  return useContext(PublicationContext).find(item=>item.placement==='setting' && item.key===key)?.body ?? fallback;
}
const platform = Capacitor.getPlatform()==='ios'?'ios':'web';

export function PublicationCenter({owner,screen,enabled,openedId,onConsumed,navigate,children}:{
  owner:string|null;screen:string;enabled:boolean;openedId:string|null;onConsumed:()=>void;navigate:(view:PublicationDestination)=>void;children:ReactNode
}) {
  const [build,setBuild]=useState<number|null>(platform==='ios'?null:publicationBuild());
  useEffect(()=>{if(platform==='ios')void import('../notifications/push').then(m=>m.readNativeBuild()).then(setBuild).catch(()=>setBuild(1));},[]);
  const [items,setItems]=useState<Publication[]>([]);
  const [selected,setSelected]=useState<Publication|null>(null);
  const [dismissed,setDismissed]=useState<string[]>([]);
  const [unavailable,setUnavailable]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const selectedId=useRef<string|null>(null);
  selectedId.current=selected?.id??null;
  const callback=useRef(onConsumed);callback.current=onConsumed;
  const route=useRef(navigate);route.current=navigate;
  useEffect(()=>{
    let active=true,reading=false,dirty=false;
    if(!enabled || !cloud || build===null) return;
    async function sync(){
      if(!cloud || !active || document.hidden) return;
      if(reading){dirty=true;return;}
      reading=true;
      try {
        if((await cloudSessionId())!==owner) return;
        const requestedId=openedId??selectedId.current;
        const {data,error}=await cloud.rpc('wudayn_publications',{platform,build,opened:requestedId});
        if(!active) return;
        if(error || !Array.isArray(data)){setUnavailable(!!openedId);return;}
        const rows=data as Publication[];
        setItems(rows);setUnavailable(false);
        if(openedId){
          const entry=rows.find(row=>row.id===openedId);
          if(entry?.destination && owner) route.current(entry.destination);
          else if(entry) setSelected(entry);
          else setUnavailable(true);
          callback.current();
        }else setSelected(last=>last && last.id===requestedId ? rows.find(r=>r.id===last.id)??null : last);
      }catch{if(active && openedId)setUnavailable(true);}
      finally{reading=false;if(active && dirty){dirty=false;void sync();}}
    }
    void sync();
    let timerRefresh:number|undefined;
    const channel=cloud.channel('wudayn:publications').on('broadcast',{event:'refresh'},()=>{
      if(timerRefresh!==undefined) return;
      timerRefresh=window.setTimeout(()=>{timerRefresh=undefined;void sync();},80);
    }).on('broadcast',{event:'registration-phase'},()=>{ if(active){ void sync(); if(owner) window.dispatchEvent(new Event('wudayn:registration-phase')); } }).subscribe();
    const timer=window.setInterval(()=>{setSelected(row=>row&&Date.parse(row.expires)<=Date.now()?null:row);setItems(rows=>rows.filter(r=>Date.parse(r.expires)>Date.now()));void sync();},30000);
    document.addEventListener('visibilitychange',sync);
    return ()=>{active=false;clearInterval(timer);clearTimeout(timerRefresh);void cloud?.removeChannel(channel);document.removeEventListener('visibilitychange',sync);};
  },[owner,enabled,openedId,build]);
  useEffect(()=>{
    if(!selected || !dialog.current) return;
    const el=dialog.current;
    el.showModal();
    el.querySelector<HTMLElement>('#wd-publication-title')?.focus({preventScroll:true});
    return ()=>el.close();
  },[selected?.id]);
  function read(row:Publication){
    setSelected(row);
    if(owner) void cloud?.rpc('wudayn_publications',{platform,build,opened:row.id}).then(({error})=>{
      if(!error)setItems(old=>old.map(item=>item.id===row.id?{...item,opened:true}:item));
    });
  }
  const activeItems=enabled?items.filter(row=>Date.parse(row.expires)>Date.now()):[];
  const registration = (screen === 'welcome' || screen === 'register') && activeItems.find(row=>row.placement==='setting' && row.key==='registration.phase');
  const banner=activeItems.find(item=>item.placement==='banner' && [screen,'all'].includes(item.screen) && !dismissed.includes(item.id));
  const feed=activeItems.filter(item=>screen==='inbox'?['news','inbox'].includes(item.placement):screen==='settings'&&item.placement==='news');
  const unread = feed.filter(row => !row.opened).length;
  return <PublicationContext.Provider value={activeItems}>
    {registration && <aside className="wd-pub-banner" aria-label={registration.title}>
      <div className="wd-pub-banner-copy wd-phase-copy"><strong>{registration.title}</strong><span>{registration.body}</span></div>
    </aside>}
    {banner && <aside className="wd-pub-banner" aria-label="تنويه من وُدَين">
      <button className="wd-pub-banner-copy" onClick={()=>read(banner)}><strong>{banner.title}</strong><span>{banner.body}</span></button>
      <button className="wd-pub-dismiss" onClick={()=>setDismissed(old=>[...old,banner.id])} aria-label="إخفاء التنويه"><X size={16}/></button>
    </aside>}
    {feed.length>0 && <section className="wd-pub-feed" aria-label="جديد وُدَين">
      <details>
        <summary><Bell size={19}/><strong>جديد وُدَين</strong>
          {unread > 0 && <small>{new Intl.NumberFormat('ar-SA').format(unread)} غير مقروء</small>}
          <ChevronDown className="wd-pub-disclosure" size={16}/>
        </summary>
        {feed.map(row=><button className="wd-pub-row" key={row.id} onClick={()=>read(row)} data-unread={!row.opened || undefined}>
          <span>{row.title}</span><ChevronLeft size={16}/>
        </button>)}
      </details>
    </section>}
    {unavailable && <div className="wd-pub-banner" role="status">تعذّر عرض هذا التحديث الآن.<button className="wd-pub-dismiss" onClick={()=>{setUnavailable(false);callback.current();}} aria-label="إغلاق"><X size={15}/></button></div>}
    {children}
    {selected && <dialog ref={dialog} className="wd-notice-sheet wd-pub-detail" aria-labelledby="wd-publication-title" onCancel={()=>setSelected(null)}>
      <NoticeHeader sender="من فريق وُدَين" issuedAt={selected.stamp} onClose={()=>setSelected(null)}/>
      <article className="wd-pub-story">
        <h2 id="wd-publication-title" tabIndex={-1}>{selected.title}</h2>
        <p className="wd-notice-copy" dir="auto">{selected.body}</p>
      </article>
      {selected.destination && owner && <button className="f-primary wd-pub-action" onClick={()=>{if(selected.destination)navigate(selected.destination);setSelected(null);}}>
        فتح {({discover:'الاستكشاف',settings:'الإعدادات',membership:'العضوية',inbox:'الإشعارات',application:'التسجيل'})[selected.destination]}<ArrowLeft size={18}/>
      </button>}
    </dialog>}
  </PublicationContext.Provider>;
}
