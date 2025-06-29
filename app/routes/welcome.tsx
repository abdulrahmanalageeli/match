import React from "react"
import { useState, useEffect } from "react"
import { ChevronRightIcon } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Timeline, TimelineItem } from "../../components/ui/timeline"
import "../../app/app.css"
import { SunIcon, MoonIcon } from "lucide-react"
import { ChevronLeftIcon } from "lucide-react"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"

export default function WelcomePage() {
  const [step, setStep] = useState(0)
  const [dark, setDark] = useState(false)

  const next = () => setStep((s) => Math.min(s + 1, 3))
  const restart = () => setStep(0)
  const previous = () => setStep((s) => Math.max(s - 1, 0))
  const [assignedNumber, setAssignedNumber] = useState<number | null>(null)

  // Toggle dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  // Fancy "Next" button used in multiple steps
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
  
  
  return (
    <div
      className={`min-h-screen px-4 py-10 flex items-center justify-center ${
        dark
          ? "bg-[oklch(0.141_0.005_285.823)] text-[oklch(0.985_0_0)]"
          : "bg-[oklch(1_0_0)] text-[oklch(0.141_0.005_285.823)]"
      }`}
    >
      {/* Toggle Button */}
      <div className="absolute top-4 right-4 z-50">
  <Button
    variant="ghost"
    size="sm"
    onClick={() => setDark(!dark)}
    className="group border border-border bg-muted text-foreground rounded shadow-sm p-2 flex items-center justify-center"
  >
    {dark ? (
      <SunIcon
        size={16}
        className="transition-transform group-hover:-rotate-12 group-hover:scale-105 opacity-80"
      />
    ) : (
      <MoonIcon
        size={16}
        className="transition-transform group-hover:rotate-12 group-hover:scale-105 opacity-80"
      />
    )}
  </Button>
</div>

      <div className="w-full max-w-md space-y-10 text-center animate-fade-in">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <section className="space-y-6">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Welcome to the Event
            </h1>
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

        {/* Step 1: Question */}
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

        {/* Step 2: Final Results */}
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
          className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">How do your friends describe you?</label>
        <input
          type="text"
          className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Would you rather:</label>
        <select className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Select one</option>
          <option value="alone">Have a deep 1:1 conversation</option>
          <option value="group">Lead a fun group activity</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">What’s something unique about you?</label>
        <input
          type="text"
          className="w-full rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </form>

    <div className="flex justify-center gap-3">
      <FancyPreviousButton onClick={previous} label="Back" />
      <FancyNextButton onClick={next} label="Submit & Start" />
    </div>
  </section>
)}

        {/* Step 3: Timeline */}
        {step === 3 && (
  <section className="space-y-6">


    <div className="mt-8">
      <h3 className="text-lg font-semibold text-center text-muted-foreground">Personality Insight</h3>
      <div className="mt-4 mx-auto max-w-md rounded-xl border border-border bg-muted/30 p-5 shadow-sm backdrop-blur-sm">
        <p className="text-sm leading-relaxed text-muted-foreground italic">
          “This participant tends to thrive in meaningful one-on-one conversations and often brings a calm,
          introspective energy to group dynamics. They’re seen by others as a thoughtful listener with a
          surprisingly witty side, making them a quiet connector in social environments.”
        </p>
      </div>
    </div>

    <div className="flex justify-center">
      <FancyNextButton onClick={restart} label="Restart" />
    </div>
  </section>
)}
      </div>
    </div>
  )
}
