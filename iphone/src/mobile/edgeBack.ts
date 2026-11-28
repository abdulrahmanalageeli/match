import { Capacitor } from '@capacitor/core';

// Only explicitly opted-in buttons can be invoked. A nested step takes precedence
// over its screen, including while its own back button is disabled.
function backButton(target: Element) {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('dialog[open], [aria-modal="true"]:not(dialog)'))
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility === 'visible');
  const modal = target.closest<HTMLElement>('dialog[open], [aria-modal="true"]');
  if (dialogs.length && (!modal?.hasAttribute('data-nf-back-scope') || dialogs.some(el => !el.contains(modal)))) return null;
  const rendered = Array.from((modal ?? document).querySelectorAll<HTMLButtonElement>('button[data-nf-back]')).reverse()
    .filter(button => !button.closest('[hidden], [inert], [aria-hidden="true"]') &&
      button.getClientRects().length && getComputedStyle(button).visibility === 'visible');
  const button = rendered.find(item => item.dataset.nfBack === 'local') ?? rendered[0];
  return button && !button.matches(':disabled, [aria-disabled="true"]') ? button : null;
}

function blocked() {
  return document.hidden || document.documentElement.matches('[data-nf-keyboard], [data-nf-chat-keyboard], [data-capture-hidden], [data-capture-native-hidden]') ||
    !!document.querySelector('[data-nf-back-block]') ||
    (window.visualViewport?.scale ?? 1) !== 1 || Boolean(document.activeElement?.matches('textarea, select, [contenteditable="true"], input:not([type]), input:is([type="text"], [type="email"], [type="tel"], [type="password"], [type="search"], [type="number"])'));
}

function ownsHorizontalGesture(target: Element) {
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="tablist"], [data-nf-gesture-owner], video, canvas')) return true;
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /^(auto|scroll)$/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

export function initializeEdgeBack() {
  const installedIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?: boolean}).standalone === true;
  if (Capacitor.getPlatform() !== 'ios' && !(installedIOS && standalone)) return () => {};
  let drag: { id: number; x: number; y: number; sign: number; target: Element; button: HTMLButtonElement; claimed: boolean } | null = null;

  function cancel() {
    drag = null;
    document.removeEventListener('touchmove', move, true);
    document.removeEventListener('touchend', finish, true);
    document.removeEventListener('touchcancel', cancel, true);
  }
  function start(event: TouchEvent) {
    cancel();
    if (event.touches.length !== 1 || !(event.target instanceof Element)) return;
    const touch = event.touches[0], sign = document.documentElement.dir === 'rtl' ? -1 : 1;
    const fromEdge = sign === 1 ? touch.clientX : window.innerWidth - touch.clientX;
    if (fromEdge >= 24 || blocked() || ownsHorizontalGesture(event.target) || window.getSelection()?.isCollapsed === false) return;
    const button = backButton(event.target);
    if (!button) return;
    drag = {id: touch.identifier, x: touch.clientX, y: touch.clientY, sign, target:event.target, button, claimed: false};
    // Reserve a blocking move listener only during an eligible edge interaction.
    document.addEventListener('touchmove', move, {capture:true, passive:false});
    document.addEventListener('touchend', finish, {capture:true, passive:false});
    document.addEventListener('touchcancel', cancel, {capture:true, passive:true});
  }
  function move(event: TouchEvent) {
    if (!drag || event.touches.length !== 1) return cancel();
    const touch = event.touches[0];
    const dx = (touch.clientX - drag.x) * drag.sign, dy = Math.abs(touch.clientY - drag.y);
    if (touch.identifier !== drag.id || dx < -8 || (dy > 10 && dy > dx / 1.4)) return cancel();
    if (dx < 10 && !drag.claimed) return;
    if (!event.cancelable) return cancel(); // The OS or a scroll view already owns this stream.
    drag.claimed = true;
    event.preventDefault();
  }
  function finish(event: TouchEvent) {
    const gesture = drag;
    cancel();
    if (!gesture?.claimed || event.touches.length || blocked() || !gesture.target.isConnected || backButton(gesture.target) !== gesture.button) return;
    const touch = event.changedTouches[0];
    if (!touch || touch.identifier !== gesture.id) return;
    const dx = (touch.clientX - gesture.x) * gesture.sign;
    if (dx < Math.min(88, window.innerWidth * .18) || dx < Math.abs(touch.clientY - gesture.y) * 1.4) return;
    if (event.cancelable) event.preventDefault();
    gesture.button.click();
  }
  document.addEventListener('touchstart', start, {capture:true, passive:true});
  document.addEventListener('visibilitychange', cancel);
  return () => { cancel(); document.removeEventListener('touchstart', start, true); document.removeEventListener('visibilitychange', cancel); };
}
