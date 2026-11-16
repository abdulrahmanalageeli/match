import './score-tile.css';

const number = new Intl.NumberFormat('ar-SA');

export function ScoreTile({ percentage }: { percentage: number }) {
  return <span className="nf-score-tile" dir="rtl">
    <span>توافق محتمل</span>
    <strong><bdi>{number.format(percentage)}٪</bdi></strong>
    <span className="nf-score-tile-track" aria-hidden="true"><span style={{ width: `${percentage}%` }} /></span>
  </span>;
}
