const editable = 'textarea:not([disabled]):not([readonly]), input:not([disabled]):not([readonly]):is([type="text"], [type="email"], [type="password"], [type="tel"], [type="number"], [type="search"], [type="url"], :not([type])), [contenteditable="true"]';

/** Follow the soft keyboard without locking the document or changing focus. */
export function initializeKeyboardViewport() {
  const root = document.documentElement, viewport = window.visualViewport;
  let restingHeight = Math.max(window.innerHeight, viewport?.height ?? 0), frame = 0, shouldReveal = false;
  const update = (reveal = false) => {
    const height = Math.round(viewport?.height ?? window.innerHeight), top = Math.round(viewport?.offsetTop ?? 0);
    const field = document.activeElement instanceof HTMLElement && document.activeElement.matches(editable) ? document.activeElement : null;
    if (!field) restingHeight = Math.max(restingHeight, height, window.innerHeight);
    // Pinch zoom is intentional; it must not be treated as a keyboard opening.
    const keyboard = Boolean(field && window.matchMedia('(any-pointer: coarse)').matches && (viewport?.scale ?? 1) === 1 && height < restingHeight - 80);
    root.toggleAttribute('data-nf-keyboard', keyboard);
    root.style.setProperty('--nf-visual-height', `${height}px`);
    root.style.setProperty('--nf-visual-top', `${top}px`);
    root.style.setProperty('--nf-keyboard-inset', `${keyboard ? Math.max(0, window.innerHeight - height - top) : 0}px`);
    // Direct chat owns its viewport; the family composer is fitted by CSS.
    if (!reveal || !keyboard || !field || (root.hasAttribute('data-nf-chat-viewport') && !field.closest('dialog')) || field.closest('.fb-composer')) return;
    let visibleTop = top + 12, visibleBottom = top + height - 12;
    const dialog = field.closest('dialog');
    if (dialog) {
      const bounds = dialog.getBoundingClientRect();
      visibleTop = Math.max(visibleTop, bounds.top + 12);
      visibleBottom = Math.min(visibleBottom, bounds.bottom - 12);
    }
    const actions = field.closest('form')?.querySelector<HTMLElement>('.nf-intake-actions, .nf-studio-actions');
    if (actions) visibleBottom = Math.min(visibleBottom, actions.getBoundingClientRect().top - 12);
    const bounds = field.getBoundingClientRect();
    // Only correct actual occlusion, by the minimum amount. Never recenter a visible field.
    const delta = bounds.top < visibleTop ? bounds.top - visibleTop
      : bounds.height <= visibleBottom - visibleTop && bounds.bottom > visibleBottom ? bounds.bottom - visibleBottom : 0;
    if (Math.abs(delta) < 1) return;
    let scroller = field.parentElement;
    while (scroller && scroller !== document.body) {
      if (/(auto|scroll)/.test(window.getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    if (scroller && scroller !== document.body) scroller.scrollBy({ top: delta, behavior: 'instant' });
    else window.scrollBy({ top: delta, behavior: 'instant' });
  };
  const queue = (reveal: boolean) => {
    shouldReveal ||= reveal;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { const correct = shouldReveal; shouldReveal = false; update(correct); });
  };
  const schedule = () => queue(true);
  // A user can scroll away from a field to read the page without fighting auto-scroll.
  const pan = () => queue(false);
  const rotate = () => { restingHeight = window.innerHeight; schedule(); };
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', pan);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', rotate);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', pan);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', rotate);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
    root.removeAttribute('data-nf-keyboard');
    for (const property of ['--nf-visual-height', '--nf-visual-top', '--nf-keyboard-inset']) root.style.removeProperty(property);
  };
}
