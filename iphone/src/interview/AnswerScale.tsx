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
  return <fieldset className="wi-answer-scale" disabled={disabled} aria-label={label}>
    {options.map(option => <label key={option.code}>
      <input type="radio" name={id} value={option.code} checked={value === option.code}
        onChange={() => onChange(option.code)}/>
      <span>{option.label}</span>
    </label>)}
  </fieldset>;
}
