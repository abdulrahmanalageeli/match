import { useId, useState } from 'react';
import { ArrowRight, ChevronDown, LockKeyhole, Pencil } from '../BrandIcons';
import { profileField } from './profileCapture';
import prompts from './refinement-prompts.json';
import type { InterviewStatement } from './types';
import './private-memory.css';

export type RefinementTopic = 'height' | 'age' | 'timeline';
export type Refinement = { min?: number; max?: number } | { value: string } | { approximate: true };
type Refinable = InterviewStatement & { topic: RefinementTopic };
const sections = [['self', 'عنّي'], ['partner', 'ما أتمناه في شريكي'], ['intent', 'عن الزواج']] as const;
const digits = (value: string) => value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
const numeric = (value: string) => value === '' ? undefined : /^[0-9]{1,3}$/.test(digits(value)) ? Number(digits(value)) : NaN;

function RefinePreference({ statement, disabled, save }: {
  statement: Refinable; disabled: boolean; save: (topic: RefinementTopic, choice: Refinement) => void;
}) {
  const { topic, quote } = statement;
  const [editing, setEditing] = useState(false);
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [when, setWhen] = useState('');
  const id = useId();
  const field = profileField(topic === 'height' ? 'partnerCriteria.height' : topic === 'age' ? 'preferredMinAge' : 'marriageBasics.marriageTimeline')!;
  const min = numeric(low), max = numeric(high);
  const unit = topic === 'height' ? 'سم' : 'سنة';
  const outOfRange = [min,max].some(n => n !== undefined && (!Number.isInteger(n) || n < field.min! || n > field.max!));
  const reversed = min !== undefined && max !== undefined && min > max;
  const error = outOfRange ? `النطاق المتاح من ${field.min!.toLocaleString('ar-SA')} إلى ${field.max!.toLocaleString('ar-SA')} ${unit}.`
    : reversed ? 'الحد الأعلى لازم يكون مساوي للحد الأدنى أو أكبر منه.' : '';
  const valid = topic === 'timeline' ? Boolean(when) : !error && (min !== undefined || max !== undefined);

  return <div className="wi-memory-refine" data-refine-topic={topic}>
    <div className="wi-refine-top"><p className="wi-refine-quote">من كلامك <q dir="auto">{quote}</q></p>
      {editing && <button className="wi-link" type="button" disabled={disabled} onClick={() => setEditing(false)}><ArrowRight size={13}/>رجوع للاختيارات</button>}
    </div>
    <p className="wi-refine-question" id={id}>{prompts[topic]}</p>
    {editing ? <form aria-labelledby={id} onSubmit={event => {
      event.preventDefault();
      if (!disabled && valid) save(topic, topic === 'timeline' ? { value: when } : { min, max });
    }}>
      {topic === 'timeline' ? <select aria-label="توقيت الزواج" value={when} onChange={e => setWhen(e.target.value)} disabled={disabled}>
        <option value="" disabled>اختر الوقت اللي يناسبك</option>{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select> : <>
        <div className="wi-refine-range">
          <label>من <span>{unit}</span><input type="text" inputMode="numeric" dir="ltr" aria-label={`الحد الأدنى (${unit})`} maxLength={3} value={low} onChange={e => setLow(e.target.value)} disabled={disabled}/></label>
          <label>إلى <span>{unit}</span><input type="text" inputMode="numeric" dir="ltr" aria-label={`الحد الأعلى (${unit})`} maxLength={3} value={high} onChange={e => setHigh(e.target.value)} disabled={disabled}/></label>
        </div>
        <small role="status" className="wi-refine-hint">{error || 'تقدر تحدد حد واحد أو الاثنين.'}</small>
      </>}
      <div className="wi-refine-actions"><button className="wi-button" type="submit" disabled={disabled || !valid}>حفظ في مسودة ملفي</button>
        <button className="wi-link" type="button" disabled={disabled} onClick={() => save(topic, { approximate: true })}>يكفيني الوصف</button></div>
    </form> : <div className="wi-refine-actions"><button className="wi-button" type="button" onClick={() => setEditing(true)} disabled={disabled}>
      {topic === 'timeline' ? 'أحدد الوقت' : 'أحدد النطاق'}</button>
      <button className="wi-link" type="button" disabled={disabled} onClick={() => save(topic, { approximate: true })}>يكفيني الوصف</button></div>}
  </div>;
}

export function PrivateMemory({ statements, suggestion, manualSuggestion, save, correct, disabled = false }: {
  statements: readonly InterviewStatement[]; suggestion?: Refinable; manualSuggestion?: Refinable;
  save?: (topic: RefinementTopic, choice: Refinement) => void; correct?: () => void; disabled?: boolean;
}) {
  if (!statements.length) return null;
  const preview = sections.flatMap(([subject]) => {
    const first = statements.find(item => item.subject === subject);
    return first ? [first.quote] : [];
  }).join(' · ');
  const count = statements.length;
  const detailCount = count === 1 ? 'تفصيل واحد' : count === 2 ? 'تفصيلان' :
    `${count.toLocaleString('ar-SA')} ${count <= 10 ? 'تفاصيل' : 'تفصيلًا'}`;
  const editor = (item: Refinable) => save && <RefinePreference key={item.turnId + item.topic} statement={item} disabled={disabled} save={save}/>;
  return <section className="wi-memory" aria-label="ما فهمته لونا من كلامك">
    <details className="wi-memory-recap">
      <summary><LockKeyhole size={14} aria-hidden="true"/><span className="wi-memory-heading"><strong>من كلامك مع لونا</strong>
        <span className="wi-memory-preview" aria-hidden="true">{preview}</span></span>
        <small>{detailCount}</small><ChevronDown size={15} aria-hidden="true"/></summary>
      <dl>{sections.map(([subject, label]) => {
        const items = statements.filter(item => item.subject === subject);
        return items.length ? <div key={subject}><dt>{label}</dt><dd>{items.map((item, i) => <span key={item.turnId + item.topic + i}>
          {i > 0 && <span className="wi-memory-separator"> · </span>}<q dir="auto">{item.quote}</q>
        </span>)}</dd></div> : null;
      })}</dl>
      {correct && <button className="wi-link" type="button" disabled={disabled} onClick={correct}><Pencil size={13}/>أوضّح كلامي للونا</button>}
      {!suggestion && manualSuggestion && editor(manualSuggestion)}
    </details>
    {suggestion && editor(suggestion)}
  </section>;
}
