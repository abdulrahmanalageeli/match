import React, { useState, useEffect } from "react"
import { ChevronRightIcon, ChevronLeftIcon, SunIcon, MoonIcon } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Timeline, TimelineItem } from "../../components/ui/timeline"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
import "../../app/app.css"

export default function WelcomePage() {
  const [step, setStep] = useState(0)
  const [dark, setDark] = useState(false)
  const [assignedNumber, setAssignedNumber] = useState<number | null>(null)

  // Form state
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

  // Toggle dark class on <html>
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
      console.error("Error fetching GPT summary:", err)
      setPersonalitySummary("Failed to generate personality insight.")
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
    >
      {/* Theme toggle */}
      <div className="absolute top-4 right-4 z-50">
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
        {/* Step 0 */}
        {step === 0 && (
          <section className="space-y-6">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Welcome to the Event</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              You’ll meet 4 people. After each chat, decide: were they your
              <span className="font-semibold text-foreground"> soulmate </span>
              or your
              <span className="font-semibold text-foreground"> nemesis</span>?
            </p>
            <div className="flex justify-center">
              <FancyNextButton onClick={next} label="Start" />
            </div>
          </section>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <section className="space-y-6">
            <h2 className="text-xl font-semibold">Enter Your Assigned Number</h2>
            <p className="text-muted-foreground text-sm">Your host gave you a number. Enter it below to continue.</p>
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
              <FancyPreviousButton onClick={previous} label="Back" />
              <FancyNextButton onClick={next} label="Continue" />
            </div>
          </section>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <section className="space-y-6 text-left">
            <div className="flex flex-col items-center gap-2">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="text-xl font-semibold bg-muted">
                  {assignedNumber ?? "?"}
                </AvatarFallback>
              </Avatar>
            </div>

            <h2 className="text-xl font-bold text-center pt-4">Tell Us About Yourself</h2>

            <form className="space-y-5 max-w-md mx-auto">
              <div className="space-y-2">
                <label className="block text-sm font-medium">What do you enjoy doing in your free time?</label>
                <input
                  type="text"
                  value={freeTime}
                  onChange={(e) => setFreeTime(e.target.value)}
                  className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">How do your friends describe you?</label>
                <input
                  type="text"
                  value={friendDesc}
                  onChange={(e) => setFriendDesc(e.target.value)}
                  className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Would you rather:</label>
                <select
                  value={preference}
                  onChange={(e) => setPreference(e.target.value)}
                  className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select one</option>
                  <option value="alone">Have a deep 1:1 conversation</option>
                  <option value="group">Lead a fun group activity</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">What’s something unique about you?</label>
                <input
                  type="text"
                  value={uniqueTrait}
                  onChange={(e) => setUniqueTrait(e.target.value)}
                  className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </form>

            <div className="flex justify-center gap-3">
              <FancyPreviousButton onClick={previous} label="Back" />
              <FancyNextButton onClick={handleSubmit} label={loading ? "Loading..." : "Submit & Start"} />
            </div>
          </section>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <section className="space-y-6">

            <div className="mt-8">
              <h3 className="text-lg font-semibold text-center text-muted-foreground">Personality Insight</h3>
              <div className="mt-4 mx-auto max-w-md rounded-xl border border-border bg-muted/30 p-5 shadow-sm backdrop-blur-sm">
                <p className="text-sm leading-relaxed text-muted-foreground italic">
                  {loading
                    ? "Analyzing your personality..."
                    : personalitySummary || "No summary generated."}
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <FancyNextButton onClick={restart} label="Next" />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
