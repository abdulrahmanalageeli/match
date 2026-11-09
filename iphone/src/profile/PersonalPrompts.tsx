import { useId, useState } from 'react';
import { ChevronDown, Feather } from "../BrandIcons";
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { answeredProfilePrompts, type ProfilePromptAnswers } from './profilePrompts';
import './profile-prompts.css';

export function PersonalPrompts({ answers }: { answers: ProfilePromptAnswers }) {
  const [expanded, setExpanded] = useState(false);
  const moreId = useId();
  const prompts = answeredProfilePrompts(answers);
  if (!prompts.length) return null;
  const card = (prompt: typeof prompts[number]) => <section className="mp-prompt-card" key={prompt.key}>
    <h3><Feather size={15} aria-hidden="true"/>{prompt.title}</h3><p dir="auto">{prompt.answer}</p>
  </section>;
  return <section className="mp-personal-prompts" aria-label="ملامح من حكايتي">
    <div className="mp-prompts-heading"><span aria-hidden="true"/><h2>ملامح من حكايتي</h2><small>بكلماتي</small></div>
    {prompts.slice(0, 2).map(card)}
    {prompts.length > 2 && <>
      <MotionPressButton className="mp-prompts-toggle" aria-expanded={expanded} aria-controls={moreId} onClick={() => setExpanded(value => !value)}>{expanded ? 'عرض أقل' : 'أكثر عمّا يهمّني'}<ChevronDown size={16} aria-hidden="true"/></MotionPressButton>
      <div id={moreId}>{expanded && <MotionReveal duration={260} distance={6}>{prompts.slice(2).map(card)}</MotionReveal>}</div>
    </>}
  </section>;
}
