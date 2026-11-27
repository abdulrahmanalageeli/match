import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from '../BrandIcons';

export function Sheet({
  title,
  onClose,
  children,
  className,
  dismissDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  dismissDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const exit = useRef<Animation | null>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { exit.current?.cancel(); dialog.close(); };
  }, []);
  function dismiss() {
    const dialog = ref.current;
    if (dismissDisabled || exit.current) return;
    if (!dialog?.animate || document.hidden || document.documentElement.dataset.nfMotion === 'reduced' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      close.current();
      return;
    }
    const animation = dialog.animate([
      { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
      { opacity: 0, transform: dialog.classList.contains('dr-filter-sheet') ? 'translateY(34px) scale(.995)' : 'translateY(16px) scale(.975)', filter: 'blur(2px)' },
    ], { duration: 210, easing: 'cubic-bezier(.4,0,.7,.2)', fill: 'forwards' });
    exit.current = animation;
    dialog.dataset.dismissing = '';
    animation.onfinish = () => {
      delete dialog.dataset.dismissing;
      exit.current = null;
      if (dialog.open && dialog.isConnected) close.current();
    };
  }
  return (
    <dialog
      ref={ref}
      dir="rtl"
      aria-label={title}
      className={className ? `cm-sheet ${className}` : "cm-sheet"}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-btn" onClick={dismiss} disabled={dismissDisabled} aria-label="إغلاق">
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
