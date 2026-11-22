import { Fragment, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, X } from '../BrandIcons';
import type { InterviewProposal } from './types';
import type { openingHighlights } from './openingEvidence';
import './opening-words.css';

type Props = {
  text: string;
  highlights: ReturnType<typeof openingHighlights>;
  proposals: readonly InterviewProposal[];
  fields: readonly { id: string; label: string; options: readonly { code: string; label: string }[] }[];
  saved: Record<string, string[]>;
  renderChoice: (id: string) => ReactNode;
  onChoose: (id: string, code: string) => void;
  disabled: boolean;
};

export function OpeningWords({ text, highlights, proposals, fields, saved, renderChoice, onChoose, disabled }: Props) {
  const [activeStart, setActiveStart] = useState<number>();
  const trigger = useRef<HTMLSpanElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const editorId = useId();
  const active = highlights.find(item => item.start === activeStart);
  useLayoutEffect(() => {
    if (activeStart !== undefined) title.current?.focus();
  }, [activeStart]);
  if (!highlights.length) return null;
  function close() {
    setActiveStart(undefined);
    trigger.current?.focus();
  }
  return <div className="wi-opening-words">
    <div className="wi-opening-words-caption"><strong>من كلامك</strong><span>اضغط على عبارة لمراجعة اقتراح لونا وتعديله</span></div>
    <p className="wi-opening-transcript" dir="auto">{highlights.map((part, index) => <Fragment key={part.start}>
      {text.slice(index ? highlights[index - 1].end : 0, part.start)}
      <span role="button" tabIndex={0} className="wi-opening-phrase" aria-expanded={part === active}
        aria-controls={part === active ? editorId : undefined} onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (event.key === 'Enter' && !event.repeat) event.currentTarget.click();
        }} onKeyUp={event => {
          if (event.key === ' ') { event.preventDefault(); event.currentTarget.click(); }
        }} onClick={event => {
          trigger.current = event.currentTarget;
          setActiveStart(part === active ? undefined : part.start);
        }}>{text.slice(part.start, part.end)}</span>
    </Fragment>)}{text.slice(highlights[highlights.length - 1].end)}</p>
    {active && <div className="wi-opening-interpretation" id={editorId} key={active.start}>
      <div className="wi-opening-interpretation-head"><h3 tabIndex={-1} ref={title}>ما فهمته لونا من عبارتك</h3>
        <button type="button" aria-label="العودة إلى عبارتي" onClick={close}><X size={17} aria-hidden="true"/></button>
      </div>
      {Array.from(new Set(active.sources.map(source => source.id))).map(id => {
        const proposal = proposals.find(item => item.id === id);
        const field = fields.find(item => item.id === id);
        const option = field?.options.find(item => item.code === proposal?.values[0]);
        if (!field || !option) return null;
        const quote = active.sources.filter(source => source.id === id);
        const savedCode = saved[id]?.[0];
        return <div className="wi-opening-field" key={id} data-opening-field={id}>
          {quote.filter(source => source.quote !== text.slice(active.start, active.end)).map(source => <q key={source.quote}>{source.quote}</q>)}
          {renderChoice(id)}
          {savedCode && savedCode !== option.code && <small className="wi-opening-original">كان اقتراح لونا «{option.label}»</small>}
          <div className="wi-opening-answer-action" aria-live="polite">
            <button type="button" disabled={disabled} aria-disabled={Boolean(savedCode) || disabled} tabIndex={savedCode ? -1 : undefined}
              onClick={() => { if (!savedCode) onChoose(id, option.code); }}>
              <Check size={15} aria-hidden="true"/>
              {savedCode ? (savedCode === option.code ? 'محفوظ في مسودتك' : 'تعديلك محفوظ في المسودة') : 'اعتماد الاقتراح'}
            </button>
          </div>
        </div>;
      })}
    </div>}
  </div>;
}
