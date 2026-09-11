import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, ClipboardCheck, HelpCircle, Save, ShieldCheck, X } from "lucide-react"
import type {
  ParticipantPersonalityFitAssessment,
  ParticipantPersonalityFitReview,
  PersonalityFitDimensionKey,
  PersonalityFitDimensionReview,
  PersonalityFitReviewStatus,
} from "~/lib/participant-personality-fit"

type SaveInput = {
  reviewStatus: PersonalityFitReviewStatus
  dimensionReviews: Partial<Record<PersonalityFitDimensionKey, PersonalityFitDimensionReview>>
  reviewNotes: string
}

type Props = {
  participant: any | null
  assessment: ParticipantPersonalityFitAssessment | null
  review?: ParticipantPersonalityFitReview
  isOpen: boolean
  saving: boolean
  onClose: () => void
  onSave: (input: SaveInput) => Promise<void>
}

const reviewStatusOptions: Array<{ value: PersonalityFitReviewStatus; label: string; description: string; className: string }> = [
  { value: "unreviewed", label: "Not decided", description: "Keep the automated assessment without a manual decision.", className: "border-slate-500/30 bg-slate-500/10 text-slate-200" },
  { value: "approved", label: "Approved", description: "A reviewer considers this person suitable to invite.", className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" },
  { value: "needs_review", label: "Needs review", description: "More context or a short conversation is needed.", className: "border-amber-400/30 bg-amber-500/10 text-amber-100" },
  { value: "not_suitable", label: "Do not invite", description: "Manual decision only; document a concrete reason below.", className: "border-rose-400/30 bg-rose-500/10 text-rose-100" },
]

const dimensionReviewOptions: Array<{ value: PersonalityFitDimensionReview; label: string }> = [
  { value: "unreviewed", label: "Not checked" },
  { value: "ok", label: "Looks good" },
  { value: "concern", label: "Concern" },
]

function statusTone(status: ParticipantPersonalityFitAssessment["status"]) {
  if (status === "pass") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
  if (status === "review") return "border-amber-400/30 bg-amber-500/10 text-amber-100"
  if (status === "careful_review") return "border-rose-400/30 bg-rose-500/10 text-rose-100"
  return "border-slate-500/30 bg-slate-500/10 text-slate-300"
}

function itemTone(signal: string) {
  if (signal === "strength") return "border-emerald-400/20 bg-emerald-500/[0.06]"
  if (signal === "caution") return "border-amber-400/25 bg-amber-500/[0.07]"
  if (signal === "missing") return "border-slate-600/30 bg-slate-800/40"
  return "border-cyan-400/15 bg-cyan-500/[0.04]"
}

export default function ParticipantPersonalityFitReviewModal({ participant, assessment, review, isOpen, saving, onClose, onSave }: Props) {
  const [reviewStatus, setReviewStatus] = useState<PersonalityFitReviewStatus>("unreviewed")
  const [dimensionReviews, setDimensionReviews] = useState<Partial<Record<PersonalityFitDimensionKey, PersonalityFitDimensionReview>>>({})
  const [reviewNotes, setReviewNotes] = useState("")

  useEffect(() => {
    if (!isOpen) return
    setReviewStatus(review?.review_status || "unreviewed")
    setDimensionReviews(review?.dimension_reviews || {})
    setReviewNotes(review?.review_notes || "")
  }, [isOpen, participant?.assigned_number, review?.updated_at])

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [isOpen, saving, onClose])

  if (!isOpen || !participant || !assessment) return null

  const participantName = participant.name || participant.survey_data?.answers?.name || participant.survey_data?.name || `Participant #${participant.assigned_number}`
  const reviewedDimensions = assessment.dimensions.filter(dimension => (dimensionReviews[dimension.key] || "unreviewed") !== "unreviewed").length
  const concernDimensions = assessment.dimensions.filter(dimension => dimensionReviews[dimension.key] === "concern").length
  const missingRequiredReason = reviewStatus === "not_suitable" && reviewNotes.trim().length < 10

  return (
    <div className="fixed inset-0 z-[420] flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-xl sm:p-5" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="personality-fit-title" className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950 text-white shadow-[0_30px_120px_rgba(6,182,212,0.2)]">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-gradient-to-r from-cyan-500/[0.08] via-transparent to-violet-500/[0.08] px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statusTone(assessment.status)}`}>{assessment.statusLabel}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-400">{assessment.confidence} confidence</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-500">{assessment.modelVersion}</span>
            </div>
            <h2 id="personality-fit-title" className="truncate text-xl font-black sm:text-3xl">Personality fit review · #{participant.assigned_number}</h2>
            <p className="mt-1 truncate text-sm text-slate-400">{participantName}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-full border border-white/10 bg-white/5 p-2.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Close personality fit review">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-5 p-4 sm:p-7 lg:grid-cols-[280px_1fr]">
            <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
              <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-center">
                <div className="mx-auto grid h-36 w-36 place-items-center rounded-full p-2" style={{ background: `conic-gradient(#22d3ee ${assessment.score * 3.6}deg, rgba(148,163,184,0.12) 0deg)` }}>
                  <div className="grid h-full w-full place-items-center rounded-full border border-white/10 bg-slate-950">
                    <div><span className="text-5xl font-black tracking-tighter">{assessment.score}</span><span className="text-lg font-bold text-slate-500">/100</span></div>
                  </div>
                </div>
                <p className="mt-4 text-sm font-bold text-white">Automated evidence summary</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">This score supports a human review. It never changes eligibility or exclusion by itself.</p>
              </section>

              <section className="rounded-2xl border border-amber-300/15 bg-amber-400/[0.045] p-4 text-xs leading-5 text-amber-100/80">
                <div className="mb-2 flex items-center gap-2 font-bold text-amber-200"><ShieldCheck className="h-4 w-4" /> Fair-use guardrail</div>
                Popularity, gender, age, nationality, religion, attachment style, introversion, and humor style are not scored. A manual “Do not invite” decision should cite observable conduct or a concrete safety concern.
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center justify-between text-xs"><span className="font-bold text-slate-300">Manual checklist</span><span className="text-slate-500">{reviewedDimensions}/{assessment.dimensions.length}</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${concernDimensions > 0 ? "bg-amber-400" : "bg-cyan-400"}`} style={{ width: `${(reviewedDimensions / assessment.dimensions.length) * 100}%` }} /></div>
                {review?.reviewed_at ? <p className="mt-2 text-[10px] text-slate-600">Last saved {new Date(review.reviewed_at).toLocaleString()}</p> : null}
              </section>
            </aside>

            <main className="space-y-5">
              {(assessment.strengths.length > 0 || assessment.cautions.length > 0 || assessment.missingEvidence.length > 0) ? (
                <section className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.04] p-4"><h3 className="flex items-center gap-2 text-sm font-black text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Strengths</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-300">{assessment.strengths.length ? assessment.strengths.map(value => <li key={value}>• {value}</li>) : <li className="text-slate-600">No strong signal yet</li>}</ul></div>
                  <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.04] p-4"><h3 className="flex items-center gap-2 text-sm font-black text-amber-200"><AlertTriangle className="h-4 w-4" /> Cautions</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-300">{assessment.cautions.length ? assessment.cautions.map(value => <li key={value}>• {value}</li>) : <li className="text-slate-600">No direct caution signal</li>}</ul></div>
                  <div className="rounded-2xl border border-slate-500/15 bg-slate-500/[0.04] p-4"><h3 className="flex items-center gap-2 text-sm font-black text-slate-300"><HelpCircle className="h-4 w-4" /> Missing evidence</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">{assessment.missingEvidence.length ? assessment.missingEvidence.map(value => <li key={value}>• {value}</li>) : <li className="text-emerald-300/70">All pilot evidence is present</li>}</ul></div>
                </section>
              ) : null}

              <section className="space-y-3">
                <div><h3 className="text-lg font-black">Scored elements</h3><p className="text-xs text-slate-500">Review the submitted answer, why it matters, and the exact contribution to the score.</p></div>
                {assessment.dimensions.map(dimension => {
                  const manualValue = dimensionReviews[dimension.key] || "unreviewed"
                  return (
                    <article key={dimension.key} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 p-4">
                        <div className="min-w-0"><h4 className="font-black text-white">{dimension.label}</h4><p className="mt-1 text-xs leading-5 text-slate-400">{dimension.summary}</p></div>
                        <div className="shrink-0 text-right"><div className="font-mono text-xl font-black text-cyan-200">{dimension.score}<span className="text-xs text-slate-600">/{dimension.maxScore}</span></div><div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${(dimension.score / dimension.maxScore) * 100}%` }} /></div></div>
                      </div>
                      <div className="space-y-2 p-3 sm:p-4">
                        {dimension.items.map(item => (
                          <div key={item.id} className={`rounded-xl border p-3 ${itemTone(item.signal)}`}>
                            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-slate-300">{item.question}</p><p className="mt-1 text-sm font-semibold leading-5 text-white">{item.answer}</p></div><span className="shrink-0 rounded-lg border border-white/10 bg-black/20 px-2 py-1 font-mono text-xs font-black text-cyan-200">+{item.points}/{item.maxPoints}</span></div>
                            <p className="mt-2 text-[11px] leading-5 text-slate-500">{item.rationale}</p>
                          </div>
                        ))}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                          <span className="text-xs font-bold text-slate-400">Your review of this element</span>
                          <div role="group" aria-label={`Manual review for ${dimension.label}`} className="flex flex-wrap gap-1.5">
                            {dimensionReviewOptions.map(option => (
                              <button key={option.value} type="button" onClick={() => setDimensionReviews(current => ({ ...current, [dimension.key]: option.value }))} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${manualValue === option.value ? option.value === "ok" ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200" : option.value === "concern" ? "border-amber-400/50 bg-amber-500/20 text-amber-100" : "border-cyan-400/40 bg-cyan-500/15 text-cyan-200" : "border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300"}`}>{option.label}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <h3 className="flex items-center gap-2 font-black"><ClipboardCheck className="h-5 w-5 text-violet-300" /> Overall manual decision</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {reviewStatusOptions.map(option => (
                    <button key={option.value} type="button" onClick={() => setReviewStatus(option.value)} className={`rounded-xl border p-3 text-left transition ${reviewStatus === option.value ? `${option.className} ring-1 ring-current` : "border-white/10 bg-white/[0.025] text-slate-400 hover:bg-white/5"}`}><span className="block text-sm font-black">{option.label}</span><span className="mt-1 block text-[10px] leading-4 opacity-75">{option.description}</span></button>
                  ))}
                </div>
                <label className="mt-4 block text-xs font-bold text-slate-300" htmlFor="personality-fit-review-notes">Review notes</label>
                <textarea id="personality-fit-review-notes" value={reviewNotes} onChange={event => setReviewNotes(event.target.value.slice(0, 2000))} rows={4} placeholder="Record specific evidence, context, or the follow-up needed. Avoid labels about the person's worth." className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10" />
                <div className="mt-1 flex items-center justify-between gap-3 text-[10px]">
                  <span className={missingRequiredReason ? "text-rose-300" : "text-slate-600"}>{missingRequiredReason ? "Do not invite requires a concrete reason of at least 10 characters." : "Use observable evidence, not personality labels."}</span>
                  <span className="shrink-0 text-slate-600">{reviewNotes.length}/2000</span>
                </div>
              </section>
            </main>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-slate-950/95 px-5 py-4 backdrop-blur-xl sm:px-7">
          <p className="text-[10px] leading-4 text-slate-600">Saving records the score snapshot and model version so later questionnaire changes remain auditable.</p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/10 disabled:opacity-40">Cancel</button>
            <button type="button" onClick={() => onSave({ reviewStatus, dimensionReviews, reviewNotes: reviewNotes.trim() })} disabled={saving || missingRequiredReason} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save review"}</button>
          </div>
        </footer>
      </div>
    </div>
  )
}
