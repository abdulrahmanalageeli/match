import { useEffect, useRef, type ReactNode } from 'react';
import { X } from '../BrandIcons';

export function Sheet({
  title,
  onClose,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      dir="rtl"
      aria-label={title}
      className={className ? `cm-sheet ${className}` : "cm-sheet"}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="إغلاق">
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
