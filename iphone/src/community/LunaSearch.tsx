import {useEffect, useId, useRef, useState} from 'react';
import {Sparkles, ChevronDown, ChevronLeft, LockKeyhole} from '../BrandIcons';
import {useMembershipAccess} from '../membership/access';
import type {LunaResults} from './lunaSearchClient';
import type {CommunitySource, Filters, PublicPerson} from './data';
import {nativePrivatePhoto} from './privatePhoto';
import {PersonAvatar} from '../avatars/PersonAvatar';
import './luna-search.css';

async function refreshCards(source:CommunitySource, options:LunaResults['options']) {
  const [people,{lunaResultCard}] = await Promise.all([source.discover(options),import('./lunaResultCard.mjs')]);
  return people.map(person=>lunaResultCard(person,options));
}

export function LunaSearch({source,filters,open}:{source:CommunitySource;filters:Filters;open:(person:PublicPerson,mode:Filters['mode'])=>void}) {
  const {tier,upgrade}=useMembershipAccess();
  const accessId=useId();
  const [expanded,setExpanded]=useState(false),[query,setQuery]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<LunaResults|null>(null);
  const sequence=useRef(0),lock=useRef(false);
  const [opening,setOpening]=useState<string|null>(null);
  const scope=JSON.stringify(filters);
  useEffect(()=>{
    function clear(){sequence.current++;lock.current=false;setResult(null);setBusy(false);setOpening(null);setError('');}
    clear();
    return ()=>{sequence.current++;};
  },[source,tier,scope]);
  const options=result?.options;
  useEffect(()=>{
    if(!options)return;
    let active=true, reading=false, queued=false;
    const refresh=async()=>{
      if (!active || document.hidden) return;
      if (reading) { queued=true; return; }
      reading=true; queued=false;
      try {
        const people=await refreshCards(source,options);
        if(active && !queued)setResult(current=>current?.options===options?{...current,people}:current);
      } catch {
        if(active && !queued){setResult(null);setError('ما قدرنا نتأكد من الملفات المتاحة لك الآن. جرّب البحث مرة ثانية.');}
      } finally {
        reading=false;
        if(active && queued)void refresh();
      }
    };
    const stop=source.watch(()=>void refresh(), 'nonChat');
    return ()=>{active=false;stop();};
  },[source,options]);
  async function search(allEligible=false) {
    if(lock.current || !source.lunaSearch || tier!=='seriousness') return;
    if(allEligible && (!result || result.options.mode!=='recommended' || result.people.length)) return;
    lock.current=true;setBusy(true);setError('');setResult(null);
    const ticket=++sequence.current;
    try {
      let next:LunaResults;
      if(allEligible && result) {
        const options={...result.options,mode:'all' as const,eligibleOnly:true,offset:0};
        next={...result,options,people:await refreshCards(source,options)};
      } else {
        next=await source.lunaSearch(query,filters);
      }
      if(ticket===sequence.current)setResult(next);
    } catch(problem) {
      if(ticket===sequence.current) {
        if(allEligible)setResult(result);
        setError(problem instanceof Error?problem.message:'تعذّر البحث.');
      }
    }
    finally{if(ticket===sequence.current){lock.current=false;setBusy(false);}}
  }
  async function openResult(id:string) {
    if (!result || lock.current) return;
    lock.current=true;
    const ticket=++sequence.current;
    setOpening(id);setError('');
    try {
      const people=await source.discover({...result.options,subjectId:id,offset:0});
      if(ticket!==sequence.current)return;
      const person=people.find(item=>item.id===id);
      if(person)open(person,result.options.mode);
      else {
        setResult(current=>current?{...current,people:current.people.filter(item=>item.id!==id)}:null);
        setError('هذا الملف لم يعد متاحًا.');
      }
    } catch {
      if(ticket===sequence.current)setError('تعذّر فتح الملف. حاول مجددًا.');
    } finally {
      if(ticket===sequence.current){setOpening(null);lock.current=false;}
    }
  }
  return <section className="luna-search" aria-label="البحث مع لونا">
    <button className="luna-search-entry" data-locked={tier!=='seriousness'||undefined} type="button" aria-label="ابحث مع لونا" aria-expanded={expanded} aria-describedby={tier!=='seriousness'?accessId:undefined} onClick={()=>{if(expanded){sequence.current++;lock.current=false;setOpening(null);setBusy(false);setResult(null);setError('');}setExpanded(value=>!value);}}>
      <span className="luna-search-signature">
        <img src="/brand/wudayn-emblem-v2.png" width="24" height="24" alt=""/>
        <strong>لونا</strong>
      </span>
      <span className="luna-search-prompt">وش يهمّك في شريك حياتك؟</span>
      {tier!=='seriousness'
        ? <span id={accessId} className="luna-search-access"><LockKeyhole size={12}/><span><span className="mi-sr-only">يتطلب </span>وسام الجدية</span></span>
        : <ChevronDown size={15} className="luna-search-chevron"/>}
    </button>
    {expanded&&<div className="luna-search-conversation">
      {tier!=='seriousness'?<div className="luna-search-upgrade"><p>البحث حسب الوصف متاح مع وسام الجدية.</p><button className="f-primary" onClick={()=>upgrade("seriousness")}>اكتشف وسام الجدية</button></div>:!source.lunaSearch?<p role="status">البحث متاح عند تسجيل الدخول بحساب عضوية حقيقي.</p>:<>
        <form onSubmit={event=>{event.preventDefault();void search();}}>
          <label htmlFor="luna-discovery-query">تفضيلاتك</label>
          <textarea id="luna-discovery-query" rows={2} maxLength={600} minLength={3} required value={query} disabled={busy||opening!==null} onChange={event=>{setQuery(event.target.value);setResult(null);setError('');}} placeholder="مثلًا: شخص من الرياض ذكر التصوير في نبذته"/>
          <div className="luna-search-compose"><small dir={query.length>530?'ltr':'rtl'}>{query.length>530?`${query.length} / 600`:'٣٠ بحثًا في اليوم'}</small><button disabled={busy||opening!==null||query.trim().length<3} type="submit"><Sparkles size={16}/>{busy?'لونا تبحث…':'بحث'}</button></div>
        </form>
        {error&&<p role="alert" className="flow-error">{error}</p>}
        {busy&&<p role="status" className="luna-search-loading">جارٍ البحث…</p>}
        {result&&<section className="luna-search-results" aria-live="polite" aria-label="نتائج البحث">
          <header><h3>{result.people.length?'ملفات تناسب بحثك':'ما لقينا ملف بهالوصف'}</h3>
            {result.people.length>0&&<small>{result.options.mode==='recommended'?'من ترشيحاتك':result.options.eligibleOnly?'ضمن جميع الملفات المؤهلة':'من اكتشف'}</small>}
          </header>
          {result.people.length===0
            ? <>{result.options.mode==='recommended'
              ? <button className="btn-secondary" type="button" onClick={()=>void search(true)}>ابحث في جميع الملفات المؤهلة</button>
              : <p>جرّب تبحث بتفاصيل أقل.</p>}</>
            : <ul>{result.people.map(person=><li key={person.id}>
                <button type="button" className="luna-search-person" aria-busy={opening===person.id||undefined} disabled={opening!==null} onClick={()=>void openResult(person.id)}>
                  <PersonAvatar person={person} source={source} protectedDiscovery={nativePrivatePhoto()} showMembership={false}/>
                  <span className="luna-result-copy"><strong>{person.alias}</strong>
                    <small>{person.matchReasons?.length ? person.matchReasons.join(' · ') : 'الملف ضمن نتائج بحثك، لكن تفاصيله الظاهرة ما توضّح السبب.'}</small>
                  </span>{opening===person.id?<small role="status">جارٍ الفتح…</small>:<ChevronLeft size={16} aria-hidden="true"/>}
                </button>
              </li>)}</ul>}
        </section>}
      </>}
    </div>}
  </section>;
}
