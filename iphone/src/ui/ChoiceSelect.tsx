import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from "../BrandIcons";
import './ChoiceSelect.css';

export type ChoiceOption = { value: string; label: string; group?: string; keywords?: readonly string[] };
type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ChoiceOption[];
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  'data-field'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
};

export const normalizeChoiceSearch = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace(/[\u064B-\u065F\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();

/** Only an explicit option selection changes the saved answer; typing is search only. */
export function ChoiceSelect({ label, value, onChange, options, placeholder = 'اختر من القائمة', allowClear = false, disabled = false, required = false, id, ...field }: Props) {
  const generatedId = useId();
  const inputId = id ?? `nf-choice-${generatedId}`;
  const listId = `${inputId}-list`;
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const known = options.find(option => option.value === value);
  const choices = useMemo<readonly ChoiceOption[]>(() => value && !options.some(option => option.value === value)
    ? [{ value, label: value, group: 'القيمة المحفوظة' }, ...options] : options, [options, value]);
  const filtered = useMemo(() => {
    const words = normalizeChoiceSearch(query).split(/\s+/).filter(Boolean);
    return choices.filter(option => {
      const text = normalizeChoiceSearch([option.label, option.group ?? '', ...(option.keywords ?? [])].join(' '));
      return words.every(word => text.includes(word));
    });
  }, [choices, query]);
  const expanded = open && !disabled;
  const selectedLabel = known?.label ?? value;
  const activeIndex = Math.min(active, filtered.length - 1);

  function close() { setOpen(false); setQuery(''); }
  function show() {
    if (disabled) return;
    setQuery('');
    setActive(Math.max(0, choices.findIndex(option => option.value === value)));
    setOpen(true);
  }
  function choose(next: string) { onChange(next); input.current?.focus(); close(); }

  useEffect(() => {
    if (!expanded) return;
    let frame = 0;
    function revealPanel() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = panel.current;
        if (!element) return;
        // The keyboard viewport owns focused-field placement. Scrolling this
        // panel independently would push its search input above the header.
        if (element.closest('[data-nf-keyboard-form]')) return;
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop ?? 0;
        const bottom = top + (viewport?.height ?? window.innerHeight);
        const bounds = element.getBoundingClientRect();
        // Leave space for the intake's fixed actions; already-visible choices stay still.
        if (bounds.bottom > bottom - 160 || bounds.top < top + 12) element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      });
    }
    revealPanel();
    window.visualViewport?.addEventListener('resize', revealPanel);
    return () => { cancelAnimationFrame(frame); window.visualViewport?.removeEventListener('resize', revealPanel); };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(false); setQuery(''); }
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const option = list.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    const viewport = list.current;
    if (!option || !viewport) return;
    const optionBounds = option.getBoundingClientRect();
    const listBounds = viewport.getBoundingClientRect();
    if (optionBounds.top < listBounds.top) viewport.scrollTop -= listBounds.top - optionBounds.top;
    else if (optionBounds.bottom > listBounds.bottom) viewport.scrollTop += optionBounds.bottom - listBounds.bottom;
  }, [activeIndex, expanded, query]);

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) { show(); return; }
      setActive(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!expanded) show();
      else if (filtered[activeIndex]) choose(filtered[activeIndex].value);
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (!expanded && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      setQuery(event.key);
      setActive(0);
      setOpen(true);
    }
  }

  return <div ref={root} className="nf-choice-select" data-open={expanded || undefined} data-disabled={disabled || undefined}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
    <label htmlFor={inputId} className="nf-choice-label">{label}</label>
    <div className="nf-choice-control" data-invalid={field['aria-invalid'] === true || field['aria-invalid'] === 'true' || undefined}>
      {expanded && <Search className="nf-choice-search-icon" size={16} aria-hidden="true" />}
      <input {...field} ref={input} id={inputId} role="combobox" type="text" autoComplete="off" spellCheck={false}
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        aria-required={required || undefined} disabled={disabled} value={expanded ? query : selectedLabel}
        placeholder={expanded ? 'ابحث في الخيارات…' : placeholder} onFocus={show} onClick={() => { if (!expanded) show(); }} onKeyDown={keyDown}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} />
      <button type="button" className="nf-choice-toggle" tabIndex={-1} disabled={disabled} aria-label={`${expanded ? 'إغلاق' : 'فتح'} خيارات ${label}`}
        aria-expanded={expanded} onMouseDown={event => event.preventDefault()} onClick={() => { if (expanded) close(); else { input.current?.focus(); show(); } }}>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
    </div>
    {expanded && <div ref={panel} className="nf-choice-panel">
      <div className="nf-choice-hint"><span>اختر إجابة واحدة</span><span>{new Intl.NumberFormat('ar-SA').format(filtered.length)} خيار</span></div>
      <div ref={list} id={listId} role="listbox" aria-label={label} className="nf-choice-list">
        {filtered.map((option, index) => <div key={option.value} role="presentation">
          {option.group && option.group !== filtered[index - 1]?.group && <div className="nf-choice-group" role="presentation">{option.group}</div>}
          <button type="button" id={`${listId}-${index}`} role="option" aria-selected={option.value === value}
            tabIndex={-1} className="nf-choice-option" data-index={index} data-active={index === activeIndex || undefined}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(option.value)}>
            <span>{option.label}</span><span className="nf-choice-check" aria-hidden="true">{option.value === value && <Check size={15} />}</span>
          </button>
        </div>)}
      </div>
      {!filtered.length && <p className="nf-choice-empty" role="status">لا توجد نتيجة. جرّب اسمًا آخر أو امسح البحث لعرض جميع الخيارات.</p>}
      {allowClear && value && <button type="button" className="nf-choice-clear" onMouseDown={event => event.preventDefault()} onClick={() => choose('')}><X size={14} aria-hidden="true" /> مسح الاختيار</button>}
    </div>}
  </div>;
}
