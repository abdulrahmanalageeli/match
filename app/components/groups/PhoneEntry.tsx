import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { sanitizeToDigits, formatSaudiMobileDisplay, isValidSaudiMobile } from "../../lib/phone";
import { animate } from "motion";
import logoPng from "../../welcome/blindmatch.png";

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

  // Progress for underline fill (0..100)
  const progressPct = useMemo(() => Math.min(digits.length, 10) / 10 * 100, [digits]);

  // Confetti on success
  const fireConfetti = useCallback(async () => {
    try {
      const mod: any = await import("canvas-confetti");
      const confetti = mod?.default || mod;
      confetti({ particleCount: 120, spread: 70, startVelocity: 45, ticks: 150, scalar: 0.9, origin: { y: 0.7 } });
    } catch (_) {
      // no-op if module not available
    }
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
      // confetti celebration, then wipe
      await fireConfetti();
      setTimeout(() => setWipe(true), 180);
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

  // Entry animation for card
  useEffect(() => {
    if (cardRef.current) {
      animate(
        cardRef.current!,
        [
          { opacity: 0, transform: 'translateY(14px) scale(0.98)' },
          { opacity: 1, transform: 'translateY(0px) scale(1)' }
        ] as any,
        { duration: 0.38, easing: 'cubic-bezier(.22,.61,.36,1)' } as any
      );
    }
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden" dir="rtl">
      {/* Animated gradient background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 animate-bg-pan" />
      {/* Opposites Attract: Duality orbs */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {/* Warm orb - top left */}
        <div className="absolute -top-28 -left-28 w-[560px] h-[560px] rounded-full bg-gradient-to-br from-orange-400 via-pink-500 to-pink-600 blur-3xl opacity-70 animate-orb mix-blend-screen" />
        {/* Cool orb - bottom right */}
        <div className="absolute -bottom-32 -right-24 w-[620px] h-[620px] rounded-full bg-gradient-to-br from-blue-600 via-indigo-700 to-indigo-900 blur-3xl opacity-70 animate-orb-alt mix-blend-screen" />
        {/* Premium grain overlay */}
        <div className="absolute inset-0 grain-overlay opacity-[0.05]" />
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

          <div ref={cardRef} className="rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/15 shadow-2xl ring-1 ring-white/10 p-7">
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shadow-lg ring-4 ring-white/5 animate-heartbeat overflow-hidden">
                <img src={logoPng} alt="Blindmatch" className="w-11 h-11 object-contain" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold mb-2 bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">أهلاً بك في التوافق الأعمى</h1>
              <p className="text-slate-200/90 text-sm">أدخل رقمك لنعثر على مجموعتك</p>
              {showWelcome && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30">
                  <Sparkles className="w-4 h-4 text-emerald-300" />
                  <span className="text-emerald-200 text-sm">مرحباً بعودتك، {welcomeName}!</span>
                </div>
              )}
            </div>

            {/* Friendly underline input */}
            <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="tel"
                  inputMode="tel"
                  placeholder="05x xxx xxxx"
                  value={display}
                  onChange={(e) => onChange(e.target.value)}
                  dir="ltr"
                  aria-label="رقم الهاتف"
                  className="w-full bg-transparent border-none outline-none text-white text-center text-3xl tracking-widest placeholder:text-white/30 caret-white selection:bg-white/20 py-3"
                />
                {/* Underline track and fill */}
                <div className="relative h-[3px]">
                  <div className="absolute inset-0 bg-white/15 rounded-full" />
                  <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-blue-600 via-pink-500 to-orange-400 rounded-full" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="mt-2 text-slate-300 text-xs text-center">نستخدم آخر <span className="font-semibold text-white/90">7</span> أرقام فقط للتحقق</p>
                {error && (
                  <p className="text-red-400 text-sm mt-2 text-center">{error}</p>
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
                  } bg-gradient-to-r from-orange-400 via-pink-500 to-blue-600 hover:scale-105 hover:brightness-110`}
                  ref={buttonRef}
                >
                  {/* Spinner when morphing/loading */}
                  {(morph || loading) ? (
                    <span className="inline-block w-5 h-5 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
                  ) : (
                    <span>انضم</span>
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
