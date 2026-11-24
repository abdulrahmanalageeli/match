import { useLayoutEffect, useRef } from 'react';
import { placeDiscoveryPortrait } from '../session';

// Read the same authorized (possibly blurred) image the ordinary portrait
// would display. Never mount its pixels in the capture-visible DOM.
async function thumbnail(url: string, max: number, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error('Portrait unavailable');
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    if (signal.aborted) throw Error('Portrait request cancelled');
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('Portrait unavailable');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .88).split(',')[1];
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function placement(node: HTMLElement, compact: boolean) {
  const root = document.documentElement;
  if (root.dataset.captureScope !== 'discovery' || document.hidden ||
      root.matches('[data-capture-pending],[data-capture-hidden],[data-capture-native-hidden]') ||
      document.querySelector('dialog[open],[aria-modal="true"]:not([hidden])') ||
      (window.visualViewport?.scale ?? 1) !== 1) return;
  const rect = node.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight ||
      rect.right <= 0 || rect.left >= innerWidth) return;
  const cutouts: number[][] = [];
  function exclude(cover: Element) {
    const r = cover.getBoundingClientRect();
    if (r.width && r.height && r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top)
      cutouts.push([r.x, r.y, r.width, r.height]);
  }
  document.querySelectorAll('.mi-tabbar, .wd-tier-change, [role="alertdialog"]').forEach(exclude);
  node.closest('.dr-row-avatar')?.querySelectorAll('.wd-member-badge,.wd-capture-watermark,.dr-online-dot').forEach(exclude);
  const centerX = Math.max(0, (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2);
  const centerY = Math.max(0, (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2);
  const card = node.closest('.df-recommendation,.dr-person-row');
  if (!card || !card.contains(document.elementFromPoint(centerX, centerY))) return;
  return { box: [rect.x, rect.y, rect.width, rect.height], radius: compact ? rect.width / 2 : 12, cutouts };
}

// Share observers across visible cards. A settled feed has no animation loop.
const visible = new Set<() => void>();
let frame = 0;
let animateUntil = 0;
let stopWatching: (() => void) | undefined;
function tick() {
  frame = 0;
  visible.forEach(update => update());
  if (performance.now() < animateUntil) schedule();
}
function schedule() { if (visible.size && !frame) frame = requestAnimationFrame(tick); }
function watch(update: () => void) {
  visible.add(update);
  if (!stopWatching) {
    const moving = () => { animateUntil = performance.now() + 650; schedule(); };
    const layout = new ResizeObserver(schedule);
    layout.observe(document.body);
    const changes = new MutationObserver(schedule);
    changes.observe(document.documentElement, {subtree: true, childList: true, attributes: true,
      attributeFilter: ['class','open','hidden','style','data-capture-scope','data-capture-hidden','data-capture-native-hidden','data-capture-pending']});
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('transitionrun', moving);
    document.addEventListener('animationstart', moving);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    stopWatching = () => {
      layout.disconnect(); changes.disconnect();
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('transitionrun', moving);
      document.removeEventListener('animationstart', moving);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }
  animateUntil = performance.now() + 650;
  schedule();
}
function unwatch(update: () => void) {
  visible.delete(update);
  if (!visible.size) { stopWatching?.(); stopWatching = undefined; }
}

export function DiscoveryPhoto({ src, name, compact = false, observe }: { src?: string; name: string; compact?: boolean; observe?: (node: HTMLElement | null) => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = anchor.current;
    if (!node || !src) return;
    const id = crypto.randomUUID();
    let request: AbortController | undefined;
    let placed = false, busy = false, disposed = false, failed = false, last = '';
    let bitmap: string | undefined;
    const remove = () => {
      request?.abort();
      request = undefined;
      bitmap = undefined;
      if (placed || busy) void placeDiscoveryPortrait({ id });
      placed = false;
      last = '';
      failed = false;
    };
    const update = () => {
      const geometry = placement(node, compact);
      if (!geometry) { if (request || placed) remove(); return; }
      if (busy || failed) return;
      const signature = JSON.stringify(geometry);
      if (placed && signature === last) return;
      const current = request ??= new AbortController();
      busy = true;
      void (async () => {
        if (!placed && !bitmap) {
          const image = await thumbnail(src, compact ? 192 : 640, current.signal);
          if (disposed || current.signal.aborted) return;
          bitmap = image;
        }
        if (disposed || current.signal.aborted) return;
        const latest = placement(node, compact);
        if (!latest) { remove(); return; }
        const result = await placeDiscoveryPortrait({ id, ...latest, image: placed ? undefined : bitmap });
        if (disposed || current.signal.aborted) return;
        placed = result.placed;
        last = JSON.stringify(latest);
        if (placed) bitmap = undefined;
        else failed = true; // No insecure fallback on an unsupported build.
      })().catch(() => { if (!current.signal.aborted) failed = true; })
        .finally(() => { busy = false; if (!disposed) schedule(); });
    };
    const visibility = () => { if (document.hidden) remove(); };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        watch(update);
      } else {
        unwatch(update);
        remove();
      }
    });
    observer.observe(node);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      unwatch(update);
      remove();
    };
  }, [src, compact]);
  return <span data-access-checked-portrait="" ref={node => { anchor.current = node; observe?.(node); }} className={'wd-private-portrait' + (compact ? ' wd-private-portrait--small' : '')}
    role="img" aria-label={`الصورة الشخصية لـ ${name}`}/>;
}
