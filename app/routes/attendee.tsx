import { useEffect, useState } from "react";
import { Smartphone, Lock, Sparkles, ArrowRight, CheckCircle, AlertCircle, Users, Clock, Zap } from "lucide-react";
import logoPng from "../welcome/blindmatch.png";

export default function AttendeeBridgePage() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // App-shell states
  const [inApp, setInApp] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [bridgeActive, setBridgeActive] = useState(false);
  const [fading, setFading] = useState(false);
  const [pName, setPName] = useState<string | null>(null);
  const [pNumber, setPNumber] = useState<number | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [introStep, setIntroStep] = useState(0);

  useEffect(() => {
    // Initialize shell if user already has a full token or bridge token
    try {
      const fullToken = localStorage.getItem("blindmatch_result_token") || localStorage.getItem("blindmatch_returning_token");
      const bridgeToken = sessionStorage.getItem("blindmatch_bridge_token");
      if (fullToken) {
        setInApp(true);
        setFading(true);
        setIframeSrc("/groups?embedded=1");
        setBridgeActive(false);
      } else if (bridgeToken) {
        setInApp(true);
        setFading(true);
        setIframeSrc("/groups?bridge=1&embedded=1");
        setBridgeActive(true);
      }
    } catch {}
  }, []);

  // Load participant chip if saved in localStorage (from resolve-token flow)
  useEffect(() => {
    try {
      const name = localStorage.getItem("blindmatch_participant_name");
      const numStr = localStorage.getItem("blindmatch_participant_number");
      if (name) setPName(name);
      if (numStr) {
        const n = parseInt(numStr, 10);
        if (!Number.isNaN(n)) setPNumber(n);
      }
    } catch {}
  }, []);

  // Helper to get any available token (full or bridge)
  const getAnyToken = () => {
    try {
      const full = localStorage.getItem("blindmatch_result_token") || localStorage.getItem("blindmatch_returning_token");
      if (full) return full;
      const bridge = sessionStorage.getItem("blindmatch_bridge_token");
      return bridge || null;
    } catch {
      return null;
    }
  };

  // Poll event state and switch iframe between Groups and Round seamlessly
  useEffect(() => {
    if (!inApp) return;
    let mounted = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-event-state" })
        });
        const data = await res.json();
        if (!mounted || !res.ok) return;

        const phase = data?.phase || "registration";
        const token = getAnyToken();

        // Determine desired target src
        let targetSrc = iframeSrc || "";
        if (String(phase).startsWith("round_")) {
          // Move into round page inside shell (requires token)
          if (token) {
            targetSrc = `/welcome?token=${encodeURIComponent(token)}&force_round=1&embedded=1`;
          } else {
            // No token yet, keep groups/bridge while user logs in
            targetSrc = bridgeActive ? "/groups?bridge=1&embedded=1" : "/groups?embedded=1";
          }
        } else {
          // Non-round phases: show Groups
          targetSrc = bridgeActive ? "/groups?bridge=1&embedded=1" : "/groups?embedded=1";
        }

        // Apply if changed
        if (targetSrc !== iframeSrc) {
          setFading(true);
          setIframeSrc(targetSrc);
        }
      } catch {
        // ignore transient errors
      } finally {
        if (mounted) timer = window.setTimeout(poll, 5000);
      }
    };

    poll();
    return () => {
      mounted = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [inApp, bridgeActive, iframeSrc]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "phone-login-bridge", phone_number: phone })
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        setError(data?.error || "لم نتمكن من العثور على مشارك بهذا الرقم");
        return;
      }

      // Store ONLY in sessionStorage (least privilege). Shell/iframes (same-origin) can use it.
      try {
        sessionStorage.setItem("blindmatch_bridge_token", data.secure_token);
        sessionStorage.setItem("blindmatch_bridge_assigned", String(data.assigned_number));
        sessionStorage.setItem("blindmatch_bridge_active", "1");
      } catch {}

      setSuccess("تم التحقق! سيتم تحويلك إلى صفحة المجموعات");

      // Enter shell and show embedded Groups (bridge mode)
      setBridgeActive(true);
      setFading(true);
      setTimeout(() => {
        setInApp(true);
        setIframeSrc("/groups?bridge=1&embedded=1");
        setFading(false);
      }, 300);
    } catch (err: any) {
      setError("حدث خطأ غير متوقع. حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

  // App Shell UI (embedded)
  if (inApp && iframeSrc) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-0 md:px-4" dir="rtl">
        <div className="w-full h-dvh md:h-[85vh] md:max-w-3xl lg:max-w-4xl relative overflow-hidden rounded-none md:rounded-2xl md:border md:border-white/10 [--ring-opacity:0.08] bg-white/5 backdrop-blur-xl md:backdrop-blur-2xl shadow-[0_10px_50px_-12px_rgba(0,0,0,0.55)] will-change-transform">
          {/* Floating minimal header */}
          <div className="absolute z-30 left-3 right-3 top-[max(env(safe-area-inset-top),0.5rem)] md:top-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-white/10 flex items-center justify-center shadow-md/50 border border-white/10 overflow-hidden">
                <img src={logoPng} alt="BlindMatch" className="w-6 h-6 object-contain" />
              </div>
              <div className="text-white/90 text-sm md:text-base font-semibold">التوافق الاعمى</div>
            </div>
            {pNumber && (
              <div className="hidden md:flex items-center gap-2 mr-auto ml-3">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-white/90 shadow-sm">
                  #{pNumber}
                </span>
                {pName && (
                  <span className="max-w-[10rem] truncate text-white/80 text-xs">{pName}</span>
                )}
              </div>
            )}
            {bridgeActive && (
              <span className="px-2.5 py-1 rounded-full text-[10px] md:text-xs font-semibold bg-gradient-to-r from-emerald-500/15 to-lime-500/15 text-emerald-200/90 border border-emerald-400/25 shadow-sm">
                وصول مؤقّت
              </span>
            )}
          </div>

          {/* Ambient gradients for subtle blend */}
          <div className="pointer-events-none absolute -top-48 -left-48 w-[28rem] h-[28rem] rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-600/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-48 -right-48 w-[24rem] h-[24rem] rounded-full bg-gradient-to-tr from-fuchsia-500/5 to-purple-600/5 blur-3xl" />

          {/* Edge fades to merge iframe into background */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-8 md:h-10 bg-gradient-to-b from-slate-900/60 to-transparent z-20" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 md:h-12 bg-gradient-to-t from-slate-900/60 to-transparent z-20" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-3 md:w-4 bg-gradient-to-r from-slate-900/50 to-transparent z-20" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-3 md:w-4 bg-gradient-to-l from-slate-900/50 to-transparent z-20" />

          {/* Subtle inner hairline ring on desktop */}
          <div className="hidden md:block pointer-events-none absolute inset-0 rounded-2xl border border-white/10" />

          {/* Iframe container, edge-to-edge on mobile */}
          <div className={`absolute inset-0 pt-12 md:pt-12 pb-[max(env(safe-area-inset-bottom),0px)] ${fading ? 'opacity-0 scale-[0.997]' : 'opacity-100 scale-100'} transition-[opacity,transform] duration-300 ease-out`}> 
            <iframe
              key={iframeSrc}
              src={iframeSrc}
              className="block w-full h-full rounded-none md:rounded-2xl border-0"
              style={{ background: 'transparent' }}
              loading="eager"
              onLoad={() => setFading(false)}
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Brand transition overlay while switching views */}
          {fading && (
            <>
              {/* Top progress bar */}
              <div className="absolute top-0 left-0 right-0 z-40">
                <div className="h-0.5 bg-white/10 overflow-hidden">
                  <div className="h-0.5 w-1/3 bg-gradient-to-r from-cyan-400/0 via-cyan-400/80 to-cyan-400/0 animate-shimmer" />
                </div>
              </div>
              {/* Center overlay */}
              <div className="absolute inset-0 z-30 flex items-center justify-center">
                <div className="px-6 py-5 rounded-2xl bg-white/8 border border-white/15 backdrop-blur-xl shadow-2xl text-center animate-fade-in">
                  <div className="mx-auto mb-3 w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center overflow-hidden">
                    <img src={logoPng} alt="BlindMatch" className="w-7 h-7 object-contain" />
                  </div>
                  <div className="text-white/90 font-semibold">جارٍ التحضير...</div>
                  <div className="text-white/60 text-xs mt-1">نجهز لك التجربة التالية بدون مغادرة الصفحة</div>
                </div>
              </div>
              {/* Soft pulse backdrop */}
              <div className="absolute inset-0 z-20 animate-pulse bg-gradient-to-b from-white/5 via-white/0 to-white/5" />
            </>
          )}
        </div>
      </div>
    );
  }

  // Phone login (bridge) UI with welcome hero
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Welcome Hero */}
        {showIntro && (
          <div className="mb-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center overflow-hidden shadow-lg">
                <img src={logoPng} alt="BlindMatch" className="w-10 h-10 object-contain" />
              </div>
            </div>
            <h1 className="text-3xl font-extrabold text-white text-center mb-2">التوافق الاعمى</h1>
            <p className="text-slate-300 text-center mb-4">رحلة تفاعلية ساحرة تُظهِر لك مجموعتك ثم تنقلك بسلاسة إلى جولات التعارف—كل ذلك في صفحة واحدة.</p>
            {/* Steps */}
            <div className="space-y-3">
              {introStep === 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-500/10 border border-cyan-400/20">
                  <Sparkles className="w-5 h-5 text-cyan-300" />
                  <div>
                    <div className="text-white/90 font-semibold">تجربة سلسة ومبهرة</div>
                    <div className="text-slate-300 text-xs">انتقالات ناعمة بدون تغيير الصفحة أو الشعور بانقطاع.</div>
                  </div>
                </div>
              )}
              {introStep === 1 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-400/20">
                  <Users className="w-5 h-5 text-purple-300" />
                  <div>
                    <div className="text-white/90 font-semibold">مجموعتك بانتظارك</div>
                    <div className="text-slate-300 text-xs">نُظهر لك مجموعتك وأنشطة ممتعة قبل بدء الجولات.</div>
                  </div>
                </div>
              )}
              {introStep === 2 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/20">
                  <Clock className="w-5 h-5 text-emerald-300" />
                  <div>
                    <div className="text-white/90 font-semibold">الجولة تبدأ بسحر</div>
                    <div className="text-slate-300 text-xs">عند بدء الجولة سننقلك فورًا إلى التجربة—بانتقال ناعم واحترافي.</div>
                  </div>
                </div>
              )}
            </div>
            {/* Controls */}
            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={() => setShowIntro(false)}
                className="text-slate-300/90 text-xs hover:text-white/90 underline underline-offset-4"
              >
                تخطّي
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIntroStep((s) => (s === 0 ? 2 : s - 1))}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-xs hover:bg-white/10"
                >
                  السابق
                </button>
                <button
                  onClick={() => {
                    if (introStep < 2) setIntroStep(introStep + 1); else setShowIntro(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white text-xs font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  {introStep < 2 ? 'التالي' : 'ابدأ الآن'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center overflow-hidden shadow-lg">
              <img src={logoPng} alt="BlindMatch" className="w-12 h-12 object-contain" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">التوافق الاعمى</h2>
            <p className="text-slate-300 text-sm">ادخل رقم جوالك لتفعيل الدخول المؤقّت والانتقال إلى المجموعات بسلاسة.</p>
          </div>

          {/* Info banner */}
          <div className="mb-6 p-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 text-sm flex items-center gap-2">
            <Lock className="w-4 h-4" />
            <span>وصول مؤقّت وآمن. لا يُظهر بياناتك الشخصية.</span>
          </div>

          {/* Form */}
          {!showIntro && (
            <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-slate-200 text-sm font-semibold mb-2">رقم الجوال</label>
                <input
                  inputMode="tel"
                  dir="ltr"
                  placeholder="05XXXXXXXX"
                  className="w-full rounded-xl bg-white/10 border border-white/15 text-white placeholder-white/40 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-100 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>{success}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "جارِ التحقق..." : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>ابدأ</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer hint */}
          <div className="mt-6 text-slate-400 text-xs text-center">
            <p>إذا كان لديك دخول محفوظ سيتم فتح التجربة مباشرة داخل هذه الصفحة.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
