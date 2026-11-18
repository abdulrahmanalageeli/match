/** Quiet brand light follows page scrolling, without an animation loop. */
export function initializeSafeAreaLight() {
  let frame = 0;
  let form: HTMLElement | null = null;
  const update = () => {
    frame = 0;
    const offset = window.scrollY + (form?.isConnected ? form.scrollTop : 0);
    document.documentElement.style.setProperty('--nf-safe-scroll', String(Math.max(0, Math.min(1, offset / 160))));
  };
  const scroll = (event: Event) => {
    // Inner lists, chat logs and modal sheets do not move the page's top edge.
    if (event.target instanceof HTMLElement) {
      if (!event.target.matches('[data-nf-keyboard-form]')) return;
      form = event.target;
    } else form = null;
    if (!frame && !document.hidden) frame = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', scroll, {passive:true, capture:true});
  update();
  return () => {
    window.removeEventListener('scroll', scroll, true);
    cancelAnimationFrame(frame);
    document.documentElement.style.removeProperty('--nf-safe-scroll');
  };
}
