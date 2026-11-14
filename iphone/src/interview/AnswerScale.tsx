import { useId } from 'react';
import './answer-scale.css';

export function AnswerScale({ label, value, options, onChange, disabled = false }: {
  label: string;
  value?: string;
  options: readonly { code: string; label: string }[];
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const selected = options.findIndex(option => option.code === value);
  const position = selected < 0 ? Math.floor(options.length / 2) : selected;
  const commit = (index: number) => onChange(options[index].code);
  return <div className="wi-answer-scale" data-answered={selected >= 0}>
    <output id={id} aria-live="polite">{selected < 0 ? 'حرّك المؤشر إلى الدرجة الأقرب لك' : options[selected].label}</output>
    <div className="wi-answer-scale-track">
      <div className="wi-answer-scale-stops" aria-hidden="true">{options.map(option => <i key={option.code} data-selected={option.code === value}/>)}</div>
      <input type="range" aria-label={label} aria-describedby={id} aria-valuetext={selected < 0 ? 'لم تحدد إجابتك بعد' : options[selected].label}
        min={0} max={options.length - 1} step={1} value={position} disabled={disabled}
        onChange={event => commit(Number(event.target.value))}
        onPointerUp={event => { if (!disabled) commit(Number(event.currentTarget.value)); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); commit(position); } }}/>
    </div>
    <div className="wi-answer-scale-ends" aria-hidden="true"><span>{options[0].label}</span><span>{options.at(-1)?.label}</span></div>
  </div>;
}
