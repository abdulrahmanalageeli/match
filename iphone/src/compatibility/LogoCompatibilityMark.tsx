import { useId } from 'react';

/** The brand emblem fills from the bottom using the actual compatibility score. */
export function LogoCompatibilityMark({ percentage, personality = false }: { percentage: number; personality?: boolean }) {
  const id = useId();
  const score = Math.max(0, Math.min(100, percentage));
  const surface = `translate(0 ${score === 100 ? -5 : 48 * (1 - score / 100)})`;
  const wave = 'M-48 0Q-36 -8 -24 0T0 0T24 0T48 0T72 0T96 0';
  return <svg className="nf-score-ring nf-score-logo" width="30" height="28" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <defs>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
        <g className="nf-logo-level" transform={surface}>
          <path className="nf-logo-wave nf-logo-wave-back" d={`${wave}V100H-48Z`} fill="white" opacity=".4"/>
          <path className="nf-logo-wave" d={`${wave}V100H-48Z`} fill="white"/>
        </g>
      </mask>
      <mask id={`${id}-shape`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
        <image href="/brand/wudayn-emblem-v2.png" width="48" height="48" style={{filter:'brightness(0) invert(1)'}}/>
      </mask>
    </defs>
    <image href="/brand/wudayn-emblem-v2.png" width="48" height="48" opacity=".18" style={{filter:'grayscale(1)'}}/>
    <g opacity={score>0?1:0} mask={`url(#${id})`}>
      {personality ? <rect width="48" height="48" mask={`url(#${id}-shape)`} fill="#40816b"/> : <image href="/brand/wudayn-emblem-v2.png" width="48" height="48"/>}
    </g>
    {score>0&&<g mask={`url(#${id}-shape)`}><g className="nf-logo-level" transform={surface}>
      <path className="nf-logo-wave" d={wave} fill="none" stroke="#fff7ef" strokeWidth=".9" strokeOpacity=".7"/>
    </g></g>}
  </svg>;
}
