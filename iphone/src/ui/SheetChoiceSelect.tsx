import { useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, Search, X } from '../BrandIcons';
import { ChoiceSelect, normalizeChoiceSearch } from './ChoiceSelect';
import './SheetChoiceSelect.css';

/** A value row opens a focused picker; opening it does not summon the keyboard. */
export function SheetChoiceSelect({ label, value, onChange, options, placeholder = 'اختر', allowClear = false, disabled = false, required = false, id, ...field }: ComponentProps<typeof ChoiceSelect>) {
  const generated = useId();
  const triggerId = id ?? `nf-sheet-choice-${generated}`;
  const listId = `${triggerId}-list`;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const known = options.find(option => option.value === value);
  const choices = useMemo(() => value && !options.some(option => option.value === value)
    ? [{ value, label: value, group: 'القيمة المحفوظة' }, ...options] : options, [options, value]);
  const filtered = useMemo(() => {
    const words = normalizeChoiceSearch(query).split(/\s+/).filter(Boolean);
    return choices.filter(option => {
      const text = normalizeChoiceSearch([option.label, option.group ?? '', ...('keywords' in option ? option.keywords ?? [] : [])].join(' '));
      return words.every(word => text.includes(word));
    });
  }, [choices, query]);
  const activeIndex = Math.min(active, filtered.length - 1);
  const expanded = open && !disabled;

  useLayoutEffect(() => {
    if (!expanded) return;
    const sheet = dialog.current;
    if (!sheet) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.showModal();
    cancel.current?.focus({ preventScroll: true });
    return () => {
      sheet.close();
      document.body.style.overflow = overflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const option = list.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    const viewport = list.current;
    if (!option || !viewport) return;
    const item = option.getBoundingClientRect(), box = viewport.getBoundingClientRect();
    if (item.top < box.top) viewport.scrollTop -= box.top - item.top;
    else if (item.bottom > box.bottom) viewport.scrollTop += item.bottom - box.bottom;
  }, [activeIndex, expanded]);

  function close() {
    if (document.activeElement instanceof HTMLElement && dialog.current?.contains(document.activeElement)) document.activeElement.blur();
    setOpen(false);
  }
  function choose(next: string) { onChange(next); close(); }
  function keyboard(event: KeyboardEvent<HTMLElement>, fromSearch = false) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && (!fromSearch || !['Home', 'End'].includes(event.key))) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 : Math.max(0, Math.min(filtered.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
      setActive(next);
      if (!fromSearch) list.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus({ preventScroll: true });
    } else if (fromSearch && event.key === 'Enter') {
      event.preventDefault();
      if (filtered[activeIndex]) choose(filtered[activeIndex].value);
    }
  }

  return <>
    <button {...field} ref={trigger} id={triggerId} type="button" className="nf-sheet-choice-row" disabled={disabled}
      aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? `${triggerId}-dialog` : undefined}
      aria-label={`${label}${required ? '، مطلوب' : ''}، ${known?.label ?? (value || placeholder)}`}
      onClick={() => { setQuery(''); setActive(Math.max(0, choices.findIndex(option => option.value === value))); setOpen(true); }}>
      <span className="nf-sheet-choice-label">{label}</span>
      <span className="nf-sheet-choice-value" data-empty={!value || undefined}>{known?.label ?? (value || placeholder)}</span>
      <ChevronLeft size={17} aria-hidden="true"/>
    </button>
    {expanded && createPortal(<dialog ref={dialog} id={`${triggerId}-dialog`} className="nf-choice-sheet" dir="rtl" aria-labelledby={`${triggerId}-title`}
      onCancel={event => { event.preventDefault(); close(); }} onClose={() => setOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
      <header className="nf-choice-sheet-header"><button ref={cancel} type="button" onClick={close}>إلغاء</button><h2 id={`${triggerId}-title`}>{label}</h2><span aria-hidden="true"/></header>
      <div className="nf-choice-sheet-search"><Search size={18} aria-hidden="true"/>
        <input type="search" role="combobox" aria-label={`بحث في ${label}`} aria-autocomplete="list" aria-expanded="true" aria-controls={listId}
          aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined} value={query}
          onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => keyboard(event, true)}
          placeholder="بحث" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search"/>
        {query && <button type="button" onClick={() => { setQuery(''); setActive(0); }} aria-label="مسح البحث"><X size={16}/></button>}
      </div>
      <div ref={list} id={listId} role="listbox" aria-label={label} className="nf-choice-sheet-list" onKeyDown={event => keyboard(event)}>
        {filtered.map((option, index) => <div key={option.value} role="presentation">
          {option.group && option.group !== filtered[index - 1]?.group && <div className="nf-choice-sheet-group" role="presentation">{option.group}</div>}
          <button type="button" role="option" aria-selected={option.value === value} id={`${listId}-${index}`} data-index={index}
            tabIndex={index === activeIndex ? 0 : -1} className="nf-choice-sheet-option" onFocus={() => setActive(index)} onClick={() => choose(option.value)}>
            <span>{option.label}</span>{option.value === value && <Check size={18} aria-hidden="true"/>}
          </button>
        </div>)}
        {!filtered.length && <p className="nf-choice-sheet-empty" role="status">لا توجد نتائج لهذا البحث.</p>}
      </div>
      {allowClear && value && <button type="button" className="nf-choice-sheet-clear" onClick={() => choose('')}>إزالة الاختيار</button>}
    </dialog>, document.body)}
  </>;
}
