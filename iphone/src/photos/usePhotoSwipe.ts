import { useRef, type TouchEvent } from 'react';

// A two-finger interaction belongs to the browser's pinch zoom. While zoomed,
// one finger pans the enlarged photo instead of changing it or closing it.
export function usePhotoSwipe(close: () => void, page?: (offset: number) => void) {
  const start = useRef<{id:number; x:number; y:number} | null>(null);
  const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;
  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      const touch = event.touches[0];
      start.current = event.touches.length === 1 && !zoomed()
        ? {id:touch.identifier, x:touch.clientX, y:touch.clientY} : null;
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      if (event.touches.length !== 1 || zoomed()) start.current = null;
    },
    onTouchCancel() { start.current = null; },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const from = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (!from || event.touches.length || touch.identifier !== from.id || zoomed()) return;
      const dx = touch.clientX - from.x, dy = touch.clientY - from.y;
      if (page && Math.abs(dx) >= 54 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
        page(Math.sign(dx) * (rtl ? 1 : -1));
      } else if (dy >= 72 && dy > Math.abs(dx) * 1.5 && !event.currentTarget.closest('dialog')?.scrollTop) {
        close();
      } else return;
      if (event.cancelable) event.preventDefault();
    },
  };
}
