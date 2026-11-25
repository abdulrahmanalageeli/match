import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from '../BrandIcons';
import { setNativeCaptureScope } from '../session';
import { nativePrivatePhoto } from '../community/privatePhoto';
import './capturePrivacy.css';

type Scope = 'discovery' | 'profile' | 'chat';
const active = new Map<symbol, Scope>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function currentScope() {
  const scopes = new Set(active.values());
  return scopes.has('chat') ? 'chat' : scopes.has('profile') ? 'profile' : scopes.has('discovery') ? 'discovery' : null;
}

export function useCapturePrivacy(scope: Scope | null) {
  useLayoutEffect(() => {
    if (!scope || !nativePrivatePhoto()) return;
    const id = Symbol();
    active.set(id, scope);
    listeners.forEach(notify => notify());
    return () => {
      active.delete(id);
      listeners.forEach(notify => notify());
    };
  }, [scope]);
}

const noteTitle: Record<Scope, string> = {
  chat: 'هذه المحادثة خاصة',
  profile: 'لهذا الملف خصوصيته',
  discovery: 'هذه الصور خاصة',
};
const noteText: Record<Scope, string> = {
  chat: 'ما يدور بينكما يبقى بينكما. استأذن قبل مشاركة حديثكما.',
  profile: 'صورة وقصة شاركهما صاحبهما للتعارف. استأذن قبل نقلهما خارج وُدَين.',
  discovery: 'خلف كل صورة شخص اختار أن تتعرّف عليه هنا. استأذن قبل مشاركتها.',
};

function showPrivacyNote() {
  const note = document.getElementById('wd-capture-note');
  if (note instanceof HTMLDialogElement && !note.open) {
    note.showModal();
    pauseVoiceNotes();
  }
}

function pauseVoiceNotes() {
  for (const audio of document.querySelectorAll<HTMLAudioElement>('.cm-voice-note audio')) {
    if (!audio.paused) audio.pause();
  }
}

export function CapturePrivacyHost() {
  return nativePrivatePhoto() ? <NativeCapturePrivacyHost/> : null;
}

function NativeCapturePrivacyHost() {
  const scope = useSyncExternalStore(subscribe, currentScope, () => null);
  const note = useRef<HTMLDialogElement>(null);
  const lifecycleCover = useRef(false);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (scope) root.dataset.captureScope = scope;
    else delete root.dataset.captureScope;
    const nativeUpdate = setNativeCaptureScope(scope ?? 'public');
    if (!scope) return;
    let current = true;
    // Cover entry into a protected route until the native bridge has moved
    // the WebView. Public routes and ordinary browsers have no handshake.
    if (nativeUpdate) {
      const pending = scope === 'discovery' ? 'data-portrait-pending' : 'data-capture-pending';
      root.setAttribute(pending, '');
      void nativeUpdate.finally(() => { if (current) root.removeAttribute(pending); });
    }
    const hide = () => {
      root.toggleAttribute('data-capture-hidden', true);
      pauseVoiceNotes();
      // A body portal alone sits below an open modal's backdrop.
      if (note.current && !note.current.open) {
        lifecycleCover.current = true;
        try { note.current.showModal(); } catch {
          // A document entering the back/forward cache may already be inactive.
          // Its hidden attribute still applies the opaque CSS cover.
        }
      }
    };
    const nativeCovered = () => {
      root.toggleAttribute('data-capture-native-hidden', true);
      pauseVoiceNotes();
    };
    const nativeVisible = () => { delete root.dataset.captureNativeHidden; };
    const visibility = () => {
      if (document.hidden) { hide(); return; }
      delete root.dataset.captureHidden;
      if (lifecycleCover.current) {
        lifecycleCover.current = false;
        note.current?.close();
      }
    };
    const shortcut = (event: KeyboardEvent) => {
      // Operating systems may consume these shortcuts or deliver them late.
      const screenshotChord = event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey &&
        (['Digit3', 'Digit4', 'Digit5'].includes(event.code) ||
         (event.code === 'KeyS' && navigator.userAgent.includes('Windows')));
      if (event.key === 'PrintScreen' || screenshotChord) {
        showPrivacyNote();
      }
    };
    const keepOnTop = (event: FocusEvent) => {
      const modal = note.current;
      if (!modal?.open || !(event.target instanceof Element) ||
          modal.contains(event.target) || !event.target.closest('dialog[open]')) return;
      // An incoming call can present another modal while the screen is covered.
      queueMicrotask(() => {
        if (modal.open && modal.isConnected && !modal.contains(document.activeElement)) {
          modal.close();
          modal.showModal();
        }
      });
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('focusin', keepOnTop);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    window.addEventListener('wudayn:privacy-covered', nativeCovered);
    window.addEventListener('wudayn:privacy-visible', nativeVisible);
    window.addEventListener('keydown', shortcut, true);
    window.addEventListener('keyup', shortcut, true);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('focusin', keepOnTop);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
      window.removeEventListener('wudayn:privacy-covered', nativeCovered);
      window.removeEventListener('wudayn:privacy-visible', nativeVisible);
      window.removeEventListener('keydown', shortcut, true);
      window.removeEventListener('keyup', shortcut, true);
      delete root.dataset.captureScope;
      delete root.dataset.captureHidden;
      delete root.dataset.capturePending;
      delete root.dataset.portraitPending;
      delete root.dataset.captureNativeHidden;
    };
  }, [scope]);
  if (!scope) return null;
  return createPortal(<dialog id="wd-capture-note" className="wd-capture-note" ref={note} dir="rtl"
    onCancel={event => { if (document.documentElement.hasAttribute('data-capture-hidden')) event.preventDefault(); }}
    aria-labelledby="wd-capture-title" aria-describedby="wd-capture-detail">
    <div className="wd-capture-composition">
      <div className="wd-capture-seal" aria-hidden="true"><img className={scope === 'profile' ? 'wd-profile-lock' : undefined} src={scope === 'profile' ? '/brand/wudayn-privacy-lock.webp' : '/brand/wudayn-emblem-v2.png'} alt=""/></div>
      <span className="wd-capture-brand" aria-label="وُدَين">وُدَين</span>
      <span className="wd-capture-rule" aria-hidden="true"/>
      <h2 id="wd-capture-title">{noteTitle[scope]}</h2>
      <p id="wd-capture-detail">{noteText[scope]}</p>
      <button type="button" className="wd-capture-resume" onClick={() => note.current?.close()}>
        <Eye size={16}/> إظهار المحتوى
      </button>
    </div>
  </dialog>, document.body);
}
