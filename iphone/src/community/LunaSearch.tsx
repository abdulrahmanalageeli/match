import {useEffect, useRef, useState} from 'react';
import {Search, Sparkles, ArrowRight, LockKeyhole} from '../BrandIcons';
import {useMembershipAccess} from '../membership/access';
import type {LunaResults} from './lunaSearchClient';
import type {CommunitySource, PublicPerson} from './data';
import './luna-search.css';

export function LunaSearch({source,open}:{source:CommunitySource;open:(person:PublicPerson)=>void}) {
  const {tier,upgrade}=useMembershipAccess();
  const [expanded,setExpanded]=useState(false),[query,setQuery]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<LunaResults|null>(null);
  const sequence=useRef(0),lock=useRef(false);
  useEffect(()=>{sequence.current++;setResult(null);setBusy(false);lock.current=false;return()=>{sequence.current++;};},[source,tier]);
  async function search() {
    if(lock.current || !source.lunaSearch || tier!=='seriousness') return;
    lock.current=true;setBusy(true);setError('');setResult(null);
    const ticket=++sequence.current;
    try {const next=await source.lunaSearch(query);if(ticket===sequence.current)setResult(next);}
    catch(problem){if(ticket===sequence.current)setError(problem instanceof Error?problem.message:'تعذّر البحث.');}
    finally{if(ticket===sequence.current){lock.current=false;setBusy(false);}}
  }
  return <section className="luna-search" aria-label="البحث مع لونا">
    <button className="luna-search-entry" type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
      <span className="luna-search-orb"><Sparkles size={22}/></span><span><strong>ابحث مع لونا</strong><small>صف الشخص الذي تتمنى التعرف عليه</small></span>{tier==='seriousness'?<Search size={19}/>:<LockKeyhole size={19}/>}
    </button>
    {expanded&&<div className="luna-search-conversation">
      <p className="luna-search-greeting">ما الذي يهمّك في شريك حياتك؟</p>
      {tier!=='seriousness'?<div className="luna-search-upgrade"><p>بحث يفهم تفضيلاتك ضمن كل الملفات المؤهلة للظهور، مع وسام الجدية.</p><button className="f-primary" onClick={upgrade}>اكتشف وسام الجدية</button></div>:!source.lunaSearch?<p role="status">البحث متاح عند تسجيل الدخول بحساب عضوية حقيقي.</p>:<>
        <form onSubmit={event=>{event.preventDefault();void search();}}>
          <label htmlFor="luna-discovery-query">تفضيلاتك</label>
          <textarea id="luna-discovery-query" rows={4} maxLength={600} minLength={3} required value={query} disabled={busy} onChange={event=>setQuery(event.target.value)} placeholder="مثلًا: من الرياض، العمر بين ٢٧ و٣٤، لا يدخن ويحب القراءة والحياة الهادئة…"/>
          <div className="luna-search-compose"><small>{query.length} / 600</small><button disabled={busy||query.trim().length<3} type="submit"><Sparkles size={16}/>{busy?'لونا تبحث…':'ابحثي لي'}</button></div>
        </form>
        <p className="luna-search-privacy">يُرسل وصف بحثك إلى لونا لفهمه. تبحث في المعلومات المتاحة لك في الملفات. حتى ٣٠ بحثًا يوميًا.</p>
        {error&&<p role="alert" className="flow-error">{error}</p>}
        {busy&&<p role="status" className="luna-search-loading">أرتّب تفضيلاتك وأبحث في الملفات المؤهلة…</p>}
        {result&&<div className="luna-search-results" aria-live="polite"><p>{result.summary}</p>
          <div className="luna-search-criteria">{result.criteria.map((item,index)=><span key={index}>{item.kind==='must'?'شرط · ':item.kind==='exclude'?'استبعاد · ':'تفضيل · '}{item.label}</span>)}</div>
          <p className="luna-search-privacy">الترتيب حسب مطابقة الوصف ثم التوافق. المعلومات غير المذكورة تحتاج سؤال صاحب الملف.</p>
          {result.people.length===0?<p>لم أجد ملفات بهذه الشروط. يمكنك تعديل وصفك والمحاولة مجددًا.</p>:<><h3>أقرب الملفات لبحثك{result.people.length===24?' · أول ٢٤ نتيجة':''}</h3>{result.people.map(person=><button key={person.id} type="button" className="luna-search-person" onClick={()=>open(person)}><span><strong>{person.alias}</strong><small>{person.age} عامًا · {person.city} · {person.occupation}</small></span><ArrowRight size={18}/></button>)}</>}
        </div>}
      </>}
    </div>}
  </section>;
}
