import './score-tile.css';

export function ScoreTile({ percentage, ariaLabel, compact = false }: { percentage: number; ariaLabel: string; compact?: boolean }) {
  const band = percentage >= 80 ? 'high' : percentage >= 60 ? 'medium' : 'low';
  return <span className={`nf-score-tile${compact ? ' nf-score-tile--compact' : ''}`} data-band={band} role="img" aria-label={ariaLabel}>
    <span className="nf-score-tile-mark"><img src="/brand/wudayn-emblem-v2.png" alt="" width="18" height="18" /></span>
    <strong dir="ltr">{percentage}%</strong>
    <span className="nf-score-tile-track" aria-hidden="true"><span style={{ width: `${percentage}%` }}/></span>
  </span>;
}
