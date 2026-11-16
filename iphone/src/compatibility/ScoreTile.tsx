import { useId } from 'react';
import './score-tile.css';

const number = new Intl.NumberFormat('ar-SA');

export function ScoreTile({ percentage }: { percentage: number }) {
  const gradientId = useId();

  return <span className="nf-score-tile" dir="rtl">
    <svg className="nf-score-ring" width="30" height="28" viewBox="0 0 32 30" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="7" y1="6" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e697ad" />
          <stop offset=".52" stopColor="#b35a87" />
          <stop offset="1" stopColor="#752544" />
        </linearGradient>
      </defs>
      <path className="nf-score-ring-stone" d="M10.5 4.25 12.7 1.75h6.6l2.2 2.5L16 9l-5.5-4.75Zm0 0h11m-7.9 0L16 9l2.4-4.75" />
      <circle className="nf-score-ring-track" cx="16" cy="17.75" r="8.75" />
      {percentage > 0 && <circle
        cx="16" cy="17.75" r="8.75" pathLength="100"
        transform="rotate(-90 16 17.75)"
        stroke={`url(#${gradientId})`}
        strokeLinecap="round"
        strokeDasharray={`${percentage} 100`}
      />}
    </svg>
    <span className="nf-score-tile-copy">
      <span>توافق محتمل</span>
      <strong><bdi>{number.format(percentage)}٪</bdi></strong>
    </span>
  </span>;
}
