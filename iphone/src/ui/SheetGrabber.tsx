import { useEffect, useRef, type PointerEvent } from 'react';
import './sheetGrabber.css';

// Only the handle owns touch input. Lists, editors and controls keep their native gestures.
export function SheetGrabber({ onDismiss }: { onDismiss: () => void }) {
  const drag = useRef<{ id: number; x: number; y: number; start: number; offset: number; dialog: HTMLDialogElement; quiet: boolean } | null>(null);
  const animation = useRef<Animation | null>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => () => {
    if (drag.current) drag.current.dialog.style.removeProperty('translate');
    animation.current?.cancel();
  }, []);

  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    const { dialog, offset, quiet } = current;
    const distance = Math.max(0,event.clientY - current.y);
    const elapsed = Math.max(1,event.timeStamp - current.start);
    const commit = !cancelled && distance > Math.abs(event.clientX - current.x) * 1.3 &&
      (distance >= 64 || (distance >= 34 && distance / elapsed >= .55));
    dialog.style.removeProperty('translate');
    if (quiet || !dialog.animate || !offset) {
      if (commit) dismiss.current();
      return;
    }
    const end = commit ? dialog.offsetHeight + 30 : 0;
    const settling = dialog.animate([{translate:`0 ${offset}px`},{translate:`0 ${end}px`}],
      {duration:commit ? 175 : 195,easing:commit ? 'cubic-bezier(.28,.64,.6,1)' : 'cubic-bezier(.18,.82,.3,1)'});
    animation.current = settling;
    settling.onfinish = () => {
      animation.current = null;
      if (commit && dialog.open && dialog.isConnected) dismiss.current();
    };
  }

  return <div data-sheet-grab="" data-nf-gesture-owner="" aria-hidden="true"
    onPointerDown={event => {
      if (event.pointerType !== 'touch' || !event.isPrimary || animation.current || drag.current) return;
      const dialog = event.currentTarget.closest('dialog');
      if (!dialog?.open || dialog.hasAttribute('data-dismissing')) return;
      const quiet = document.documentElement.dataset.nfMotion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {id:event.pointerId,x:event.clientX,y:event.clientY,start:event.timeStamp,offset:0,dialog,quiet};
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = Math.abs(event.clientX - current.x), dy = event.clientY - current.y;
      if (dx > 9 && dx > dy * 1.3) { finish(event,true); return; }
      current.offset = Math.max(0,dy);
      if (!current.quiet) current.dialog.style.translate = `0 ${current.offset}px`;
    }}
    onPointerUp={event => finish(event)} onPointerCancel={event => finish(event,true)}
    onLostPointerCapture={event => finish(event,true)}/>;
}
