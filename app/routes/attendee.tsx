import { useEffect, useState } from "react";
import { Smartphone, Lock, Sparkles, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AttendeeBridgePage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // If user already has a saved local token, they are fully signed-in. Send to groups directly.
    try {
      const localToken = localStorage.getItem("blindmatch_result_token") || localStorage.getItem("blindmatch_returning_token");
      if (localToken) {
        navigate("/groups");
        return;
      }
    } catch {}
  }, [navigate]);

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

      // Store ONLY in sessionStorage (least privilege). Main page won't see this as signed-in.
      try {
        sessionStorage.setItem("blindmatch_bridge_token", data.secure_token);
        sessionStorage.setItem("blindmatch_bridge_assigned", String(data.assigned_number));
        sessionStorage.setItem("blindmatch_bridge_active", "1");
      } catch {}

      setSuccess("تم التحقق! سيتم تحويلك إلى صفحة المجموعات");

      // Navigate to groups with a bridge flag
      navigate("/groups?bridge=1");
    } catch (err: any) {
      setError("حدث خطأ غير متوقع. حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

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
          <p>إن كان لديك حساب محفوظ من قبل، سيتم تحويلك مباشرة لصفحة المجموعات.</p>
        </div>
      </div>
    </div>
  );
}
