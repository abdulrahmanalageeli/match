import { useCallback, useLayoutEffect, useRef } from "react";

type Flight = { elements: HTMLElement[]; transition?: ViewTransition };

// Mark just the selected identity and seal. Other candidates, answers and the
// surrounding screen stay outside the browser's transition snapshots.
export function useWeeklyCardTransition() {
  const flight = useRef<Flight | null>(null);
  const clear = useCallback(() => {
    const current = flight.current;
    if (!current) return;
    flight.current = null;
    current.transition?.skipTransition();
    current.elements.forEach(element => delete element.dataset.weeklyMoving);
    delete document.documentElement.dataset.nfWeeklyCard;
  }, []);

  useLayoutEffect(() => {
    const onVisibility = () => { if (document.hidden) clear(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); clear(); };
  }, [clear]);

  return (origin: HTMLElement, swap: () => HTMLElement | null) => {
    clear();
    const root = document.documentElement;
    if (!document.startViewTransition || document.hidden || root.dataset.nfMotion === "reduced" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches) {
      swap();
      return;
    }
    const current: Flight = { elements: [origin] };
    flight.current = current;
    root.dataset.nfWeeklyCard = "";
    origin.dataset.weeklyMoving = "";
    const transition = document.startViewTransition(() => {
      if (flight.current !== current || !origin.isConnected) return;
      const next = swap();
      if (next) {
        next.dataset.weeklyMoving = "";
        current.elements.push(next);
      } else {
        transition.skipTransition();
      }
    });
    current.transition = transition;
    void transition.ready.catch(() => {}); // Interrupted by a second tap.
    const finish = () => { if (flight.current === current) clear(); };
    void transition.finished.then(finish, finish);
  };
}
