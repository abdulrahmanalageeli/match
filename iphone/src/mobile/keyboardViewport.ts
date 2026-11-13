const editable = 'textarea:not([disabled]):not([readonly]), input:not([disabled]):not([readonly]):is([type="text"], [type="email"], [type="password"], [type="tel"], [type="number"], [type="search"], [type="url"], [type="date"], :not([type])), [contenteditable="true"]';

/** Follow the soft keyboard; registration scrolls inside the visible viewport. */
export function initializeKeyboardViewport() {
  const root = document.documentElement, viewport = window.visualViewport;
  let restingHeight = Math.max(window.innerHeight, viewport?.height ?? 0), frame = 0, shouldReveal = false;
  let formShell: HTMLElement | null = null, documentOffset = 0;
  const releaseForm = () => {
    if (!formShell) return;
    const connected = formShell.isConnected;
    const scrollY = documentOffset + formShell.scrollTop;
    formShell.removeAttribute('data-nf-keyboard-form');
    root.removeAttribute('data-nf-form-viewport');
    formShell = null;
    // Preserve the place reached while typing, but don't restore a removed route.
    if (connected) window.scrollTo({ top: Math.max(0, scrollY), behavior: 'instant' });
  };
  const update = (reveal = false) => {
    const height = Math.round(viewport?.height ?? window.innerHeight), top = Math.round(viewport?.offsetTop ?? 0);
    const field = document.activeElement instanceof HTMLElement && document.activeElement.matches(editable) ? document.activeElement : null;
    if (!field) restingHeight = Math.max(restingHeight, height, window.innerHeight);
    // Pinch zoom is intentional; it must not be treated as a keyboard opening.
    const resized = window.matchMedia('(any-pointer: coarse)').matches && (viewport?.scale ?? 1) === 1 && height < restingHeight - 80;
    // Keep the shell steady through the keyboard's closing animation after blur.
    if (formShell && (!resized || !formShell.isConnected)) releaseForm();
    const keyboard = Boolean(resized && (field || formShell));
    root.toggleAttribute('data-nf-keyboard', keyboard);
    root.style.setProperty('--nf-visual-height', `${height}px`);
    root.style.setProperty('--nf-visual-top', `${top}px`);
    root.style.setProperty('--nf-keyboard-inset', `${keyboard ? Math.max(0, window.innerHeight - height - top) : 0}px`);
    if (keyboard && !formShell && field && !field.closest('dialog')) {
      const shell = field.closest<HTMLElement>('.nf-intake, .nf-auth-frame');
      if (shell) {
        const before = shell.getBoundingClientRect();
        documentOffset = before.top + window.scrollY;
        formShell = shell;
        root.setAttribute('data-nf-form-viewport', '');
        shell.setAttribute('data-nf-keyboard-form', '');
        shell.scrollTop = Math.max(0, top - before.top);
      }
    }
    // Safari sometimes pans the layout viewport even though the document is fixed.
    if (formShell && window.scrollY !== 0) window.scrollTo({ top: 0, behavior: 'instant' });
    // Direct chat owns its viewport; the family composer is fitted by CSS.
    if (!reveal || !keyboard || !field || (root.hasAttribute('data-nf-chat-viewport') && !field.closest('dialog')) || field.closest('.fb-composer')) return;
    let visibleTop = top + 12, visibleBottom = top + height - 12;
    const header = formShell?.querySelector<HTMLElement>('.nf-intake-header, .flow-header');
    if (header && /sticky|fixed/.test(window.getComputedStyle(header).position)) {
      visibleTop = Math.max(visibleTop, header.getBoundingClientRect().bottom + 12);
    }
    const choices = formShell && field.closest('.nf-choice-select[data-open]')?.querySelector('.nf-choice-panel');
    if (choices) visibleBottom -= Math.min(choices.getBoundingClientRect().height + 12, Math.max(0, visibleBottom - visibleTop - field.getBoundingClientRect().height - 12));
    const dialog = field.closest('dialog');
    if (dialog) {
      const bounds = dialog.getBoundingClientRect();
      visibleTop = Math.max(visibleTop, bounds.top + 12);
      visibleBottom = Math.min(visibleBottom, bounds.bottom - 12);
    }
    const actions = !formShell && field.closest('form')?.querySelector<HTMLElement>('.nf-intake-actions, .nf-studio-actions');
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
  window.addEventListener('scroll', pan);
  window.addEventListener('orientationchange', rotate);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  document.addEventListener('input', schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', pan);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', pan);
    window.removeEventListener('orientationchange', rotate);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
    document.removeEventListener('input', schedule);
    releaseForm();
    root.removeAttribute('data-nf-keyboard');
    for (const property of ['--nf-visual-height', '--nf-visual-top', '--nf-keyboard-inset']) root.style.removeProperty(property);
  };
}
