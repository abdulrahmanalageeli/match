import { useEffect, useRef, useState } from 'react';
import { useDevicePreferences, useSystemReducedMotion } from './settings/preferences';
import './scenePaths.css';
import { SkiaSurface } from './motion/SkiaSurface';

const paths = [
  {
    from: 'M-30 248 C10 131 73 58 160 66 C200 71 213 90 226 116',
    to: 'M-30 248 C10 130 100 40 190 70 C228 85 247 69 260 43',
  },
  {
    from: 'M550 248 C510 131 447 58 360 66 C320 71 307 90 294 116',
    to: 'M550 248 C510 130 420 40 330 70 C292 85 273 69 260 43',
  },
] as const;

/** Decorative paths: draw toward each other, form an arch, then remain still. */
export function ScenePaths({ className = '', parallax = false }: { className?: string; parallax?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const { value } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = value.reducedMotion || systemReduced;
  const [drawing, setDrawing] = useState(() => !reduced && !document.hidden);

  useEffect(() => {
    if (reduced) setDrawing(false);
    const finishWhenHidden = () => { if (document.hidden) setDrawing(false); };
    document.addEventListener('visibilitychange', finishWhenHidden);
    return () => document.removeEventListener('visibilitychange', finishWhenHidden);
  }, [reduced]);

  useEffect(() => {
    const node = element.current;
    if (!node || !parallax || reduced) return;
    const origin = node.getBoundingClientRect().top;
    let visible = false;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      const distance = origin - node.getBoundingClientRect().top;
      node.style.setProperty('--nf-scene-shift', `${Math.max(-12, Math.min(12, distance * .035))}px`);
    };
    const queue = () => {
      if (visible && !document.hidden && !frame) frame = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) queue();
    });
    observer.observe(node);
    window.addEventListener('scroll', queue, { passive: true, capture: true });
    document.addEventListener('visibilitychange', queue);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', queue, true);
      document.removeEventListener('visibilitychange', queue);
      if (frame) cancelAnimationFrame(frame);
      node.style.removeProperty('--nf-scene-shift');
    };
  }, [parallax, reduced]);

  const animate = drawing && !reduced;
  return <div ref={element} className={`nf-scene-paths ${className}`.trim()} aria-hidden="true" data-draw={animate || undefined}>
    <div className="nf-scene-paths-plane">
      <SkiaSurface className="nf-scene-canvas" variant="scene" animate={animate} fallback={<svg viewBox="0 0 520 260" preserveAspectRatio="xMidYMid slice" focusable="false" fill="none">
        {paths.map((path, index) => <path key={index} className="nf-scene-path" d={path.to} pathLength="1">
        </path>)}
      </svg>} />
    </div>
  </div>;
}
