import React, { useState, useEffect } from "react"
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  SunIcon,
  MoonIcon,
} from "lucide-react"
import { Button } from "../../components/ui/button"
import { Timeline, TimelineItem } from "../../components/ui/timeline"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
import "../../app/app.css"

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
    <Button onClick={onClick} className="relative pe-12">
      {label}
      <span className="bg-primary-foreground/15 pointer-events-none absolute inset-y-0 end-0 flex w-9 items-center justify-center">
        <ChevronRightIcon className="opacity-60" size={16} aria-hidden="true" />
      </span>
    </Button>
  )

  const FancyPreviousButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <Button onClick={onClick} className="relative ps-12">
      {label}
      <span className="bg-primary-foreground/15 pointer-events-none absolute inset-y-0 start-0 flex w-9 items-center justify-center">
        <ChevronLeftIcon className="opacity-60" size={16} aria-hidden="true" />
      </span>
    </Button>
  )

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/generate-summary", {
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
      const data = await res.json()
      setPersonalitySummary(data.summary)
      next()
    } catch (err) {
      console.error("GPT Error:", err)
      setPersonalitySummary("ما قدرنا نولّد تحليل شخصيتك.")
      next()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`min-h-screen px-4 py-10 flex items-center justify-center ${
        dark
          ? "bg-[oklch(0.141_0.005_285.823)] text-[oklch(0.985_0_0)]"
          : "bg-[oklch(1_0_0)] text-[oklch(0.141_0.005_285.823)]"
      }`}
      dir="rtl"
    >
      {/* زر الوضع المظلم */}
      <div className="absolute top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDark(!dark)}
          className="group border border-border bg-muted text-foreground rounded shadow-sm p-2 flex items-center justify-center"
        >
          {dark ? (
            <SunIcon size={16} className="transition-transform group-hover:-rotate-12 group-hover:scale-105 opacity-80" />
          ) : (
            <MoonIcon size={16} className="transition-transform group-hover:rotate-12 group-hover:scale-105 opacity-80" />
          )}
        </Button>
      </div>

      <div className="w-full max-w-md space-y-10 text-center animate-fade-in">
        {/* خطوة 0 */}
        {step === 0 && (
          <section className="space-y-6">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">أهلًا بك في اللقاء</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              بتقابل ٤ أشخاص. بعد كل حوار، قرر إذا كان
              <span className="font-semibold text-foreground"> توأم روحك </span>
              أو
              <span className="font-semibold text-foreground"> خصمك اللدود</span>.
            </p>
            <div className="flex justify-center">
              <FancyNextButton onClick={next} label="ابدأ" />
            </div>
          </section>
        )}

        {/* خطوة 1 */}
        {step === 1 && (
          <section className="space-y-6">
            <h2 className="text-xl font-semibold">أدخل رقمك المخصص</h2>
            <p className="text-muted-foreground text-sm">منظّم الحدث أعطاك رقم. اكتبه هنا علشان نكمل.</p>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={assignedNumber ?? ""}
              onChange={(e) => setAssignedNumber(Number(e.target.value))}
              className="mx-auto block h-24 w-24 text-center text-4xl font-bold rounded-lg border border-border bg-background shadow-sm pr-3 [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-center gap-3">
              <FancyPreviousButton onClick={previous} label="رجوع" />
              <FancyNextButton onClick={next} label="استمرار" />
            </div>
          </section>
        )}

        {/* خطوة 2 */}
        {step === 2 && (
          <section className="space-y-6 text-right">
            <div className="flex flex-col items-center gap-2">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="text-xl font-semibold bg-muted">
                  {assignedNumber ?? "?"}
                </AvatarFallback>
              </Avatar>
            </div>

            <h2 className="text-xl font-bold text-center pt-4">عرفنا عن نفسك شوي</h2>

            <form className="space-y-5 max-w-md mx-auto">
              <div className="space-y-2">
                <label className="block text-sm font-medium">وش تسوي بوقتك الفاضي؟</label>
                <input
                  type="text"
                  value={freeTime}
                  onChange={(e) => setFreeTime(e.target.value)}
                  className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">كيف يوصفونك أصحابك؟</label>
                <input
                  type="text"
                  value={friendDesc}
                  onChange={(e) => setFriendDesc(e.target.value)}
                  className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">تميل أكثر لـ:</label>
                <select
                  value={preference}
                  onChange={(e) => setPreference(e.target.value)}
                  className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">اختر وحدة</option>
                  <option value="alone">جلسة هادئة بين شخصين</option>
                  <option value="group">نشاط ممتع مع مجموعة</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">وش يميزك عن غيرك؟</label>
                <input
                  type="text"
                  value={uniqueTrait}
                  onChange={(e) => setUniqueTrait(e.target.value)}
                  className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </form>

            <div className="flex justify-center gap-3">
              <FancyPreviousButton onClick={previous} label="رجوع" />
              <FancyNextButton onClick={handleSubmit} label={loading ? "يتم التحليل..." : "ارسال وبدء"} />
            </div>
          </section>
        )}

        {/* خطوة 3 */}
        {step === 3 && (
          <section className="space-y-6">
            <h3 className="text-lg font-semibold text-center text-muted-foreground">تحليل شخصيتك</h3>
            <div
              dir="rtl"
              className="mt-4 mx-auto max-w-md rounded-xl border border-border bg-muted/30 p-5 shadow-sm backdrop-blur-sm"
            >
              <p className="text-sm text-right leading-relaxed text-muted-foreground italic">
                {loading
                  ? "جاري تحليل شخصيتك..."
                  : personalitySummary || "ما تم إنشاء ملخص."}
              </p>
            </div>

            <div className="flex justify-center">
              <FancyNextButton onClick={restart} label="الرجوع للبداية" />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
