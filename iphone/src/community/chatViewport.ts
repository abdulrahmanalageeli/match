/** Keep the document and chat on the same visible viewport while a keyboard pans/resizes it. */
export function lockChatViewport(element: HTMLElement, onResize: () => void) {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  const savedScrollY = window.scrollY;
  const chrome = document.querySelector<HTMLElement>('.nf-tester-tools, .demo-notice');
  let restingHeight = Math.max(viewport?.height ?? 0, window.innerHeight);
  let frame = 0;
  root.setAttribute('data-nf-chat-viewport', '');

  const resize = () => {
    const height = Math.max(0, Math.round(viewport?.height ?? window.innerHeight));
    const focused = element.contains(document.activeElement) &&
      document.activeElement?.matches('textarea, input, [contenteditable="true"]');
    // Some browsers shrink innerHeight as well as visualViewport when the keyboard opens.
    if (!focused) restingHeight = Math.max(restingHeight, height, window.innerHeight);
    const keyboard = Boolean(focused && height < restingHeight - 80);
    const inset = keyboard ? 0 : Math.min(height, chrome?.getBoundingClientRect().height ?? 0);
    root.toggleAttribute('data-nf-chat-keyboard', keyboard);
    root.style.setProperty('--chat-viewport-height', height + 'px');
    element.style.setProperty('--chat-viewport-top', Math.round((viewport?.offsetTop ?? 0) + inset) + 'px');
    element.style.setProperty('--chat-available-height', Math.max(0, Math.round(height - inset)) + 'px');
    // Safari can scroll the layout viewport to reveal a focused field, even with body fixed.
    if (window.scrollY !== 0) window.scrollTo({ top: 0, behavior: 'instant' });
    onResize();
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(resize); };
  const rotate = () => { restingHeight = window.innerHeight; schedule(); };
  const observer = new ResizeObserver(schedule);
  if (chrome) observer.observe(chrome);
  resize();
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', rotate);
  element.addEventListener('focusin', schedule);
  element.addEventListener('focusout', schedule);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('orientationchange', rotate);
    element.removeEventListener('focusin', schedule);
    element.removeEventListener('focusout', schedule);
    root.removeAttribute('data-nf-chat-viewport');
    root.removeAttribute('data-nf-chat-keyboard');
    root.style.removeProperty('--chat-viewport-height');
    element.style.removeProperty('--chat-viewport-top');
    element.style.removeProperty('--chat-available-height');
    window.scrollTo({ top: savedScrollY, behavior: 'instant' });
  };
}
