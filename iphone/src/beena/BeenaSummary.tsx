import {useId} from 'react';
import {MessageCircle} from '../BrandIcons';
import {beenaScenarios,type SharedBeenaStory} from './model';
import './beena.css';

/** Only explicitly shared profile Q&A belongs here; Beena is not a third score. */
export function BeenaSummary({story}:{story?:SharedBeenaStory}) {
 const id=useId();
 if(!story?.text.trim())return null;
 return <section className="bn-public-qa" aria-labelledby={id}><h3 id={id}><MessageCircle size={16} aria-hidden="true"/>بيننا · سؤال وجواب</h3><p className="bn-qa-question">{beenaScenarios.find(item=>item.id===story.scenarioId)?.prompt??'ما الذي تود مشاركته عن نفسك؟'}</p><p className="bn-qa-answer" dir="auto">{story.text}</p></section>;
}
