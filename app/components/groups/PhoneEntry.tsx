import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Smartphone, Sparkles } from "lucide-react";
import { sanitizeToDigits, formatSaudiMobileDisplay, isValidSaudiMobile } from "../../lib/phone";
import { animate } from "motion";

interface PhoneEntryProps {
  onSubmit: (digitsOnly: string) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  enableParticles?: boolean;
}

export default function PhoneEntry({ onSubmit, loading = false, error, enableParticles = false }: PhoneEntryProps) {
  const [digits, setDigits] = useState("");
  const [display, setDisplay] = useState("");
  const [valid, setValid] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [morph, setMorph] = useState(false);
  const [wipe, setWipe] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wipeRef = useRef<HTMLDivElement | null>(null);
  const clickSound = useRef<HTMLAudioElement | null>(null);
  const successSound = useRef<HTMLAudioElement | null>(null);

  // Autofocus and load cached name
  useEffect(() => {
    inputRef.current?.focus();
    try {
      const name = localStorage.getItem("blindmatch_participant_name");
      if (name && name.trim()) setWelcomeName(name);
    } catch {}
    // Prepare optional sounds if available
    try {
      clickSound.current = new Audio("/sounds/click.mp3");
      successSound.current = new Audio("/sounds/success.mp3");
    } catch {}
  }, []);

  // Format on change
  const onChange = useCallback((value: string) => {
    const d = sanitizeToDigits(value);
    setDigits(d);
    setDisplay(formatSaudiMobileDisplay(d));
    setValid(isValidSaudiMobile(d));
  }, []);

  // Welcome message only when valid and name exists
  const showWelcome = useMemo(() => valid && !!welcomeName, [valid, welcomeName]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!valid || loading) return;
    try {
      setMorph(true);
      clickSound.current?.play().catch(() => {});
      // subtle press feedback
      if (buttonRef.current) {
        await animate(buttonRef.current!, { transform: 'scale(0.98)' } as any, { duration: 0.12 } as any).finished;
        await animate(buttonRef.current!, { transform: 'scale(1)' } as any, { duration: 0.18, easing: 'ease-out' } as any).finished;
      }
      await onSubmit(digits);
      // Success
      successSound.current?.play().catch(() => {});
      // fade/shift the card slightly for a premium feel
      if (cardRef.current) {
        animate(
          cardRef.current!,
          [
            { opacity: 1, transform: 'translateY(0px)' },
            { opacity: 0.92, transform: 'translateY(-6px)' }
          ] as any,
          { duration: 0.25, easing: 'ease-out' } as any
        );
      }
      setTimeout(() => setWipe(true), 120); // small delay then wipe
    } catch (err) {
      // Revert on error
      setMorph(false);
    }
  };

  // Trigger wipe scaling animation when wipe becomes true
  useEffect(() => {
    if (wipe && wipeRef.current) {
      animate(wipeRef.current!, { transform: 'scale(120)' } as any, { duration: 0.7, easing: 'cubic-bezier(.22,.61,.36,1)' } as any);
    }
  }, [wipe]);

  return (
    <div className="relative min-h-screen overflow-hidden" dir="rtl">
      {/* Animated gradient background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 animate-bg-pan" />
      {/* Subtle moving dots overlay */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute top-10 right-10 w-36 h-36 rounded-full bg-white/5 blur-3xl animate-float-particle" />
        <div className="absolute bottom-20 left-12 w-44 h-44 rounded-full bg-white/5 blur-3xl animate-float-particle-reverse" />
      </div>

      {/* Screen wipe overlay */}
      {wipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div ref={wipeRef} className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-full w-12 h-12" style={{ transform: 'scale(0)' }} />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="relative w-full max-w-md">
          {/* Aura behind card */}
          <div className="absolute -inset-8 -z-10 rounded-[28px] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.35),transparent_60%)] animate-pulse-slow" />

          <div ref={cardRef} className="rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl ring-1 ring-white/10 p-7">
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg ring-4 ring-white/10">
                <Smartphone className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-extrabold text-white mb-1">ادخل بوابتك إلى المجموعة</h1>
              <p className="text-slate-300 text-sm">أدخل رقم هاتفك للوصول إلى الأنشطة الجماعية</p>
              {showWelcome && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30">
                  <Sparkles className="w-4 h-4 text-emerald-300" />
                  <span className="text-emerald-200 text-sm">مرحباً بعودتك، {welcomeName}!</span>
                </div>
              )}
            </div>

            {/* Floating label input */}
            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
              <div className="relative text-right">
                <input
                  ref={inputRef}
                  type="tel"
                  inputMode="tel"
                  placeholder=" "
                  value={display}
                  onChange={(e) => onChange(e.target.value)}
                  dir="ltr"
                  aria-label="رقم الهاتف"
                  className="peer w-full rounded-2xl bg-white/5 border border-white/20 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/30 py-4 pr-4 pl-4 text-white placeholder-transparent outline-none transition-all"
                />
                <label className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/60 transition-all peer-focus:top-2 peer-focus:text-xs peer-focus:text-white/80 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-base">
                  رقم الهاتف (05x xxx xxxx)
                </label>
                <p className="mt-2 text-slate-400 text-xs">نستخدم آخر <span className="font-semibold text-white/90">7</span> أرقام فقط للتحقق</p>
                {error && (
                  <p className="text-red-400 text-sm mt-2">{error}</p>
                )}
              </div>

              {/* Magic button */}
              <div className="relative h-12">
                <button
                  type="submit"
                  disabled={!valid || loading}
                  className={`absolute inset-0 overflow-hidden inline-flex items-center justify-center rounded-full font-semibold text-white transition-all duration-300 shadow-[0_0_40px_-10px_rgba(109,40,217,0.7)] ${
                    morph ? "w-11 right-1/2 translate-x-1/2" : "w-full"
                  } ${
                    (!valid || loading) ? "opacity-50 cursor-not-allowed" : ""
                  } bg-gradient-to-r from-indigo-500 to-violet-500 hover:scale-105 hover:brightness-110`}
                  ref={buttonRef}
                >
                  {/* Spinner when morphing/loading */}
                  {(morph || loading) ? (
                    <span className="inline-block w-5 h-5 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
                  ) : (
                    <span>ادخل</span>
                  )}
                </button>
              </div>
            </form>

            {/* Footer note */}
            <div className="mt-5 text-center text-slate-400 text-xs">
              إذا كان لديك رابطك الشخصي محفوظاً، سيتم إدخالك تلقائياً
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
