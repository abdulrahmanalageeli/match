import { useSyncExternalStore } from "react";

type DevicePreferences = { largeText: boolean; reducedMotion: boolean; matchSound: boolean; haptics: boolean };
const storageKey = "nisfayn.devicePreferences.v1";
const defaults: DevicePreferences = { largeText: false, reducedMotion: false, matchSound: true, haptics: true };
let current = defaults;
let initialized = false;
const listeners = new Set<() => void>();

function decode(value: string | null): DevicePreferences {
  try {
    const data = value ? JSON.parse(value) : null;
    return { largeText: data?.largeText === true, reducedMotion: data?.reducedMotion === true, matchSound: data?.matchSound !== false, haptics: data?.haptics !== false };
  } catch {
    return defaults;
  }
}

function apply(next: DevicePreferences) {
  current = next;
  document.documentElement.dataset.nfText = next.largeText ? "large" : "standard";
  document.documentElement.dataset.nfMotion = next.reducedMotion ? "reduced" : "system";
  listeners.forEach(notify => notify());
}

export function initializeDevicePreferences() {
  if (initialized || typeof document === "undefined") return;
  initialized = true;
  let next = defaults;
  try {
    next = decode(window.localStorage.getItem(storageKey));
  } catch { /* Device settings remain available for the current session. */ }
  apply(next);
  // WebKit updates this system font when the iOS Content Size Category changes.
  if (CSS.supports("font", "-apple-system-body")) {
    const metric = document.createElement("span");
    metric.setAttribute("aria-hidden", "true");
    metric.style.cssText = "font:-apple-system-body;position:fixed;visibility:hidden;pointer-events:none;width:1em;height:1em";
    document.body.append(metric);
    const sync = () => {
      const size = parseFloat(getComputedStyle(metric).fontSize);
      if (size > 0) document.documentElement.style.setProperty("--nf-system-text", size * 16 / 17 + "px");
    };
    sync();
    new ResizeObserver(sync).observe(metric);
  }
  const updateAmbientVisibility = () => {
    document.documentElement.toggleAttribute('data-nf-ambient-paused', document.hidden);
  };
  updateAmbientVisibility();
  document.addEventListener('visibilitychange', updateAmbientVisibility);
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) apply(decode(event.newValue));
  });
}

function setPreference(name: keyof DevicePreferences, value: boolean) {
  const next = { ...current, [name]: value };
  apply(next);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch { /* Private browsing may make storage unavailable. */ }
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

export function useDevicePreferences() {
  const value = useSyncExternalStore(subscribe, () => current, () => defaults);
  return { value, setPreference };
}

export function getDevicePreferences() { return current; }

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function listenForSystemMotion(notify: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
export function useSystemReducedMotion() {
  return useSyncExternalStore(listenForSystemMotion, () => window.matchMedia(reducedMotionQuery).matches, () => false);
}
