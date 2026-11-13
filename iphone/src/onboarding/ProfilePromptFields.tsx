import { useEffect, useId, useState } from 'react';
import { Check, Feather } from "../BrandIcons";
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { profilePrompts, answeredProfilePrompts, type ProfilePromptAnswers, type ProfilePromptKey } from '../profile/profilePrompts';
import '../profile/profile-prompts.css';

export function ProfilePromptFields({ answers, update, invalidField, required = false }: {
  answers: ProfilePromptAnswers; update: (value: ProfilePromptAnswers) => void; invalidField?: string; required?: boolean;
}) {
  const [selected, setSelected] = useState<ProfilePromptKey>(() => profilePrompts.find(prompt => !answers[prompt.key]?.trim())?.key ?? 'lookingFor');
  const id = useId();
  useEffect(() => { if (profilePrompts.some(prompt => prompt.key === invalidField)) setSelected(invalidField as ProfilePromptKey); }, [invalidField]);
  const prompt = profilePrompts.find(item => item.key === selected)!;
  const value = answers[selected] ?? '';
  const answeredCount=answeredProfilePrompts(answers).length;
  return <section className="nf-prompt-editor" aria-label="أسئلة تضيف لحكايتك">
    <header><span><Feather size={17} aria-hidden="true"/><strong>تفاصيل تشبهك</strong></span><span className="nf-prompt-progress" aria-label={`${new Intl.NumberFormat('ar-SA').format(answeredCount)} من ٣ مكتملة`}>{profilePrompts.map((item,index)=><i key={item.key} data-done={index<answeredCount||undefined}/>)}<b>{new Intl.NumberFormat('ar-SA').format(answeredCount)} / ٣</b></span></header>
    <p className="nf-prompt-note">{required ? 'ثلاث لمحات عنك. جملة أو اثنتان لكل منها تكفي.' : 'اختياري · أجب عن سؤال يعبّر عنك، بجملة أو اثنتين.'} تظهر إجاباتك في ملفك.</p>
    <div className="nf-prompt-choices" role="group" aria-label="اختر سؤالًا">
      {profilePrompts.map(item => <MotionPressButton key={item.key} aria-pressed={selected === item.key} aria-controls={`${id}-editor`} onClick={() => setSelected(item.key)}>{item.title}{answers[item.key]?.trim() && <Check size={13} aria-label="أُجيب عنه"/>}</MotionPressButton>)}
    </div>
    <MotionReveal id={`${id}-editor`} className="nf-prompt-writing" key={selected} duration={240} distance={5}>
      <label htmlFor={`${id}-${selected}`}>{prompt.question}</label><p id={`${id}-hint`}>{prompt.hint}</p>
      <textarea id={`${id}-${selected}`} data-field={selected} value={value} onChange={event => update({ [selected]: event.target.value })} maxLength={600} rows={3} placeholder={prompt.placeholder} aria-invalid={invalidField === selected || undefined} aria-describedby={`${id}-hint${invalidField === selected ? ' nf-intake-error' : ''}`} dir="auto"/>
      <small className="nf-prompt-counter">{new Intl.NumberFormat('ar-SA').format(value.length)} / ٦٠٠ · {required ? 'بكلماتك، دون إجابة مثالية' : 'يمكنك تركها فارغة أو تعديلها لاحقًا'}</small>
    </MotionReveal>
    <small className="nf-prompt-privacy">شارك ما ترتاح لظهوره؛ تجنّب أرقام التواصل والتفاصيل التي تفضّل إبقاءها خاصة.</small>
  </section>;
}
