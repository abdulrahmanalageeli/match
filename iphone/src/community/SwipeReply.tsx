import { useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { Reply } from 'lucide-react';
import './replies.css';

export function SwipeReply({ disabled, onReply, children }: { disabled: boolean; onReply: () => void; children: ReactNode }) {
  const gesture = useRef<{ id: number; x: number; y: number; distance: number; axis: 'pending' | 'horizontal' | 'vertical' } | null>(null);
  const suppressClick = useRef(false);
  const [distance, setDistance] = useState(0);
  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    setDistance(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.axis === 'horizontal') suppressClick.current = true;
    if (!cancelled && current.axis === 'horizontal' && Math.abs(current.distance) >= 56 && !disabled) {
      onReply();
    }
  }
  return <div className="cm-swipe-message" data-ready={Math.abs(distance) >= 56 || undefined}
    onPointerDown={event => {
      suppressClick.current = false;
      const target = event.target as Element;
      if (disabled || event.pointerType === 'mouse' || !event.isPrimary || event.clientX < 24 || event.clientX > window.innerWidth - 24 ||
        target.closest('button, input, textarea, audio, video') || target.closest('a:not(.cm-message-photo)')) return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, axis: 'pending' };
    }}
    onPointerMove={event => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
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
    onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}>
    <span className="cm-swipe-hint" aria-hidden="true" style={{ opacity: Math.min(1, Math.abs(distance) / 56) }}><Reply size={19}/></span>
    <div className="cm-swipe-content" data-dragging={distance !== 0 || undefined} style={{ transform: distance ? `translateX(${distance}px)` : undefined }}>{children}</div>
  </div>;
}
