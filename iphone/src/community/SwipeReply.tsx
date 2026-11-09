import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { Reply } from "../BrandIcons";
import './replies.css';

export function SwipeReply({ disabled, onReply, onHold, actionsDisabled = false, actionLabel = 'خيارات الرسالة', actionDescriptionId, children }: {
  disabled: boolean; onReply: () => void; onHold?: () => void; actionsDisabled?: boolean;
  actionLabel?: string; actionDescriptionId?: string; children: ReactNode;
}) {
  const gesture = useRef<{ id: number; x: number; y: number; distance: number; swipe: boolean; held: boolean; axis: 'pending' | 'horizontal' | 'vertical' } | null>(null);
  const suppressClick = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const hold = useRef(onHold); hold.current = onHold;
  const actionsEnabled = Boolean(onHold && !actionsDisabled);
  const canHold = useRef(actionsEnabled); canHold.current = actionsEnabled;
  const [distance, setDistance] = useState(0);
  function stopHold() { if (holdTimer.current !== null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; } }
  function cancelGesture() { stopHold(); gesture.current = null; setDistance(0); }
  useEffect(() => {
    if (!actionsEnabled) { stopHold(); return; }
    const visibility = () => { if (document.hidden) cancelGesture(); };
    const secondaryPointer = (event: globalThis.PointerEvent) => { if (!event.isPrimary) cancelGesture(); };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerdown', secondaryPointer, true);
    window.addEventListener('blur', cancelGesture);
    return () => {
      stopHold(); gesture.current = null;
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerdown', secondaryPointer, true);
      window.removeEventListener('blur', cancelGesture);
    };
  }, [actionsEnabled]);
  const interactive = (target: Element) =>
    (target.closest('button, input, textarea, select, audio, video, [contenteditable="true"]') && !target.closest('button.cm-message-photo, button.cm-once-photo'))
    || target.closest('a:not(.cm-message-photo)');
  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    stopHold();
    gesture.current = null;
    setDistance(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.axis === 'horizontal') suppressClick.current = true;
    if (!cancelled && !current.held && current.axis === 'horizontal' && Math.abs(current.distance) >= 56 && !disabled) {
      onReply();
    }
  }
  return <div className="cm-swipe-message" data-ready={Math.abs(distance) >= 56 || undefined}
    tabIndex={actionsEnabled ? 0 : undefined} role={actionsEnabled ? 'group' : undefined}
    aria-label={actionsEnabled ? actionLabel : undefined} aria-describedby={actionsEnabled ? actionDescriptionId : undefined}
    aria-haspopup={actionsEnabled ? 'dialog' : undefined}
    onPointerDown={event => {
      stopHold();
      if (!event.isPrimary) { cancelGesture(); return; }
      suppressClick.current = false;
      const target = event.target as Element;
      if (event.button !== 0 || interactive(target)) return;
      const swipe = !disabled && event.pointerType !== 'mouse' && event.clientX >= 24 && event.clientX <= window.innerWidth - 24;
      const menu = actionsEnabled && Boolean(target.closest('.cm-bubble'));
      if (!swipe && !menu) return;
      const current = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, swipe, held: false, axis: 'pending' as const };
      gesture.current = current;
      if (menu) holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        if (gesture.current !== current || !canHold.current || document.hidden) return;
        current.held = true; suppressClick.current = true; setDistance(0);
        hold.current?.();
      }, 450);
    }}
    onPointerMove={event => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 10) stopHold();
      if (current.held || !current.swipe) return;
      if (current.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
        current.axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'horizontal' : 'vertical';
        if (current.axis === 'horizontal') event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (current.axis !== 'horizontal') return;
      event.preventDefault();
      current.distance = Math.max(-76, Math.min(76, dx));
      setDistance(current.distance);
    }}
    onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
    onLostPointerCapture={event => finish(event, true)}
    onPointerLeave={() => stopHold()}
    onContextMenu={event => {
      const target = event.target as Element;
      if (!actionsEnabled || interactive(target) || !target.closest('.cm-bubble')) return;
      event.preventDefault(); stopHold();
      if (suppressClick.current) return;
      if (gesture.current) gesture.current.held = true;
      suppressClick.current = true; setDistance(0); hold.current?.();
    }}
    onKeyDown={event => {
      if (!actionsEnabled || event.target !== event.currentTarget || event.repeat ||
        !(event.key === 'Enter' || event.key === ' ' || event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) return;
      event.preventDefault(); cancelGesture(); hold.current?.();
    }}
    onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}>
    <span className="cm-swipe-hint" aria-hidden="true" style={{ opacity: Math.min(1, Math.abs(distance) / 56) }}><Reply size={19}/></span>
    <div className="cm-swipe-content" data-dragging={distance !== 0 || undefined} style={{ transform: distance ? `translateX(${distance}px)` : undefined }}>{children}</div>
  </div>;
}
