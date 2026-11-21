import { useId } from 'react';
import { LogoCompatibilityMark } from './LogoCompatibilityMark';
import './score-tile.css';

const number = new Intl.NumberFormat('ar-SA');
const shoulders = 'M9.3 12.2C10.8 10.6 11.1 8.3 12.8 6.8L14.1 8C12.8 10.1 11.4 11.7 9.3 12.2ZM22.7 12.2C21.2 10.6 20.9 8.3 19.2 6.8L17.9 8C19.2 10.1 20.6 11.7 22.7 12.2Z';

export function ScoreTile({ percentage, variant = 'ring', label = 'توافق التفضيلات' }: { percentage: number; variant?: 'ring' | 'logo'; label?: string }) {
  const gradientId = useId();
  const shoulderGradientId = useId();
  const stoneGradientId = useId();
  const satinGradientId = useId();
  const shoulderMaskId = useId();
  const trailGradientId = useId();
  const trailMaskId = useId();
  const trail = percentage > 0 && percentage < 100 ? Math.min(18, percentage / 2) : 0;
  const solid = percentage - trail;
  const startAngle = solid / 100 * Math.PI * 2 - Math.PI / 2;
  const endAngle = percentage / 100 * Math.PI * 2 - Math.PI / 2;

  return <span className="nf-score-tile" dir="rtl">
    {variant==='logo'?<LogoCompatibilityMark percentage={percentage}/>:<svg className="nf-score-ring" width="30" height="28" viewBox="0 0 32 30" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="7" y1="6" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--score-band-light, #e697ad)" />
          <stop offset=".52" stopColor="var(--score-band-mid, #b35a87)" />
          <stop offset="1" stopColor="var(--score-band-dark, #752544)" />
        </linearGradient>
        <linearGradient id={satinGradientId} x1="7" y1="9" x2="25" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fffafc" stopOpacity=".65" />
          <stop offset=".3" stopColor="#fffafc" stopOpacity=".12" />
          <stop offset=".58" stopColor="#54152a" stopOpacity=".1" />
          <stop offset=".82" stopColor="#fffafc" stopOpacity=".48" />
          <stop offset="1" stopColor="#fffafc" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id={shoulderGradientId} href={`#${gradientId}`} gradientTransform="rotate(-90 16 17.75)" />
        <linearGradient id={stoneGradientId} x1="14" y1="2" x2="18" y2="9" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--score-stone-light, #e7a8bf)" />
          <stop offset=".48" stopColor="var(--score-stone-mid, #bd688f)" />
          <stop offset="1" stopColor="var(--score-stone-dark, #783049)" />
        </linearGradient>
        <linearGradient id={trailGradientId} gradientUnits="userSpaceOnUse"
          x1={16 + 8.75 * Math.cos(startAngle)} y1={17.75 + 8.75 * Math.sin(startAngle)}
          x2={16 + 8.75 * Math.cos(endAngle)} y2={17.75 + 8.75 * Math.sin(endAngle)}>
          <stop stopColor="white" />
          <stop offset=".2" stopColor="#f5f5f5" />
          <stop offset=".55" stopColor="#b0b0b0" />
          <stop offset=".8" stopColor="#454545" />
          <stop offset="1" stopColor="black" />
        </linearGradient>
        <mask id={trailMaskId} x="0" y="0" width="32" height="30" maskUnits="userSpaceOnUse">
          <path d="M0 0H32V30H0Z" fill={`url(#${trailGradientId})`} />
        </mask>
        {/* One continuous fade follows the unfinished band and its setting. */}
        <mask id={shoulderMaskId} x="0" y="0" width="32" height="30" maskUnits="userSpaceOnUse">
          {solid > 0 && <circle cx="16" cy="17.75" r="8.75" pathLength="100"
            transform="rotate(-90 16 17.75)" stroke="white" strokeWidth="10"
            strokeDasharray={`${solid} 100`} />}
          {trail > 0 && <g mask={`url(#${trailMaskId})`}><circle
            cx="16" cy="17.75" r="8.75" pathLength="100"
            transform="rotate(-90 16 17.75)" stroke="white" strokeWidth="10"
            strokeDasharray={`${trail} ${100 - trail}`} strokeDashoffset={-solid}
          /></g>}
        </mask>
      </defs>
      <path className="nf-score-ring-rim" d="M10.1 9.5a10.15 10.15 0 1 0 11.8 0" />
      <circle className="nf-score-ring-track" cx="16" cy="17.75" r="8.75" />
      {solid > 0 && <circle
        cx="16" cy="17.75" r="8.75" pathLength="100"
        transform="rotate(-90 16 17.75)"
        stroke={`url(#${gradientId})`}
        strokeLinecap="butt"
        strokeDasharray={`${solid} 100`}
      />}
      {trail > 0 && <g mask={`url(#${trailMaskId})`}><circle
        cx="16" cy="17.75" r="8.75" pathLength="100"
        transform="rotate(-90 16 17.75)" stroke={`url(#${gradientId})`}
        strokeDasharray={`${trail} ${100 - trail}`} strokeDashoffset={-solid}
      /></g>}
      <circle cx="16" cy="17.75" r="8.75" stroke={`url(#${satinGradientId})`} strokeWidth="1.4" />
      <circle className="nf-score-ring-inner" cx="16" cy="17.75" r="7.35" />
      <path className="nf-score-ring-setting" d={shoulders} />
      <path d={shoulders} fill={`url(#${shoulderGradientId})`} mask={`url(#${shoulderMaskId})`} />
      <path d={shoulders} fill={`url(#${satinGradientId})`} fillOpacity=".65" />
      <g transform="translate(0 -2.6) scale(1 1.28)">
      <path className="nf-score-stone-separation" d="M10.3 5.2L15.4 8.9Q16 9.3 16.6 8.9L21.7 5.2" />
      <path className="nf-score-ring-stone" fill={`url(#${stoneGradientId})`} stroke={`url(#${shoulderGradientId})`}
        d="M12.4 2.8Q12 2.8 11.7 3.1L10.2 4.6Q10 4.9 10.3 5.2L15.4 8.9Q16 9.3 16.6 8.9L21.7 5.2Q22 4.9 21.8 4.6L20.3 3.1Q20 2.8 19.6 2.8Z" />
      <path fill="#fffafc" fillOpacity=".2" d="M13.2 3.5H18.8L20 4.7H12Z" />
      <path fill="#54152a" fillOpacity=".12" d="M12 4.7H20L16 8.6Z" />
      <path className="nf-score-ring-facets" stroke="#fff1f7"
        d="M10.2 4.9H21.8M12 4.9 13.2 3.5H18.8L20 4.9M13.4 4.9 16 8.9 18.6 4.9" />
      </g>
    </svg>}
    <span className="nf-score-tile-copy">
      <span>{label}</span>
      <strong><bdi dir="ltr">{number.format(percentage)}٪</bdi></strong>
    </span>
  </span>;
}
