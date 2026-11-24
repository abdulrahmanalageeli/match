import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { usePublishedItems } from './publishing/PublicationCenter';
import { LogoCompatibilityMark } from './compatibility/LogoCompatibilityMark';
import { welcomePairs } from './welcomePairStories';
import './welcomePairPreview.css';

type Selection = { index: number; alternate: boolean; speaker: number | null; fromScore: number };

const readingMs = 5400;
const handoffMs = 720;

export function WelcomePairPreview({ visible, reduced }: { visible: boolean; reduced: boolean }) {
  const [selection, setSelection] = useState<Selection>({ index: 0, alternate: false, speaker: null, fromScore: 0 });
  const [previous, setPrevious] = useState<Selection | null>(null);
  const [paused, setPaused] = useState(false);
  const card = useRef<HTMLElement>(null);
  const captionId = useId();
  const published=usePublishedItems();
  const [onScreen, setOnScreen] = useState(false);
  const rotating = visible && onScreen && !reduced && !paused && selection.speaker === null;

  useEffect(() => {
    const node = card.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.intersectionRatio >= .75), { threshold: .75 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const next = welcomePairs[(selection.index + 1) % welcomePairs.length];
    for (const person of next.people) {
      const portrait = new Image();
      portrait.src = '/demo/portraits/' + person.image + '.webp';
      void portrait.decode().catch(() => {});
    }
  }, [selection.index, visible]);

  const advance = useCallback(() => {
    if (!selection.alternate && selection.speaker === null) {
      setSelection({ ...selection, alternate: true });
      return;
    }
    setPrevious(reduced ? null : selection);
    setSelection({ index: (selection.index + 1) % welcomePairs.length, alternate: false, speaker: null,
      fromScore: welcomePairs[selection.index].score ?? 0 });
  }, [reduced, selection]);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(advance, readingMs);
    return () => window.clearTimeout(timer);
  }, [rotating, advance]);

  useEffect(() => {
    if (!previous) return;
    const timer = window.setTimeout(() => setPrevious(null), handoffMs);
    return () => window.clearTimeout(timer);
  }, [previous]);

  function row({ index, alternate, speaker, fromScore }: Selection, outgoing: boolean) {
    const pair = welcomePairs[index];
    const { title, reading:original, status } = pair.factors[alternate ? 1 : 0];
    const reading=published.find(item=>item.key===`welcome.${index}.${alternate?1:0}`)?.body??original;
    const verdict = status === 'aligned' ? 'اتفاق' : !status || status === 'missing' ? 'غير محسوم' : 'للنقاش';
    const showBands = alternate && speaker === null && !reduced && status && status !== 'missing';
    return <div key={index} className="wd-pair-row" data-outgoing={outgoing || undefined}
      inert={outgoing || undefined} aria-hidden={outgoing || undefined}>
      <div className="wd-pair-top">
        <div className="wd-pair-people" data-bands={showBands ? (status === 'aligned' ? 'link' : 'part') : undefined}>{pair.people.map((person, i) => <button key={person.image} className="wd-pair-person" type="button"
          aria-label={'من كلام ' + person.name} aria-pressed={speaker === i} onFocus={() => setPaused(true)} onClick={() => {
            setPaused(true);
            setSelection({ index, alternate: false, speaker: speaker === i ? null : i, fromScore });
          }}>
          <img src={'/demo/portraits/' + person.image + '.webp'} width="44" height="44" alt=""/>
        </button>)}</div>
        <div className="wd-pair-identity">
          <span key={title} className="wd-pair-factor">{title}</span>
          <strong className="wd-pair-names">{pair.people[0].name} و{pair.people[1].name}</strong>
        </div>
        {pair.score !== null && <div className="wd-pair-score" style={{
          '--wd-level-travel': (pair.score - fromScore) * 48 / 100 + 'px',
        } as CSSProperties}>
          <span className="nf-score-tile" dir="rtl"><LogoCompatibilityMark percentage={pair.score}/><span className="nf-score-tile-copy"><span>التوافق</span><strong><bdi dir="ltr" aria-label={`التوافق الإجمالي ${pair.score}٪`}>{pair.score}%</bdi></strong></span></span>
        </div>}
      </div>
      <button className="wd-pair-reading" type="button" aria-label="القصة التالية" aria-describedby={outgoing ? undefined : captionId} onClick={() => {
        setPaused(true);
        advance();
      }}><span key={title} id={outgoing ? undefined : captionId} className="wd-pair-factor">{speaker === null ? <>
        <span className="wd-pair-verdict" data-status={status}>{verdict}</span>{' '}{reading}
      </> : pair.people[speaker].name + ' — «' + pair.people[speaker].quote + '»'}</span></button>
    </div>;
  }

  return <section ref={card} style={{ '--wd-handoff': handoffMs + 'ms' } as CSSProperties} className="wd-pair-preview" aria-label="قصص التوافق" hidden={!visible}
    aria-live={rotating ? 'off' : 'polite'} data-rotating={rotating || undefined}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <div className="wd-pair-window" data-moving={(previous !== null && !reduced) || undefined}>
      {row(selection, false)}
      {previous && !reduced && row(previous, true)}
    </div>
  </section>;
}
