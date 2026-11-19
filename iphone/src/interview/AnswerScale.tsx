import { useId, useRef, useState } from 'react';
import './answer-scale.css';

export function AnswerScale({ label, value, options, onChange, disabled = false, deliberate = false }: {
  label: string;
  value?: string;
  options: readonly { code: string; label: string }[];
  onChange: (code: string) => void;
  disabled?: boolean;
  deliberate?: boolean;
}) {
  const id = useId();
  const selected = options.findIndex(option => option.code === value);
  const [preview, setPreview] = useState<number>();
  const pointer = useRef<number | null>(null);
  const position = preview ?? (selected < 0 ? Math.floor(options.length / 2) : selected);
  const displayed = preview ?? selected;
  function commit(index: number) {
    setPreview(undefined);
    onChange(options[index].code);
  }
  return <div className="wi-answer-scale" data-answered={selected >= 0}>
    <output id={id} aria-live="polite">{displayed < 0 ? 'حرّك المؤشر إلى الدرجة الأقرب لك' : options[displayed].label}</output>
    <div className="wi-answer-scale-track">
      <div className="wi-answer-scale-stops" aria-hidden="true">{options.map(option => <i key={option.code} data-selected={option.code === value}/>)}</div>
      <input type="range" aria-label={label} aria-describedby={deliberate ? id + ' ' + id + '-hint' : id} aria-valuetext={displayed < 0 ? 'لم تحدد إجابتك بعد' : options[displayed].label}
        min={0} max={options.length - 1} step={1} value={position} disabled={disabled}
        onChange={event => deliberate ? setPreview(Number(event.target.value)) : commit(Number(event.target.value))}
        onPointerDown={event => { if (event.isPrimary) pointer.current = event.pointerId; }}
        onPointerCancel={() => { pointer.current = null; setPreview(undefined); }}
        onPointerUp={event => {
          if (!disabled && (!deliberate || pointer.current === event.pointerId)) commit(Number(event.currentTarget.value));
          pointer.current = null;
        }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); commit(position); } }}/>
    </div>
    <div className="wi-answer-scale-ends" aria-hidden="true"><span>{options[0].label}</span><span>{options.at(-1)?.label}</span></div>
    {deliberate && <small id={id + '-hint'}>بالأسهم اختر الدرجة ثم اضغط إدخال لاعتمادها.</small>}
    {deliberate && preview !== undefined && <button type="button" className="wi-link" disabled={disabled} onClick={() => commit(position)}>اعتماد الدرجة</button>}
  </div>;
}
