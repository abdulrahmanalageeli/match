import { flushSync } from "react-dom";
import "./welcomeNavigation.css";

let active: ViewTransition | undefined;
let latest = 0;

export function welcomeNavigation(move: () => void, direction: "forward" | "back", focus: string) {
  const id = ++latest;
  const root = document.documentElement;
  active?.skipTransition();
  function commit() {
    if (id !== latest) return;
    flushSync(move);
    const target = document.querySelector<HTMLElement>(focus);
    if (!target) return;
    if (target.matches("h1")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
  if (!document.startViewTransition || document.hidden || root.dataset.nfMotion === "reduced" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit();
    return;
  }
  root.dataset.nfWelcomeHandoff = direction;
  const transition = document.startViewTransition(() => {
    commit();
    if (id !== latest || direction === "back") return;
    // Snapshot the destination at rest so its own entrance doesn't hide content during the handoff.
    const page = document.querySelector(".phone-app main");
    for (const animation of page?.getAnimations({ subtree: true }) ?? []) {
      if (animation instanceof CSSAnimation && animation.effect?.getTiming().iterations === 1) animation.finish();
    }
  });
  active = transition;
  void transition.ready.catch(() => {}); // A second tap can interrupt this snapshot.
  const cleanup = () => {
    if (active !== transition) return;
    active = undefined;
    delete root.dataset.nfWelcomeHandoff;
  };
  void transition.finished.then(cleanup, cleanup);
}
