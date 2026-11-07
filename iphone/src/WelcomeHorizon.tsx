import { useId, useLayoutEffect, useRef } from "react";

// The last frame is the exact Bézier contour in the original Nisfayn launch artwork.
// Each intervening pose moves the crest sideways as well as changing its height.
const waves = [
  {
    name: "far", duration: 2600, timing: [0, 0.31, 0.66, 1],
    light: "#FAF6EE", lightOpacity: .72, lightStart: 0, lightEnd: 2,
    rest: [81, 33, 78.2, 57, 82.7, 82, 91.5, 128, 107.9, 156, 126.2, 210, 129, 276, 132.3, 326, 104.7, 390, 83],
    out: [95, 38, 103, 73, 116, 111, 121, 166, 128, 204, 111, 249, 91, 304, 67, 353, 62, 390, 67],
    back: [70, 27, 64, 51, 71, 82, 82, 126, 98, 163, 119, 226, 120, 282, 123, 347, 107, 390, 95],
  },
  {
    name: "middle", duration: 2850, timing: [0, 0.36, 0.69, 1],
    light: "#FAF6EE", lightOpacity: .42, lightStart: 1, lightEnd: 3,
    rest: [121, 54, 124.3, 93, 143, 142, 146, 193, 149.2, 231, 125.3, 276, 99.8, 321, 74, 353, 64.9, 390, 64.2],
    out: [115, 42, 101, 76, 107, 119, 124, 171, 146, 215, 151, 267, 131, 316, 113, 352, 89, 390, 85],
    back: [129, 63, 143, 101, 147, 148, 128, 188, 112, 234, 76, 284, 65, 327, 55, 363, 56, 390, 61],
  },
  {
    name: "front", duration: 3100, timing: [0, 0.32, 0.69, 1],
    light: "#E7D8C2", lightOpacity: .48, lightStart: 0, lightEnd: 4,
    rest: [110, 46, 110, 72, 121.8, 101, 135.1, 129.1, 148.2, 154, 156.1, 183.8, 156.5, 220.8, 156.9, 257.1, 145.6, 292.8, 129.7, 335.8, 110.3, 363.1, 101.7, 390, 102.5],
    out: [132, 43, 145, 78, 154, 107, 149, 142, 144, 166, 127, 193, 117, 227, 104, 260, 99, 293, 105, 332, 113, 361, 126, 390, 129],
    back: [99, 36, 94, 72, 99, 105, 114, 137, 129, 164, 147, 199, 152, 234, 157, 267, 144, 298, 129, 333, 112, 364, 102, 390, 105],
  },
] as const;

type Wave = typeof waves[number];

// A pose is its starting height followed by six coordinates per cubic curve.
function contour(pose: readonly number[], first: number, last: number, filled: boolean) {
  const offset = 1 + 6 * first;
  const start = first === 0 ? `0 ${pose[0]}` : `${pose[offset - 2]} ${pose[offset - 1]}`;
  let path = "M" + start;
  for (let segment = first; segment < last; segment++) {
    const index = 1 + segment * 6;
    path += " C" + pose.slice(index, index + 6).join(" ");
  }
  return filled ? path + " V170 H0 Z" : path;
}

function sample(wave: Wave, elapsed: number): readonly number[] {
  const ratio = elapsed / wave.duration;
  if (ratio >= 1) return wave.rest;
  const poses = [wave.rest, wave.out, wave.back, wave.rest];
  const index = ratio < wave.timing[1] ? 0 : ratio < wave.timing[2] ? 1 : 2;
  const t = (ratio - wave.timing[index]) / (wave.timing[index + 1] - wave.timing[index]);
  const blend = t * t * (3 - 2 * t);
  return poses[index].map((point, i) =>
    Math.round((point + (poses[index + 1][i] - point) * blend) * 100) / 100);
}

function WaveLayer({ wave, gradient }: { wave: Wave; gradient: string }) {
  return <g>
    <path data-wave={wave.name} d={contour(wave.rest, 0, (wave.rest.length - 1) / 6, true)} fill={`url(#${gradient})`} />
    <path data-wave-rim={wave.name} d={contour(wave.rest, wave.lightStart, wave.lightEnd, false)}
      fill="none" stroke={wave.light} strokeOpacity={wave.lightOpacity} strokeWidth=".8" />
  </g>;
}

export function WelcomeHorizon({ animate }: { animate: boolean }) {
  const scope = "nf-horizon-" + useId().replace(/[^a-z0-9_-]/gi, "");
  const svg = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const art = svg.current;
    if (!animate || !art) return;
    const layers = waves.map(wave => ({
      wave,
      fill: art.querySelector<SVGPathElement>(`[data-wave="${wave.name}"]`)!,
      rim: art.querySelector<SVGPathElement>(`[data-wave-rim="${wave.name}"]`)!,
    }));
    const start = performance.now();
    const duration = Math.max(...waves.map(wave => wave.duration));
    let frame: number;
    function draw(now: number) {
      const elapsed = Math.max(0, now - start);
      for (const { wave, fill, rim } of layers) {
        const points = sample(wave, elapsed);
        fill.setAttribute("d", contour(points, 0, (points.length - 1) / 6, true));
        rim.setAttribute("d", contour(points, wave.lightStart, wave.lightEnd, false));
      }
      if (elapsed < duration) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [animate]);
  if (!animate) return <img className="nf-welcome-horizon" src="/brand/nisfayn-horizon.svg" alt="" width="390" height="170" />;
  return <svg ref={svg} className="nf-welcome-horizon" data-nf-wave-intro="" width="390" height="170" viewBox="0 0 390 170"
    preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={scope + "-city"} x1="0" y1="18" x2="0" y2="134" gradientUnits="userSpaceOnUse">
        <stop stopColor="#C5838E" stopOpacity=".76" /><stop offset="1" stopColor="#E7D8C2" stopOpacity=".38" />
      </linearGradient>
      <linearGradient id={scope + "-far"} x1="0" y1="0" x2=".8" y2="1">
        <stop stopColor="#E6BEC1" /><stop offset=".6" stopColor="#EBCCCB" /><stop offset="1" stopColor="#D9A4AB" />
      </linearGradient>
      <linearGradient id={scope + "-middle"} x1="1" y1=".05" x2=".1" y2="1">
        <stop stopColor="#BC7786" /><stop offset=".52" stopColor="#C5838E" /><stop offset="1" stopColor="#A34D63" />
      </linearGradient>
      <linearGradient id={scope + "-front"} x1="0" y1="0" x2=".42" y2="1">
        <stop stopColor="#8F3450" /><stop offset=".52" stopColor="#72203C" /><stop offset=".9" stopColor="#5A0F28" />
      </linearGradient>
    </defs>
    <path fill="#E7D8C2" opacity=".54" d="M41 111v-9h7v-6h5v-7h4v7h5v14h5V95h8v-9h7v10h5V83h4v-9h3v8h6v13h8v-9h8v6h7v-8h7v-7h6v9h7v-4h5v14h9V80h7v-7h6v9h10v12h14v-9h7V74h5v-8h6v9h6v17h10V81h9v-8h6v13h5v10h8v-7h9v-8h5v10h6v-9h5v-7h5v13h5v-4h7v-7h5v20h9V85h7v9h6v-8h6v11h6v-7h8v7h7v-5h5V140H41z" />
    <g fill={`url(#${scope}-city)`}>
      <path d="M65 112v-9h7v-8h8v-5h3v5h6v10h6V91h8v-9h5v-7h2v8h4v13h5V86h7v-7h6v6h7v19h6V88h5v-7h3v-8h2v7h4V69h5v34h6V85h6v17h7v-8h5v-9h8v11h5V82h4v-6h4v-5h2v6h4v20h7v-4h6V77h6l3-4 2 4h5v22h6V87h8v-7h3v-4h2v4h4v6h6v16h5v-9h5V81h6v-8h2v8h3v11h7v-8h8v21h6V94h7v-5h5v6h6v13h12V140H65z" />
      <path fillRule="evenodd" d="M186 140v-34l2.4-86c2.4-.8 5 1 7.1 2.6 3.4 2.6 5.1 2.7 8.3.1 2.3-1.9 4.7-3.4 7.1-2.7l2.5 86v34z M191 24c2.7 8.4 6.1 15.2 8.9 19 3-3.9 6.5-11.1 8.7-19-3 1.3-5.7 3.1-8.7 3.1-3.2 0-5.9-1.9-8.9-3.1z" />
      <path d="M134 140v-35l3.5-16.5 4.8-27.5.9-12h.8l.9 12 5.1 27.5 3.5 16.5v35z" />
      <circle cx="143.6" cy="65" r="3.25" />
      <path d="M239 140V79l2.2-2.5V65l3.8-2.8 4.5 2.8v12l2.5 2V140zM259 140V82l5.2-5 5.8 4.5V140z" />
    </g>
    {waves.map(wave => <WaveLayer key={wave.name} wave={wave} gradient={scope + "-" + wave.name} />)}
    <path fill="#5A0F28" d="M0 168h390v2H0z" />
  </svg>;
}
