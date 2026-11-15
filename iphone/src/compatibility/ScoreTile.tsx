import './score-tile.css';

export function ScoreTile({ percentage, ariaLabel }: { percentage: number; ariaLabel: string }) {
  const band = percentage >= 80 ? 'high' : percentage >= 60 ? 'medium' : 'low';
  return <span className="nf-score-tile" data-band={band} role="img" aria-label={ariaLabel}>
    <span className="nf-score-tile-mark"><img src="/brand/wudayn-emblem-v2.png" alt="" width="22" height="22" /></span>
    <strong dir="ltr">{percentage}%</strong>
    <small>التفضيلات</small>
  </span>;
}
