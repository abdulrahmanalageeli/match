import { flushSync } from "react-dom";

type Destination = () => { marker: Element | null; focus: HTMLElement | null };
let active: ViewTransition | undefined;
let latest = 0;

// Capture only the identity mark. Previews, messages, and drafts stay in the live DOM.
export function chatHandoff(origin: Element | null, move: () => void, destination: Destination) {
  const root = document.documentElement;
  const originScreen = origin?.closest(".cm-profile, .cm-view, .cm-chat");
  const id = ++latest;
  active?.skipTransition();
  const commit = (animated: boolean) => {
    if (id !== latest || (originScreen && !originScreen.isConnected)) return;
    flushSync(move);
    const target = destination();
    if (animated) target.marker?.setAttribute("data-chat-mark", "");
    target.focus?.focus({ preventScroll: true });
  };
  const bounds = origin?.getBoundingClientRect();
  if (!document.startViewTransition || document.hidden || !origin || !bounds ||
      bounds.bottom <= 0 || bounds.top >= innerHeight || root.dataset.nfMotion === "reduced" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit(false);
    return;
  }
  document.querySelectorAll("[data-chat-mark]").forEach(node => node.removeAttribute("data-chat-mark"));
  root.dataset.nfChatHandoff = "";
  origin.setAttribute("data-chat-mark", "");
  const transition = document.startViewTransition(() => commit(true));
  active = transition;
  void transition.ready.catch(() => {}); // Retargeting an in-flight capture is expected.
  const clear = () => {
    if (active !== transition) return;
    active = undefined;
    delete root.dataset.nfChatHandoff;
    document.querySelectorAll("[data-chat-mark]").forEach(node => node.removeAttribute("data-chat-mark"));
  };
  void transition.finished.then(clear, clear);
}
