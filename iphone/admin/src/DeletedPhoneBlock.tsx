import { useState, type FormEvent } from 'react';
import { call, friendly } from './client';

export function DeletedPhoneBlock() {
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function release(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const digits = phone.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[\s()-]/g, '');
    const number = /^05\d{8}$/.test(digits) ? '+966' + digits.slice(1) : digits.replace(/^00/, '+');
    if (!/^\+[1-9]\d{6,14}$/.test(number)) {
      setMessage('أدخل رقمًا سعوديًا يبدأ بـ 05 أو رقمًا بالصيغة الدولية.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const released = await call<boolean>('marriage_release_deleted_phone_block', { phone_number: number, reason });
      setMessage(released ? 'رُفع الحظر. يمكن الآن التسجيل بهذا الرقم.' : 'لا يوجد حظر مرتبط بحساب محذوف لهذا الرقم.');
      setPhone('');
      setReason('');
    } catch (error) {
      setMessage(friendly(error));
    } finally {
      setBusy(false);
    }
  }

  return <details className="panel">
    <summary>مراجعة حظر رقم بعد حذف الحساب</summary>
    <form onSubmit={release}>
      <p>بعد التحقق من طلب المراجعة، يمكنك إتاحة الرقم للتسجيل من جديد.</p>
      <label>رقم الجوال<input type="tel" dir="ltr" autoComplete="off" required value={phone} disabled={busy} onChange={e => setPhone(e.target.value)} /></label>
      <label>سبب رفع الحظر<select required value={reason} disabled={busy} onChange={e => setReason(e.target.value)}>
        <option value="">اختر السبب</option>
        {['قُبل الاعتراض', 'أُعيد تخصيص الرقم', 'تبيّن خطأ التعليق'].map(option => <option key={option}>{option}</option>)}
      </select></label>
      <button className="secondary" disabled={busy || !phone.trim() || !reason}>تأكيد رفع حظر الرقم</button>
      <p role="status">{message}</p>
    </form>
  </details>;
}
