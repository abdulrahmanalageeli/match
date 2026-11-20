import { BookOpen, Check, ChevronDown, HeartHandshake, LockKeyhole, MessageCircle, MessageSquareText, UsersRound } from '../BrandIcons';
import { useId, type ReactNode } from 'react';
import './feedback-window.css';

type WindowProps = {
  period: string; title: string; note: string; symbol: 'first' | 'return' | 'step' | 'season' | 'year';
  children: ReactNode; expanded?: boolean;
};

const windowIcons = { first: MessageCircle, return: MessageSquareText, step: UsersRound, season: BookOpen, year: HeartHandshake };

export function FeedbackWindow({ period, title, note, symbol, children, expanded }: WindowProps) {
  const Icon = windowIcons[symbol];
  return <details className="wf-window" data-symbol={symbol} open={expanded}>
    <summary>
      <span className="wf-seal"><Icon size={22}/></span>
      <span className="wf-heading"><small>{period}</small><strong>{title}</strong></span>
      <ChevronDown className="wf-chevron" size={18} aria-hidden="true"/>
    </summary>
    <div className="wf-body">
      <p className="wf-note"><LockKeyhole size={15} aria-hidden="true"/>{note}</p>
      {children}
    </div>
  </details>;
}

export function FeedbackChoice({ label, choices, value, change }: {
  label: string; choices: readonly string[]; value?: string; change: (value: string) => void;
}) {
  const name = useId();
  return <fieldset className="wf-choice"><legend>{label}</legend><div className="wf-options">
    {choices.map(choice => <label key={choice}>
      <input type="radio" name={name} checked={value === choice} onChange={() => change(choice)}/>
      <span><i aria-hidden="true">{value === choice && <Check size={12}/>}</i>{choice}</span>
    </label>)}
  </div></fieldset>;
}
