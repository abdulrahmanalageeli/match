import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { sendPhoneOtp, verifyPhoneOtp } from "./cloud";
import { latinDigits } from "./onboarding/draft";

function saudiMobile(raw: string) {
  const number = latinDigits(raw).replace(/[\s()-]/g, "");
  const match = number.match(/^(?:\+966|00966|966|0)?(5\d{8})$/);
  return match ? "+966" + match[1] : null;
}

export function PhoneAuth({ login, onVerified, busy, setBusy }: {
  login: boolean; onVerified: (userId: string) => void; busy: boolean; setBusy: (value: boolean) => void;
}) {
  const [rawPhone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState({ phone: "", until: 0 });
  const [remaining, setRemaining] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const inflight = useRef(false);
  useEffect(() => {
    if (!cooldown.until) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((cooldown.until - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(() => {
      tick();
      if (Date.now() >= cooldown.until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);
  useEffect(() => { if (sentTo) input.current?.focus(); }, [sentTo]);

  async function submit(event: FormEvent | null, resend = false) {
    event?.preventDefault();
    if (inflight.current || busy) return;
    setError("");
    const phone = sentTo || saudiMobile(rawPhone);
    if (!phone) { setError("أدخل رقم جوال سعودي يبدأ بـ 05 أو ‎+9665."); return; }
    const verify = Boolean(sentTo) && !resend;
    if (verify && !/^\d{6,10}$/.test(code)) { setError("أدخل الأرقام التي وصلتك في رمز التحقق."); return; }
    if (!verify && phone === cooldown.phone && Date.now() < cooldown.until) {
      setError("انتظر قليلًا قبل طلب رمز آخر."); return;
    }
    inflight.current = true;
    setBusy(true);
    try {
      if (verify) {
        onVerified(await verifyPhoneOtp(phone, code));
      } else {
        await sendPhoneOtp(phone, !login);
        setCooldown({ phone, until: Date.now() + 60_000 });
        setCode("");
        setSentTo(phone);
      }
    } catch (cause) {
      setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : "تعذّر الاتصال. حاول مجددًا.");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  return <form className="flow-form" noValidate onSubmit={event => void submit(event)}>
    {sentTo ? <>
      <p className="flow-intro" role="status">أرسلنا رمز تحقق إلى <bdi dir="ltr">{sentTo}</bdi>.</p>
      <label>رمز التحقق<input ref={input} value={code} onChange={event => { setCode(latinDigits(event.target.value).replace(/\D/g, "")); setError(""); }}
        inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={10} required aria-invalid={Boolean(error)} aria-describedby={error ? "phone-auth-error" : undefined} /></label>
    </> : <label>رقم الجوال السعودي<input type="tel" dir="ltr" value={rawPhone}
        autoComplete="tel" inputMode="tel" maxLength={24} placeholder="05xxxxxxxx"
        onChange={event => { setPhone(event.target.value); setError(""); }} required aria-invalid={Boolean(error)} aria-describedby={error ? "phone-auth-error" : undefined} /></label>}
    {error && <p id="phone-auth-error" role="alert" className="form-error">{error}</p>}
    <button className="f-primary" disabled={busy}>
      {sentTo ? "تأكيد رمز التحقق" : "إرسال رمز التحقق"}{sentTo ? <ArrowLeft size={18} /> : <MessageSquareText size={18} />}
    </button>
    {sentTo && <>
      <button type="button" className="f-secondary" disabled={busy || remaining > 0} onClick={() => void submit(null, true)}>
        {remaining > 0 ? "إعادة الإرسال بعد " + remaining.toLocaleString("ar-SA") + " ث" : "إعادة إرسال الرمز"}
      </button>
      <button type="button" className="f-link centered" disabled={busy}
        onClick={() => { setError(""); setSentTo(""); setCode(""); }}>تغيير الرقم</button>
    </>}
  </form>;
}
