import {useEffect, useRef, useState} from 'react';
import {Search, Sparkles, ArrowRight, LockKeyhole} from '../BrandIcons';
import {useMembershipAccess} from '../membership/access';
import type {LunaResults} from './lunaSearchClient';
import type {CommunitySource, Filters, PublicPerson} from './data';
import './luna-search.css';

export function LunaSearch({source,filters,open}:{source:CommunitySource;filters:Filters;open:(person:PublicPerson,mode:Filters['mode'])=>void}) {
  const {tier,upgrade}=useMembershipAccess();
  const [expanded,setExpanded]=useState(false),[query,setQuery]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<LunaResults|null>(null);
  const sequence=useRef(0),lock=useRef(false);
  const scope=JSON.stringify(filters);
  useEffect(()=>{
    function clear(){sequence.current++;lock.current=false;setResult(null);setBusy(false);setError('');}
    clear();
    return ()=>{sequence.current++;};
  },[source,tier,scope]);
  const options=result?.options;
  useEffect(()=>{
    if(!options)return;
    let revision=0;
    const refresh=async()=>{
      const token=++revision;
      try {
        const people=await source.discover(options);
        if(token===revision)setResult(current=>current?.options===options?{...current,people}:current);
      } catch {
        if(token===revision){setResult(null);setError('تعذّر تحديث أهلية النتائج. أعد البحث.');}
      }
    };
    const stop=source.watch(()=>void refresh());
    return ()=>{revision++;stop();};
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
        next={...result,options,people:await source.discover(options)};
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
  return <section className="luna-search" aria-label="البحث مع لونا">
    <button className="luna-search-entry" type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
      <span className="luna-search-orb"><Sparkles size={22}/></span><span><strong>ابحث مع لونا</strong></span>{tier==='seriousness'?<Search size={19}/>:<LockKeyhole size={19}/>}
    </button>
    {expanded&&<div className="luna-search-conversation">
      {tier!=='seriousness'?<div className="luna-search-upgrade"><p>البحث حسب الوصف متاح مع وسام الجدية.</p><button className="f-primary" onClick={()=>upgrade("seriousness")}>اكتشف وسام الجدية</button></div>:!source.lunaSearch?<p role="status">البحث متاح عند تسجيل الدخول بحساب عضوية حقيقي.</p>:<>
        <form onSubmit={event=>{event.preventDefault();void search();}}>
          <label htmlFor="luna-discovery-query">تفضيلاتك</label>
          <textarea id="luna-discovery-query" rows={2} maxLength={600} minLength={3} required value={query} disabled={busy} onChange={event=>setQuery(event.target.value)} placeholder="مثلًا: شخص من الرياض ذكر التصوير في نبذته"/>
          <div className="luna-search-compose"><small>{query.length} / 600</small><button disabled={busy||query.trim().length<3} type="submit"><Sparkles size={16}/>{busy?'لونا تبحث…':'بحث'}</button></div>
        </form>
        <p className="luna-search-privacy">تبحث لونا ضمن التبويب والفلاتر الحالية وشروط الطرفين · ٣٠ بحثًا يوميًا</p>
        {error&&<p role="alert" className="flow-error">{error}</p>}
        {busy&&<p role="status" className="luna-search-loading">أرتّب تفضيلاتك وأبحث في الملفات المؤهلة…</p>}
        {result&&<div className="luna-search-results" aria-live="polite"><p>{result.summary}</p>
          <p className="luna-search-privacy">{result.options.mode==='recommended'?'ضمن الترشيحات':'ضمن جميع الملفات المؤهلة'}</p>
          <div className="luna-search-criteria">{result.criteria.map((item,index)=><span key={index}>{item.kind==='must'?'شرط · ':item.kind==='exclude'?'استبعاد · ':'تفضيل · '}{item.label}</span>)}</div>
          <p className="luna-search-privacy">{filters.sort==='youngest'||filters.sort==='oldest'?'الترتيب حسب العمر الذي اخترته، ثم مطابقة الوصف والتوافق.':'الترتيب حسب مطابقة الوصف ثم التوافق.'} تُطبّق الشروط الإلزامية على المعلومات المصرّح بها.</p>
          {result.people.length===0?<><p>لم أجد ملفًا يحقق وصفك والفلاتر الحالية وشروط الطرفين.</p>
            {result.options.mode==='recommended'&&<button className="btn-secondary" type="button" onClick={()=>void search(true)}>ابحث في جميع الملفات المؤهلة</button>}
          </>:<><h3>أقرب الملفات لبحثك{result.people.length===24?' · أول ٢٤ نتيجة':''}</h3>{result.people.map(person=><button key={person.id} type="button" className="luna-search-person" onClick={()=>open(person,result.options.mode)}><span><strong>{person.alias}{person.isDemo?' · تجريبي':''}</strong><small>{person.age} عامًا · {person.city} · {person.occupation}</small></span><ArrowRight size={18}/></button>)}</>}
        </div>}
      </>}
    </div>}
  </section>;
}
