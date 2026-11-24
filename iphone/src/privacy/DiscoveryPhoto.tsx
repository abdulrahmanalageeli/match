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
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Portrait unavailable')), 'image/jpeg', .88);
    });
    if (signal.aborted) throw Error('Portrait request cancelled');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(Error('Portrait unavailable'));
      reader.readAsDataURL(jpeg);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const covers = '.mi-tabbar, .wd-tier-change, [role="alertdialog"]';
function visibleCoverRects() {
  const root = document.documentElement;
  if (root.dataset.captureScope !== 'discovery' || document.hidden ||
      root.matches('[data-capture-pending],[data-capture-hidden],[data-capture-native-hidden]') ||
      document.querySelector('dialog[open],[aria-modal="true"]:not([hidden])') ||
      (window.visualViewport?.scale ?? 1) !== 1) return null;
  return Array.from(document.querySelectorAll(covers), cover => cover.getBoundingClientRect());
}

function placement(node: HTMLElement, compact: boolean, coverRects: DOMRect[] | null) {
  if (!coverRects) return;
  const rect = node.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight ||
      rect.right <= 0 || rect.left >= innerWidth) return;
  const cutouts: number[][] = [];
  function exclude(r: DOMRect) {
    if (r.width && r.height && r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top)
      cutouts.push([r.x, r.y, r.width, r.height]);
  }
  coverRects.forEach(exclude);
  node.closest('.dr-row-avatar')?.querySelectorAll('.wd-member-badge,.wd-capture-watermark,.dr-online-dot')
    .forEach(cover => exclude(cover.getBoundingClientRect()));
  const centerX = Math.max(0, (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2);
  const centerY = Math.max(0, (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2);
  const card = node.closest('.df-recommendation,.dr-person-row');
  if (!card || !card.contains(document.elementFromPoint(centerX, centerY))) return;
  return { box: [rect.x, rect.y, rect.width, rect.height], radius: compact ? rect.width / 2 : 12, cutouts };
}

// Share observers across visible cards. A settled feed has no animation loop.
type Update = (covers: DOMRect[] | null) => void;
const visible = new Map<HTMLElement, Update>();
const motions = new Set<Animation>();
let frame = 0;
let stopWatching: (() => void) | undefined;
function tick() {
  frame = 0;
  const coverRects = visibleCoverRects();
  visible.forEach(update => update(coverRects));
  for (const animation of motions) {
    if (animation.playState !== 'running' && !animation.pending) motions.delete(animation);
  }
  if (motions.size) schedule();
}
function schedule() { if (visible.size && !frame) frame = requestAnimationFrame(tick); }
function watch(node: HTMLElement, update: Update) {
  visible.set(node, update);
  if (!stopWatching) {
    // Follow actual transitions of portrait ancestors and occluding bars.
    // Decorative animations elsewhere in the feed never arm a frame loop.
    const moving = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || !(target.matches(covers) || [...visible.keys()].some(anchor => target.contains(anchor)))) return;
      for (const animation of target.getAnimations()) {
        if (animation.effect?.getTiming().iterations !== Infinity) motions.add(animation);
      }
      schedule();
    };
    const layout = new ResizeObserver(schedule);
    layout.observe(document.body);
    const changes = new MutationObserver(schedule);
    changes.observe(document.documentElement, {subtree: true, childList: true, attributes: true,
      attributeFilter: ['class','open','hidden','style','data-capture-scope','data-capture-hidden','data-capture-native-hidden','data-capture-pending']});
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('transitionrun', moving);
    document.addEventListener('animationstart', moving);
    document.addEventListener('transitionend', moving);
    document.addEventListener('animationend', moving);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    stopWatching = () => {
      layout.disconnect(); changes.disconnect();
      motions.clear();
      cancelAnimationFrame(frame);
      frame = 0;
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('transitionrun', moving);
      document.removeEventListener('animationstart', moving);
      document.removeEventListener('transitionend', moving);
      document.removeEventListener('animationend', moving);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }
  schedule();
}
function unwatch(node: HTMLElement) {
  visible.delete(node);
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
    const update: Update = (coverRects) => {
      const geometry = placement(node, compact, coverRects);
      if (!geometry) { if (request || placed) remove(); return; }
      if (busy || failed) return;
      // The native views scroll with the outer UIScrollView. Only content-space
      // movement and changes to the mask relative to the portrait need a call.
      const [x, y, width, height] = geometry.box;
      const signature = JSON.stringify([x + window.scrollX, y + window.scrollY, width, height,
        geometry.cutouts.map(([left, top, w, h]) => [left - x, top - y, w, h])]);
      if (placed && signature === last) return;
      const current = request ??= new AbortController();
      busy = true;
      void (async () => {
        if (!placed && !bitmap) {
          const image = await thumbnail(src, compact ? 192 : 640, current.signal);
          if (disposed || current.signal.aborted) return;
          bitmap = image;
          // Measure again on the next shared frame after asynchronous encoding.
          return;
        }
        if (disposed || current.signal.aborted) return;
        const result = await placeDiscoveryPortrait({ id, ...geometry, image: placed ? undefined : bitmap });
        if (disposed || current.signal.aborted) return;
        placed = result.placed;
        last = signature;
        if (placed) bitmap = undefined;
        else failed = true; // No insecure fallback on an unsupported build.
      })().catch(() => { if (!current.signal.aborted) failed = true; })
        .finally(() => { busy = false; if (!disposed) schedule(); });
    };
    const visibility = () => { if (document.hidden) remove(); };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        watch(node, update);
      } else {
        unwatch(node);
        remove();
      }
    });
    observer.observe(node);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      unwatch(node);
      remove();
    };
  }, [src, compact]);
  return <span data-access-checked-portrait="" ref={node => { anchor.current = node; observe?.(node); }} className={'wd-private-portrait' + (compact ? ' wd-private-portrait--small' : '')}
    role="img" aria-label={`الصورة الشخصية لـ ${name}`}/>;
}
