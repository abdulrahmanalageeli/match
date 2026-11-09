import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from "../BrandIcons";
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { getDevicePreferences } from '../settings/preferences';
import './message-focus.css';

type FocusLayout = { left: number; top: number; width: number; bubbleWidth: number; bubbleHeight: number; lift: number; maxHeight: number; right: boolean };
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** A visual snapshot only: holding media must never open it or start playback. */
function bubbleSnapshot(anchor: HTMLElement) {
  const clone = anchor.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-composed');
  clone.removeAttribute('data-message-focus-source');
  const images = anchor.querySelectorAll('img');
  clone.querySelectorAll('img').forEach((image, index) => {
    const original = images[index];
    const canvas = document.createElement('canvas');
    canvas.className = 'cm-message-focus-image';
    if (original?.complete && original.naturalWidth) {
      canvas.width = original.naturalWidth; canvas.height = original.naturalHeight;
      try { canvas.getContext('2d')?.drawImage(original, 0, 0); }
      catch { /* Keep a neutral snapshot; never open or refetch a private photo. */ }
    } else {
      const rect = original?.getBoundingClientRect();
      canvas.width = Math.max(1, rect?.width ?? 180); canvas.height = Math.max(1, rect?.height ?? 120);
    }
    image.replaceWith(canvas);
  });
  clone.querySelectorAll('audio,video,source,track,iframe,dialog').forEach(node => node.remove());
  for (const node of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    node.removeAttribute('id'); node.removeAttribute('autofocus');
    node.removeAttribute('aria-describedby'); node.removeAttribute('aria-labelledby');
    if (node.matches('button,a,input,select,textarea,[tabindex]')) node.setAttribute('tabindex', '-1');
  }
  clone.inert = true;
  clone.setAttribute('aria-hidden', 'true');
  clone.style.width = '100%'; clone.style.maxWidth = 'none'; clone.style.margin = '0';
  return clone;
}

export function MessageFocus({ anchor, label, self, reactions, children, onClose }: {
  anchor: HTMLElement | null; label: string; self: boolean; reactions?: ReactNode; children: ReactNode; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), preview = useRef<HTMLDivElement>(null);
  const reactionBar = useRef<HTMLDivElement>(null), actions = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined), backdropPress = useRef(false);
  const close = useRef(onClose); close.current = onClose;
  const [closing, setClosing] = useState(false);
  const [layout, setLayout] = useState<FocusLayout>(() => ({ left: 16, top: 80, width: 300, bubbleWidth: 240, bubbleHeight: 180, lift: 0, maxHeight: 600, right: self }));
  const [positioned, setPositioned] = useState(false);

  useLayoutEffect(() => {
    const node = dialog.current, host = preview.current;
    if (!node || !host || !anchor?.isConnected) { close.current(); return; }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalRect = anchor.getBoundingClientRect();
    const clone = bubbleSnapshot(anchor);
    host.replaceChildren(clone);
    const place = () => {
      const viewport = window.visualViewport;
      const offsetLeft = viewport?.offsetLeft ?? 0, offsetTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth, viewportHeight = viewport?.height ?? window.innerHeight;
      const availableWidth = Math.max(160, viewportWidth - 32), maxHeight = Math.max(160, viewportHeight - 80);
      const width = Math.min(availableWidth, Math.max(300, originalRect.width));
      const bubbleWidth = Math.min(originalRect.width, width);
      const right = originalRect.left + originalRect.width / 2 >= offsetLeft + viewportWidth / 2;
      const left = clamp(right ? originalRect.right - width : originalRect.left, offsetLeft + 16, offsetLeft + viewportWidth - width - 16);
      const above = reactions ? (reactionBar.current?.offsetHeight || 58) + 10 : 0;
      const below = (actions.current?.offsetHeight || 110) + 12;
      const bubbleHeight = Math.min(originalRect.height, Math.max(56, maxHeight - above - below));
      const total = above + bubbleHeight + below;
      const top = clamp(originalRect.top - above - 8, offsetTop + 60, offsetTop + viewportHeight - total - 20);
      setLayout({ left, top, width, bubbleWidth, bubbleHeight, lift: originalRect.top - (top + above), maxHeight, right });
      setPositioned(true);
    };
    node.showModal();
    place();
    anchor.setAttribute('data-message-focus-source', '');
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.clearTimeout(closeTimer.current);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      anchor.removeAttribute('data-message-focus-source');
      node.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [anchor]);

  function dismiss() {
    if (closing) return;
    if (getDevicePreferences().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { close.current(); return; }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => close.current(), 160);
  }

  return <dialog ref={dialog} className="cm-message-focus" dir="rtl" aria-label="خيارات الرسالة" data-closing={closing || undefined}
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onPointerDown={event => { backdropPress.current = event.target === event.currentTarget; }}
    onPointerCancel={() => { backdropPress.current = false; }}
    onClick={event => { if (event.target === event.currentTarget && backdropPress.current) dismiss(); backdropPress.current = false; }}>
    <MotionPressButton className="cm-message-focus-dismiss" aria-label="إغلاق" onClick={dismiss} autoFocus><X size={19}/></MotionPressButton>
    <div className="cm-message-focus-stage" data-side={layout.right ? 'right' : 'left'} style={{ left: layout.left, top: layout.top, width: layout.width, maxHeight: layout.maxHeight, visibility: positioned ? 'visible' : 'hidden' }}>
      <div ref={reactionBar} className="cm-message-focus-reactions">{reactions && <MotionReveal distance={10} duration={240} delay={50}>{reactions}</MotionReveal>}</div>
      <div className="cm-message-focus-lift" style={{ width: layout.bubbleWidth }}>
        {positioned ? <MotionReveal distance={layout.lift} fromOpacity={1} fromScale={.98} duration={280}>
          <div className="cm-message-focus-snapshot" role="img" aria-label={label} style={{ maxHeight: layout.bubbleHeight }}>
            <div ref={element => { if (element && preview.current?.firstChild) element.append(preview.current.firstChild); }} />
          </div>
        </MotionReveal> : null}
      </div>
      <div ref={preview} hidden />
      <div ref={actions} className="cm-message-focus-actions"><MotionReveal distance={8} duration={260} delay={90}>{children}</MotionReveal></div>
    </div>
  </dialog>;
}
