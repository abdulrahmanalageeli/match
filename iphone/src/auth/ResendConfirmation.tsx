import { useEffect, useRef, useState, type FormEvent } from 'react';
import { resendSignupConfirmation } from '../cloud';

export function ResendConfirmation({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const cooldown = useRef(0), inflight = useRef(false);
  useEffect(() => {
    if (!remaining) return;
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((cooldown.current - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [remaining > 0]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || inflight.current || Date.now() < cooldown.current || !event.currentTarget.reportValidity()) return;
    inflight.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await resendSignupConfirmation(email);
      cooldown.current = Date.now() + 60_000; setRemaining(60);
      setMessage('إذا كان البريد بحاجة إلى تأكيد، ستصلك رسالة برابط جديد. تحقق أيضًا من البريد غير المرغوب فيه.');
    } catch (cause) {
      setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : 'تعذّر إرسال الرابط. حاول مجددًا.');
    } finally { inflight.current = false; setBusy(false); }
  }
  return <div>
    <button type="button" className="f-link centered" disabled={disabled || busy} aria-expanded={open} aria-controls="signup-resend" onClick={() => setOpen(value => !value)}>لم يصلك رابط تأكيد البريد؟</button>
    {open && <form id="signup-resend" className="flow-form" onSubmit={send}>
      <label>بريد الحساب<input type="email" dir="ltr" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={disabled || busy}/></label>
      <button type="submit" className="f-secondary" disabled={disabled || busy || remaining > 0}>{busy ? 'جارٍ الإرسال…' : remaining ? `إعادة الإرسال بعد ${remaining} ث` : 'إعادة إرسال رابط التأكيد'}</button>
      {message && <p className="flow-intro" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>}
  </div>;
}
