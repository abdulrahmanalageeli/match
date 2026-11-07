import { Keyboard } from 'lucide-react';
import './keyboard.css';

export function KeyboardDismiss() {
  return <button type="button" className="nf-keyboard-dismiss" aria-label="إخفاء لوحة المفاتيح"
    onPointerDown={event => event.preventDefault()}
    onClick={() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }}>
    <Keyboard size={18} aria-hidden="true"/><span>إخفاء لوحة المفاتيح</span>
  </button>;
}
