import { useEffect, useState } from "react";
import { Smartphone, Lock, Sparkles, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";

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

  useEffect(() => {
    // Initialize shell if user already has a full token or bridge token
    try {
      const fullToken = localStorage.getItem("blindmatch_result_token") || localStorage.getItem("blindmatch_returning_token");
      const bridgeToken = sessionStorage.getItem("blindmatch_bridge_token");
      if (fullToken) {
        setInApp(true);
        setIframeSrc("/groups");
        setBridgeActive(false);
      } else if (bridgeToken) {
        setInApp(true);
        setIframeSrc("/groups?bridge=1");
        setBridgeActive(true);
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
            targetSrc = `/welcome?token=${encodeURIComponent(token)}&force_round=1`;
          } else {
            // No token yet, keep groups/bridge while user logs in
            targetSrc = bridgeActive ? "/groups?bridge=1" : "/groups";
          }
        } else {
          // Non-round phases: show Groups
          targetSrc = bridgeActive ? "/groups?bridge=1" : "/groups";
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
        setIframeSrc("/groups?bridge=1");
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4" dir="rtl">
        <div className="w-full max-w-3xl md:max-w-4xl lg:max-w-5xl h-[85vh] bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_20px_80px_-20px_rgba(0,0,0,0.6)] relative overflow-hidden">
          {/* Header */}
          <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center shadow-lg">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div className="text-white/90 font-semibold">بوابة الحضور</div>
            </div>
            {bridgeActive && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-emerald-500/20 to-lime-500/20 text-emerald-200 border border-emerald-400/30 shadow-sm">
                Bridge Active
              </span>
            )}
          </div>

          {/* Subtle ambient gradient */}
          <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-600/10 blur-3xl"></div>

          {/* Iframe container with elegant border */}
          <div className={`absolute inset-0 pt-16 ${fading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
            <div className="w-full h-full p-3">
              <div className="w-full h-full rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-black/30">
                <iframe
                  key={iframeSrc}
                  src={iframeSrc}
                  className="w-full h-full"
                  style={{ background: 'transparent' }}
                  loading="eager"
                  onLoad={() => setFading(false)}
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Phone login (bridge) UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center shadow-lg">
            <Smartphone className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">بوابة الحضور</h1>
          <p className="text-slate-300 text-sm">سجّل الدخول برقم جوالك للانتقال إلى صفحة المجموعات مباشرة. هذا الوصول محدود ولا يعرض بياناتك الشخصية.</p>
        </div>

        {/* Info banner */}
        <div className="mb-6 p-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 text-sm flex items-center gap-2">
          <Lock className="w-4 h-4" />
          <span>الوصول محدود: لن يتم حفظ تسجيل الدخول كامل في الصفحة الرئيسية.</span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
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

        {/* Footer hint */}
        <div className="mt-6 text-slate-400 text-xs text-center">
          <p>إن كان لديك حساب محفوظ من قبل، سيتم فتح التجربة داخل هذه الصفحة مباشرة.</p>
        </div>
      </div>
    </div>
  );
}
