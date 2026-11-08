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
  // Let destination entrances play through the live transition snapshot. Finishing
  // every CSS animation here skipped the typography, button and drawn-path reveals.
  const transition = document.startViewTransition(commit);
  active = transition;
  void transition.ready.catch(() => {}); // A second tap can interrupt this snapshot.
  const cleanup = () => {
    if (active !== transition) return;
    active = undefined;
    delete root.dataset.nfWelcomeHandoff;
  };
  void transition.finished.then(cleanup, cleanup);
}
