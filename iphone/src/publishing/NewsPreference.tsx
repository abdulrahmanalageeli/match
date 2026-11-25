import { useEffect, useState } from 'react';
import { callRpc } from '../cloud';
export function NewsPreference({owner}:{owner:string}) {
  const [choice,setChoice]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let live=true;void callRpc<boolean>('wudayn_news_preference',{},owner).then(value=>{if(live)setChoice(value);}).catch(()=>{if(live)setError('تعذّر تحميل التفضيل.');});return()=>{live=false;};},[owner]);
  async function change(){
    setBusy(true);setError('');
    try{setChoice(await callRpc<boolean>('wudayn_news_preference',{choice:!choice},owner));}
    catch{setError('تعذّر حفظ التفضيل. حاول مجددًا.');}finally{setBusy(false);}
  }
  return <><button type="button" className="st-row st-switch" role="switch" aria-checked={choice===true} disabled={busy||choice===null} onClick={()=>void change()}>
    <span className="st-row-copy"><strong>إشعارات أخبار وُدَين وعروضها</strong></span><span className="st-switch-track" aria-hidden="true"><i/></span>
  </button>{error&&<p className="st-notice" role="status">{error}</p>}</>;
}
