import {useId} from 'react';
import {MessageCircle} from '../BrandIcons';
import {beenaScenarios,type SharedBeenaStory} from './model';
import './beena.css';

/** Only explicitly shared profile Q&A belongs here; Beena is not a third score. */
export function BeenaSummary({story, name}:{story?:SharedBeenaStory; name:string}) {
  const id = useId();
  if (!story?.text.trim()) return null;
  const question = beenaScenarios.find(item => item.id === story.scenarioId)?.prompt ?? 'ما الذي تود مشاركته عن نفسك؟';
  return <section className="bn-public-qa" aria-labelledby={id}>
    <header className="bn-interview-heading">
      <MessageCircle size={16} aria-hidden="true"/>
      <h3 id={id}>بيننا</h3>
      <span>سؤال وجواب</span>
    </header>
    <h4 className="bn-qa-question">{question}</h4>
    <figure className="bn-interview-reply">
      <figcaption><span aria-hidden="true">❝</span><bdi>{name}</bdi></figcaption>
      <blockquote className="bn-qa-answer" dir="auto">{story.text}</blockquote>
    </figure>
  </section>;
}
