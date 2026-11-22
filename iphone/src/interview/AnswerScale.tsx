import { useId, type CSSProperties } from 'react';
import './answer-scale.css';

const arabicNumber = new Intl.NumberFormat('ar-SA', { useGrouping: false });

export function AnswerScale({ label, value, options, onChange, disabled = false }: {
  label: string;
  value?: string;
  options: readonly { code: string; label: string }[];
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const selected = options.find(option => option.code === value);
  const scaleStyle = { '--wi-answer-count': options.length } as CSSProperties;
  return <fieldset className="wi-answer-scale" disabled={disabled} aria-label={label} style={scaleStyle}>
    <p className="wi-answer-scale-reading" aria-live="polite">
      <span>{selected ? 'اختيارك' : 'اختر الدرجة الأقرب إليك'}</span>
      {selected && <strong>{selected.label}</strong>}
    </p>
    <div className="wi-answer-scale-options">
      {options.map((option, index) => <label key={option.code} data-selected={value === option.code || undefined}>
        <input type="radio" name={id} value={option.code} checked={value === option.code}
          aria-label={`${arabicNumber.format(index + 1)} من ${arabicNumber.format(options.length)}: ${option.label}`}
          onChange={() => onChange(option.code)}/>
        <span aria-hidden="true">{arabicNumber.format(index + 1)}</span>
      </label>)}
    </div>
    {options.length > 1 && <div className="wi-answer-scale-anchors" aria-hidden="true">
      <span>{options[0].label}</span><span>{options[options.length - 1].label}</span>
    </div>}
  </fieldset>;
}
