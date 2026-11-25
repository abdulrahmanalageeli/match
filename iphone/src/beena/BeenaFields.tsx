import {useId} from 'react';
import {HeartHandshake,Trash2} from '../BrandIcons';
import {beenaScenarios,beenaVersion,type BeenaProfile} from './model';
import {SheetChoiceSelect} from '../ui/SheetChoiceSelect';
import './beena.css';

export function BeenaFields({value,onChange,storyReview=true,registration=false}: {
 value?:BeenaProfile|null; onChange:(value:BeenaProfile|null)=>void; storyReview?:boolean;registration?:boolean;remainingOnly?:boolean;
}) {
 const id=useId();
 const number=new Intl.NumberFormat('ar-SA',{numberingSystem:'arab'});
 const current=():BeenaProfile=>value??{version:beenaVersion,answers:{}};
 function changeStory(patch:Partial<NonNullable<BeenaProfile['story']>>){
  onChange({...current(),story:{scenarioId:beenaScenarios[0].id,text:'',share:false,...value?.story,...patch}});
 }
 function clearStory(){const next={...current()};delete next.story;onChange(next);}
 return <section className="bn-fields" aria-label="بيننا: سؤال وجواب اختياري" data-field="beena" tabIndex={-1}>
  {!registration&&<header className="bn-intro"><span className="bn-emblem" aria-hidden="true"><HeartHandshake size={25} strokeWidth={1.4}/></span><div><span className="bn-eyebrow">بيننا · اختياري</span><h2>سؤال يفتح بابًا للحوار.</h2><p>اختر سؤالًا وأجب بطريقتك.</p></div></header>}
  <article className="bn-story-editor">
      <SheetChoiceSelect label="اختر السؤال" value={value?.story?.scenarioId ?? beenaScenarios[0].id} options={beenaScenarios.map(entry=>({value:entry.id,label:entry.title}))} onChange={scenarioId=>changeStory({scenarioId})}/>
      <h3 className="bn-qa-question" >{beenaScenarios.find(entry=>entry.id===(value?.story?.scenarioId??beenaScenarios[0].id))?.prompt}</h3>
      <label htmlFor={id + '-story'}>إجابتك<textarea id={id + '-story'} value={value?.story?.text ?? ''} rows={3} maxLength={1000} onChange={event => changeStory({ text: Array.from(event.target.value).slice(0, 500).join('') })} placeholder="جملة أو اثنتان تعبّران عنك…" aria-describedby={id + '-story-help'}/></label>
      <div className="bn-story-count"><span>اختياري</span><span>{number.format(Array.from(value?.story?.text ?? '').length)} / ٥٠٠</span></div>
      <label className="bn-share"><input type="checkbox" checked={value?.story?.share === true} onChange={event => changeStory({ share: event.target.checked })}/><span><strong>أعرض السؤال وإجابتي في ملفي</strong></span></label>
      <p className="bn-story-help" id={id + '-story-help'}>تجنّب أسماء الآخرين وبيانات التواصل والتفاصيل الحساسة.</p>
      {storyReview && <details className="bn-qa-publishing"><summary>كيف تظهر الإجابة في ملفي؟</summary><p className="bn-story-help">نشر إجابة جديدة يتطلب مراجعة الملف. إن كان ملفك معتمدًا، يتوقف ظهوره والتواصل مؤقتًا حتى اعتماد التحديث؛ تبقى التوافقات محفوظة. حفظ الإجابة دون مشاركة لا يغيّر حالة ملفك.</p></details>}
      {value?.story && <button type="button" className="bn-clear" onClick={clearStory}><Trash2 size={14}/> حذف الإجابة من المسودة</button>}
  </article>
 </section>;
}
