import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ArrowDown } from './BrandIcons';
import { ScoreTile } from './compatibility/ScoreTile';
import { welcomePairs } from './welcomePairStories';
import './welcomePairPreview.css';

type Selection = { index: number; speaker: number | null; fromScore: number };

export function WelcomePairPreview({ visible, reduced }: { visible: boolean; reduced: boolean }) {
  const [selection, setSelection] = useState<Selection>({ index: 0, speaker: null, fromScore: 0 });
  const [previous, setPrevious] = useState<Selection | null>(null);
  const [paused, setPaused] = useState(false);
  const rotating = visible && !reduced && !paused;

  const nextPair = useCallback(() => {
    setPrevious(reduced ? null : selection);
    setSelection({ index: (selection.index + 1) % welcomePairs.length, speaker: null,
      fromScore: welcomePairs[selection.index].score ?? 0 });
  }, [reduced, selection]);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(nextPair, 6800);
    return () => window.clearTimeout(timer);
  }, [rotating, nextPair]);

  useEffect(() => {
    if (!previous) return;
    const timer = window.setTimeout(() => setPrevious(null), 500);
    return () => window.clearTimeout(timer);
  }, [previous]);

  function row({ index, speaker, fromScore }: Selection, outgoing: boolean) {
    const pair = welcomePairs[index];
    return <div key={index} className="wd-pair-row" data-outgoing={outgoing || undefined}
      inert={outgoing || undefined} aria-hidden={outgoing || undefined}>
      <div className="wd-pair-top">
        {pair.people.map((person, i) => <button key={person.image} className="wd-pair-person" type="button"
          aria-label={'من كلام ' + person.name} aria-pressed={speaker === i} onFocus={() => setPaused(true)} onClick={() => {
            setPaused(true);
            setSelection({ index, speaker: speaker === i ? null : i, fromScore });
          }}>
          <img src={'/demo/portraits/' + person.image + '.webp'} width="44" height="44" alt=""/>
        </button>)}
        <div className="wd-pair-identity">
          <strong className="wd-pair-names">{pair.people[0].name} و{pair.people[1].name}</strong>
          <span>{pair.topic}</span>
        </div>
        {pair.score !== null && <div className="wd-pair-score" style={{
          '--wd-level-travel': (pair.score - fromScore) * 48 / 100 + 'px',
        } as CSSProperties}>
          <ScoreTile percentage={pair.score} variant="logo" label="التوافق"/>
        </div>}
      </div>
      <p className="wd-pair-reading">{speaker === null ? pair.reading : pair.people[speaker].name + ' — «' + pair.people[speaker].quote + '»'}</p>
    </div>;
  }

  return <section className="wd-pair-preview" aria-label="قصص التوافق" hidden={!visible}
    aria-live={rotating ? 'off' : 'polite'} data-rotating={rotating || undefined}>
    <div className="wd-pair-window" data-moving={(previous !== null && !reduced) || undefined}>
      {row(selection, false)}
      {previous && !reduced && row(previous, true)}
    </div>
    <div className="wd-pair-footer">
      <p>نقارن الطباع والأولويات لنختصر وقتك.</p>
      <div className="wd-pair-controls">
        {!reduced && <button type="button" aria-label={paused ? 'تشغيل التبديل التلقائي' : 'إيقاف التبديل التلقائي'}
          onClick={() => setPaused(!paused)}><svg viewBox="0 0 16 16" aria-hidden="true">
          {paused ? <path d="M5 3 13 8 5 13Z" fill="currentColor"/> : <path d="M5.5 3v10m5-10v10" stroke="currentColor" strokeWidth="2"/>}
        </svg></button>}
        <button type="button" aria-label="القصة التالية" onClick={nextPair}><ArrowDown size={16}/></button>
      </div>
    </div>
  </section>;
}
