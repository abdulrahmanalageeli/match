import React, { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"

import {
  ChevronRightIcon,
  ChevronLeftIcon,
  SunIcon,
  MoonIcon,
  Brain,
  Users,
  Sparkles,
  Cpu,
  Zap,
  Target,
  Heart,
  Shield,
} from "lucide-react"
import { Button } from "../../components/ui/button"
import { Timeline, TimelineItem } from "../../components/ui/timeline"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
import "../../app/app.css"
import MatchResult from "./MatchResult"

export default function WelcomePage() {
  const [step, setStep] = useState(0)
  const [dark, setDark] = useState(false)
  const [assignedNumber, setAssignedNumber] = useState<number | null>(null)

  const [freeTime, setFreeTime] = useState("")
  const [friendDesc, setFriendDesc] = useState("")
  const [preference, setPreference] = useState("")
  const [uniqueTrait, setUniqueTrait] = useState("")
  const [personalitySummary, setPersonalitySummary] = useState("")
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const [matchResult, setMatchResult] = useState<string | null>(null)
  const [matchReason, setMatchReason] = useState<string>("")
  const [phase, setPhase] = useState<"form" | "waiting" | "matching" | null>(null)
  const [tableNumber, setTableNumber] = useState<number | null>(null)
  const token = useSearchParams()[0].get("token")
  const [isResolving, setIsResolving] = useState(true)

  useEffect(() => {
    const resolveToken = async () => {
      if (!token) return

      try {
        const res = await fetch("/api/token-handler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve", secure_token: token }),
        })

        const data = await res.json()
        if (data.success) {
          setAssignedNumber(data.assigned_number);
          if (data.summary) {
            setPersonalitySummary(data.summary)
          }

          const hasFilledForm = data.q1 && data.q2 && data.q3 && data.q4;

          const res2 = await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "event-phase",
              match_id: "00000000-0000-0000-0000-000000000000",
            }),
          });
          const phaseData = await res2.json();

          if (phaseData.phase === "matching") {
            if (hasFilledForm) {
              setStep(5);
              fetchMatches();
            } else {
              setStep(-1); // late joiner, too late
            }
          } else if (phaseData.phase === "waiting") {
            if (hasFilledForm) {
              setStep(4);
            } else {
              setStep(2);
            }
          } else if (phaseData.phase === "form") {
            if (hasFilledForm) {
              setStep(4); // ✅ show waiting screen with personality summary
            } else {
              setStep(2); // default form step
            }
          }
        }

      } catch (err) {
        console.error("Error resolving token:", err)
      } finally {
        setIsResolving(false) // ✅ only set false after async finishes
      }
    }

    resolveToken()
  }, [token])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "event-phase", match_id: "00000000-0000-0000-0000-000000000000" }),
        })

        const data = await res.json()
        setPhase(data.phase)
      } catch (err) {
        console.error("Failed to fetch phase", err)
      }
    }, 5000) // every 5 seconds

    return () => clearInterval(interval)
  }, [])

  const next = () => setStep((s) => Math.min(s + 1, 3))
  const restart = () => {
    setStep(0)
    setPersonalitySummary("")
  }
  const previous = () => setStep((s) => Math.max(s - 1, 0))

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  const FancyNextButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <Button 
      onClick={onClick} 
      className="relative pe-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
    >
      {label}
      <span className="bg-white/20 pointer-events-none absolute inset-y-0 end-0 flex w-9 items-center justify-center rounded-r-md">
        <ChevronRightIcon className="opacity-80" size={16} aria-hidden="true" />
      </span>
    </Button>
  )

  const FancyPreviousButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <Button 
      onClick={onClick} 
      className="relative ps-12 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
    >
      {label}
      <span className="bg-white/20 pointer-events-none absolute inset-y-0 start-0 flex w-9 items-center justify-center rounded-l-md">
        <ChevronLeftIcon className="opacity-80" size={16} aria-hidden="true" />
      </span>
    </Button>
  )

  useEffect(() => {
    if (step !== 4 || !assignedNumber) return

    const interval = setInterval(async () => {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "event-phase", match_id: "00000000-0000-0000-0000-000000000000" }),
      })
      const data = await res.json()

      if (data.phase === "matching") {
        clearInterval(interval)
        await fetchMatches()
        setStep(5) // Move to result
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [step])

  const handleSubmit = async () => {
    setLoading(true)
    try {
      // 1. Save participant
      const res1 = await fetch("/api/save-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_number: assignedNumber,
          q1: freeTime,
          q2: friendDesc,
          q3: preference,
          q4: uniqueTrait,
        }),
      })
      const data1 = await res1.json()
      if (!res1.ok) throw new Error(data1.error)

      // 2. Generate summary
      const res2 = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responses: {
            q1: freeTime,
            q2: friendDesc,
            q3: preference,
            q4: uniqueTrait,
          },
        }),
      })
      const data2 = await res2.json()
      setPersonalitySummary(data2.summary || "ما قدرنا نولّد تحليل شخصيتك.")
      await fetch("/api/save-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_number: assignedNumber,
          summary: data2.summary || "ما قدرنا نولّد تحليل شخصيتك.",
        }),
      })

      // 3. Go to summary step
      next()

      // 4. Wait 30s, then auto-match
      // After summary, move to waiting screen
      setStep(4) // but 4 = waiting
    } catch (err) {
      console.error("Submit error:", err)
      setPersonalitySummary("ما قدرنا نولّد تحليل شخصيتك.")
      next()
    } finally {
      setLoading(false)
    }
  }

  type MatchResultEntry = {
    with: string
    type: string
    reason: string
    round: number
  }

  const fetchMatches = async () => {
    try {
      const myMatches = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_number: assignedNumber }),
      })

      const data = await myMatches.json()
      const matches = data.matches as MatchResultEntry[]

      // Sort by round number
      matches.sort((a, b) => a.round - b.round)

      const round1 = matches.find((m) => m.round === 1)
      const round2 = matches.find((m) => m.round === 2)

      if (round1) {
        setMatchResult(`توأم روحك هو رقم ${round1.with}`)
        setMatchReason(round1.reason)
      }

      if (round2) {
        // Append round 2 info to the reason (or show separately)
        setMatchResult((prev) => `${prev} 💢 وعدوك اللدود هو رقم ${round2.with}`)
        setMatchReason((prev) => `${prev}\n\n💢 ${round2.reason}`)
      }

    } catch (err) {
      console.error("Match error:", err)
      setMatchResult("؟")
      setMatchReason("صار خطأ بالتوافق، حاول مره ثانية.")
    }
  }

  useEffect(() => {
    if (step !== 4 || !assignedNumber) return

    setCountdown(3)
    setMatchResult(null)
    setMatchReason("")

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          fetchMatches()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [step])

  if (phase === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mx-auto"></div>
          <p className="text-purple-200 text-xl font-medium">جارٍ التحميل...</p>
        </div>
      </div>
    )
  }

  if (!isResolving && phase !== "form" && step === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center space-y-4 max-w-md mx-auto p-8">
          <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-6 backdrop-blur-sm">
            <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="font-bold text-2xl text-red-200 mb-2">🚫 التسجيل مغلق</h2>
            <p className="text-red-300 text-sm">المنظّم بدأ التوافق أو أغلق التسجيل.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen px-4 py-10 flex items-center justify-center relative overflow-hidden ${
        dark
          ? "bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white"
          : "bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 text-slate-800"
      }`}
      dir="rtl"
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-purple-500/5 to-blue-500/5 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>

      {/* زر الوضع المظلم */}
      <div className="absolute top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDark(!dark)}
          className={`group border backdrop-blur-sm rounded-xl p-3 flex items-center justify-center transition-all duration-300 hover:scale-110 ${
            dark 
              ? "border-purple-500/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20" 
              : "border-slate-300/50 bg-white/20 text-slate-600 hover:bg-white/30"
          }`}
        >
          {dark ? (
            <SunIcon size={18} className="transition-transform group-hover:-rotate-12 group-hover:scale-105" />
          ) : (
            <MoonIcon size={18} className="transition-transform group-hover:rotate-12 group-hover:scale-105" />
          )}
        </Button>
      </div>

      <div className="w-full max-w-md space-y-10 text-center animate-fade-in relative z-10">
        {/* خطوة 0 */}
        {step === 0 && (
          <section className="space-y-8">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur-xl opacity-20 animate-pulse"></div>
              <div className="relative bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <Brain className="w-16 h-16 text-purple-400 animate-pulse" />
                    <Sparkles className="w-6 h-6 text-yellow-400 absolute -top-2 -right-2 animate-bounce" />
                  </div>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-4">
                  نظام التوافق الذكي
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                  بتقابل ٤ أشخاص. بعد كل حوار، قرر إذا كان
                  <span className="font-semibold text-purple-300"> توأم روحك </span>
                  أو
                  <span className="font-semibold text-red-300"> خصمك اللدود</span>.
                </p>
              </div>
            </div>
            <div className="flex justify-center">
              <FancyNextButton onClick={next} label="ابدأ الرحلة" />
            </div>
          </section>
        )}

        {step === -1 && (
          <section className="space-y-6">
            <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-8 backdrop-blur-xl">
              <Target className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-red-200">🚫 التوافق بدأ بالفعل</h2>
              <p className="text-red-300 text-sm">ما لحقت تعبي النموذج. تابع المنظّم وانتظر الجولة الجاية.</p>
            </div>
          </section>
        )}

        {/* خطوة 1 */}
        {step === 1 && !token && (
          <section className="space-y-6">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
              <div className="flex justify-center mb-4">
                <Cpu className="w-12 h-12 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-blue-200 mb-2">أدخل رقمك المخصص</h2>
              <p className="text-blue-300 text-sm mb-6">منظّم الحدث أعطاك رقم. اكتبه هنا علشان نكمل.</p>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  value={assignedNumber ?? ""}
                  onChange={(e) => setAssignedNumber(Number(e.target.value))}
                  className="mx-auto block h-24 w-24 text-center text-4xl font-bold rounded-xl border-2 border-blue-400/50 bg-white/10 backdrop-blur-sm text-blue-200 shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-400/30 focus:border-blue-400 transition-all duration-300 [appearance:textfield]"
                />
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400/20 to-purple-400/20 blur-xl opacity-50"></div>
              </div>
            </div>
            <div className="flex justify-center gap-3">
              <FancyPreviousButton onClick={previous} label="رجوع" />
              <FancyNextButton onClick={next} label="استمرار" />
            </div>
          </section>
        )}

        {/* خطوة 2 */}
        {step === 2 && (
          <section className="space-y-6 text-right">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="relative">
                  <Avatar className="w-20 h-20 border-4 border-purple-400/50 shadow-lg">
                    <AvatarFallback className="text-2xl font-semibold bg-gradient-to-r from-purple-500 to-blue-500 text-white">
                      {assignedNumber ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
                </div>
                <h2 className="text-xl font-bold text-center text-purple-200">تحليل الشخصية الذكي</h2>
              </div>

              <form className="space-y-6 max-w-md mx-auto">
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-blue-200">وش تسوي بوقتك الفاضي؟</label>
                  <input
                    type="text"
                    value={freeTime}
                    onChange={(e) => setFreeTime(e.target.value)}
                    className="w-full rounded-xl border-2 border-blue-400/30 bg-white/10 backdrop-blur-sm p-3 text-white placeholder-blue-300/50 focus:outline-none focus:ring-4 focus:ring-blue-400/30 focus:border-blue-400 transition-all duration-300"
                    placeholder="اكتب إجابتك هنا..."
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-blue-200">كيف يوصفونك أصحابك؟</label>
                  <input
                    type="text"
                    value={friendDesc}
                    onChange={(e) => setFriendDesc(e.target.value)}
                    className="w-full rounded-xl border-2 border-blue-400/30 bg-white/10 backdrop-blur-sm p-3 text-white placeholder-blue-300/50 focus:outline-none focus:ring-4 focus:ring-blue-400/30 focus:border-blue-400 transition-all duration-300"
                    placeholder="اكتب إجابتك هنا..."
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-blue-200">تميل أكثر لـ:</label>
                  <select
                    value={preference}
                    onChange={(e) => setPreference(e.target.value)}
                    className="w-full rounded-xl border-2 border-blue-400/30 bg-white/10 backdrop-blur-sm p-3 text-white focus:outline-none focus:ring-4 focus:ring-blue-400/30 focus:border-blue-400 transition-all duration-300"
                  >
                    <option value="" className="bg-slate-800">اختر وحدة</option>
                    <option value="alone" className="bg-slate-800">جلسة هادئة بين شخصين</option>
                    <option value="group" className="bg-slate-800">نشاط ممتع مع مجموعة</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-blue-200">وش يميزك عن غيرك؟</label>
                  <input
                    type="text"
                    value={uniqueTrait}
                    onChange={(e) => setUniqueTrait(e.target.value)}
                    className="w-full rounded-xl border-2 border-blue-400/30 bg-white/10 backdrop-blur-sm p-3 text-white placeholder-blue-300/50 focus:outline-none focus:ring-4 focus:ring-blue-400/30 focus:border-blue-400 transition-all duration-300"
                    placeholder="اكتب إجابتك هنا..."
                  />
                </div>
              </form>
            </div>

            <div className="flex justify-center gap-3">
              <FancyPreviousButton onClick={previous} label="رجوع" />
              <FancyNextButton onClick={handleSubmit} label={loading ? "جاري التحليل..." : "ارسال وبدء"} />
            </div>
          </section>
        )}

        {/* خطوة 3 */}
        {step === 3 && (
          <section className="space-y-6">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
              <div className="flex justify-center mb-4">
                <Brain className="w-12 h-12 text-purple-400 animate-pulse" />
              </div>
              <h3 className="text-lg font-semibold text-center text-purple-200 mb-6">تحليل شخصيتك</h3>
              <div
                dir="rtl"
                className="mx-auto max-w-md rounded-xl border-2 border-purple-400/30 bg-white/10 backdrop-blur-sm p-6 shadow-lg"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <h4 className="text-sm font-medium text-purple-200">الذكاء الاصطناعي يحلل...</h4>
                </div>
                <p className="text-sm text-right leading-relaxed text-blue-200 italic">
                  {loading
                    ? "جاري تحليل شخصيتك..."
                    : personalitySummary || "ما تم إنشاء ملخص."}
                </p>
              </div>
            </div>

            <div className="flex justify-center gap-3">
              <FancyPreviousButton onClick={restart} label="الرجوع للبداية" />
              <FancyNextButton
                onClick={() => {
                  setStep(4)
                }}
                label="عرض النتائج الآن"
              />
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-6">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
              <div className="flex justify-center mb-4">
                <Users className="w-12 h-12 text-green-400 animate-pulse" />
              </div>
              <h3 className="text-lg font-semibold text-center text-green-200 mb-4">
                بانتظار المنظّم لبدء التوافق...
              </h3>
              <p className="text-center text-green-300 text-sm italic mb-6">
                لا تسكّر الصفحة! بنخبرك إذا بدأ التوافق.
              </p>

              <div
                dir="rtl"
                className="mx-auto max-w-md rounded-xl border-2 border-green-400/30 bg-white/10 backdrop-blur-sm p-6 shadow-lg"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="w-5 h-5 text-pink-400" />
                  <h4 className="text-sm font-medium text-green-200">تحليل شخصيتك 👇</h4>
                </div>
                <p className="text-sm text-right leading-relaxed text-blue-200 italic">
                  {personalitySummary || "ما تم إنشاء ملخص."}
                </p>
              </div>
            </div>
          </section>
        )}

        {step === 5 && (
          <section className="space-y-6">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
              <div className="flex justify-center mb-4">
                <Target className="w-12 h-12 text-yellow-400 animate-bounce" />
              </div>
              <h3 className="text-lg font-semibold text-center text-yellow-200 mb-4">
                {matchResult
                  ? `توأم روحك هو رقم ${matchResult}`
                  : "ما قدرنا نلقالك توأم روح واضح"}
              </h3>

              <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl p-4 border border-yellow-400/30">
                <p className="text-yellow-200 text-sm text-center italic">
                  {matchReason}
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <FancyNextButton onClick={restart} label="ابدأ من جديد" />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
