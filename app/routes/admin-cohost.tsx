import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import {
  Bell,
  CheckCircle2,
  Circle,
  Clock3,
  Heart,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Table2,
  UserCheck,
  Users,
} from "lucide-react"

const API = "/api/admin"
const SESSION_KEY = "event3_cohost_token"

type CohostTab = "overview" | "attendance" | "help"

interface CohostParticipant {
  number: number
  name: string
  age: number | null
  attended: boolean
  previous_event_count: number
  first_time: boolean
  ranking_submitted: boolean
  tables: Record<string, number>
  phase2_partner: number | null
  phase3_partner: number | null
}

interface SosRequest {
  id: string
  participant_number: number
  participant_name: string | null
  table_info: string | null
  message: string | null
  organizer_reply: string | null
  status: string
  request_type: string | null
  created_at: string
  updated_at: string
}

interface CohostDashboard {
  event_id: number
  state: {
    phase: string
    global_timer_active: boolean
    global_timer_start_time: string | null
    global_timer_duration: number | null
    global_timer_round: number | null
  }
  participants: CohostParticipant[]
  sos_requests: SosRequest[]
}

const PHASE_LABELS: Record<string, string> = {
  setup: "Setup",
  round1: "Group round 1",
  ranking1: "Ranking 1",
  round2: "Group round 2",
  ranking2: "Final ranking",
  phase2_processing: "Creating choice matches",
  break: "Break",
  phase2_reveal: "Choice one-to-one",
  phase3_reveal: "Algorithm one-to-one",
  final_reveal: "Final reveal",
}

function activeRound(phase?: string) {
  if (phase === "round1") return 1
  if (phase === "round2") return 2
  if (phase === "phase2_reveal") return 20
  if (phase === "phase3_reveal") return 30
  return null
}

function formatTimer(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`
}

async function cohostApi(action: string, token: string, extra: Record<string, unknown> = {}) {
  try {
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    })
    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) throw new Error("Could not reach the event service")
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || "Request failed") as Error & { status?: number }
      error.status = response.status
      throw error
    }
    return data
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error("Could not reach the event service")
  }
}

export default function AdminCohostPage() {
  const [token, setToken] = useState("")
  const [password, setPassword] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [dashboard, setDashboard] = useState<CohostDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<CohostTab>("overview")
  const [toggling, setToggling] = useState<Record<number, boolean>>({})
  const [sosBusy, setSosBusy] = useState<Record<string, boolean>>({})
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [timerRemaining, setTimerRemaining] = useState(0)

  useEffect(() => {
    setToken(sessionStorage.getItem(SESSION_KEY) || "")
  }, [])

  const logout = useCallback((message = "") => {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem("cohost_auth")
    setToken("")
    setDashboard(null)
    setError(message)
  }, [])

  const fetchDashboard = useCallback(async (quiet = false) => {
    if (!token) return
    if (!quiet) setLoading(true)
    try {
      const data = await cohostApi("e3-cohost-dashboard", token)
      setDashboard(data)
      setError("")
    } catch (requestError) {
      const status = (requestError as Error & { status?: number }).status
      if (status === 401 || status === 403) logout("Your co-host session expired. Please sign in again.")
      else setError(requestError instanceof Error ? requestError.message : "Could not load the event")
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [logout, token])

  useEffect(() => {
    if (!token) return
    fetchDashboard()
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchDashboard(true)
    }, 8000)
    return () => window.clearInterval(interval)
  }, [fetchDashboard, token])

  useEffect(() => {
    const state = dashboard?.state
    if (!state?.global_timer_active || !state.global_timer_start_time) {
      setTimerRemaining(0)
      return
    }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(state.global_timer_start_time as string).getTime()) / 1000)
      setTimerRemaining(Math.max(0, Number(state.global_timer_duration || 0) - elapsed))
    }
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [dashboard?.state])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!password.trim()) return
    setLoginLoading(true)
    setError("")
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "e3-cohost-login", password }),
      })
      const contentType = response.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) throw new Error("Could not reach the event service")
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.token) throw new Error(data.error || "Wrong password")
      sessionStorage.setItem(SESSION_KEY, data.token)
      setToken(data.token)
      setPassword("")
    } catch (loginError) {
      setError(loginError instanceof Error && loginError.message !== "Unauthorized" ? loginError.message : "Wrong password")
    } finally {
      setLoginLoading(false)
    }
  }

  const toggleAttendance = async (participant: CohostParticipant) => {
    if (!token || toggling[participant.number]) return
    setToggling(previous => ({ ...previous, [participant.number]: true }))
    setDashboard(previous => previous ? {
      ...previous,
      participants: previous.participants.map(item => item.number === participant.number ? { ...item, attended: !participant.attended } : item),
    } : previous)
    try {
      const data = await cohostApi("e3-cohost-set-attendance", token, { participant_number: participant.number, attended: !participant.attended })
      setDashboard(previous => previous ? {
        ...previous,
        participants: previous.participants.map(item => item.number === participant.number ? { ...item, attended: !!data.attended } : item),
      } : previous)
    } catch (requestError) {
      setDashboard(previous => previous ? {
        ...previous,
        participants: previous.participants.map(item => item.number === participant.number ? { ...item, attended: participant.attended } : item),
      } : previous)
      setError(requestError instanceof Error ? requestError.message : "Attendance update failed")
    } finally {
      setToggling(previous => { const next = { ...previous }; delete next[participant.number]; return next })
    }
  }

  const resolveSos = async (request: SosRequest) => {
    if (!token || sosBusy[request.id]) return
    setSosBusy(previous => ({ ...previous, [request.id]: true }))
    try {
      await cohostApi("e3-cohost-resolve-sos", token, { id: request.id })
      setDashboard(previous => previous ? { ...previous, sos_requests: previous.sos_requests.filter(item => item.id !== request.id) } : previous)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not resolve request")
    } finally {
      setSosBusy(previous => { const next = { ...previous }; delete next[request.id]; return next })
    }
  }

  const replySos = async (request: SosRequest) => {
    const reply = (replyText[request.id] || "").trim()
    if (!token || !reply || sosBusy[request.id]) return
    setSosBusy(previous => ({ ...previous, [request.id]: true }))
    try {
      await cohostApi("e3-cohost-reply-sos", token, { id: request.id, reply })
      setReplyText(previous => ({ ...previous, [request.id]: "" }))
      await fetchDashboard(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send reply")
    } finally {
      setSosBusy(previous => { const next = { ...previous }; delete next[request.id]; return next })
    }
  }

  const participants = dashboard?.participants || []
  const participantByNumber = useMemo(() => new Map(participants.map(participant => [participant.number, participant])), [participants])
  const round = activeRound(dashboard?.state.phase)
  const attendedCount = participants.filter(participant => participant.attended).length
  const rankingCount = participants.filter(participant => participant.ranking_submitted).length
  const firstTimerCount = participants.filter(participant => participant.first_time).length
  const filteredParticipants = useMemo(() => {
    const query = search.trim().toLowerCase()
    return participants
      .filter(participant => !query || participant.name.toLowerCase().includes(query) || String(participant.number).includes(query))
      .sort((left, right) => Number(left.attended) - Number(right.attended) || left.number - right.number)
  }, [participants, search])

  if (!token) {
    return (
      <div className="min-h-screen bg-[#05070c] text-white flex items-center justify-center p-5" dir="ltr">
        <div className="w-full max-w-sm rounded-3xl border border-teal-400/15 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl shadow-teal-950/30">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-teal-400/20 bg-teal-400/10">
            <Heart size={28} className="text-teal-300" />
          </div>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-teal-400">BlindMatch Event 3</p>
            <h1 className="mt-2 text-2xl font-black">Co-host console</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">Event-day check-in, table guidance, ranking status, and attendee help requests.</p>
          </div>
          <form onSubmit={handleLogin} className="mt-7 space-y-3">
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={event => { setPassword(event.target.value); setError("") }}
                placeholder="Co-host password"
                autoComplete="current-password"
                autoFocus
                className="min-h-12 w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-teal-400/50"
              />
            </div>
            {error && <p className="rounded-lg bg-red-950/40 px-3 py-2 text-center text-xs text-red-300">{error}</p>}
            <button type="submit" disabled={loginLoading || !password.trim()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 font-black text-slate-950 transition hover:brightness-110 disabled:opacity-40">
              {loginLoading ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
              Enter securely
            </button>
          </form>
          <p className="mt-5 text-center text-[10px] leading-5 text-slate-600">This account cannot change phases, run matching, view surveys, payments, private feedback, or compatibility scores.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#05070c] text-white" dir="ltr">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#05070c]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-400/20 bg-teal-400/10">
                <Users size={18} className="text-teal-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-sm font-black">Co-host · Event {dashboard?.event_id ?? "—"}</h1>
                  {dashboard?.sos_requests.length ? <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-black">{dashboard.sos_requests.length}</span> : null}
                </div>
                <p className="truncate text-[10px] font-semibold text-teal-400">{PHASE_LABELS[dashboard?.state.phase || ""] || dashboard?.state.phase || "Loading event…"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dashboard?.state.global_timer_active && (
                <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 font-mono text-xs font-black ${timerRemaining <= 60 ? "border-red-500/30 bg-red-950/30 text-red-300" : "border-white/10 bg-white/[0.04] text-slate-200"}`}>
                  <Clock3 size={13} /> {formatTimer(timerRemaining)}
                </div>
              )}
              <button onClick={() => fetchDashboard()} disabled={loading} aria-label="Refresh" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 hover:text-white disabled:opacity-50">
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
              <button onClick={() => logout()} aria-label="Sign out" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-500 hover:text-red-300">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4 pb-24">
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-red-400">Dismiss</button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Checked in", value: `${attendedCount}/${participants.length}`, icon: UserCheck, color: "text-teal-300" },
            { label: "Rankings in", value: `${rankingCount}/${participants.length}`, icon: CheckCircle2, color: "text-amber-300" },
            { label: "First timers", value: firstTimerCount, icon: Sparkles, color: "text-cyan-300" },
            { label: round ? "Live seating" : "Open help", value: round ? (round === 20 || round === 30 ? "1:1" : `R${round}`) : dashboard?.sos_requests.length || 0, icon: round ? Table2 : Bell, color: "text-purple-300" },
          ].map(item => (
            <div key={item.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3">
              <div className="flex items-center justify-between"><item.icon size={15} className={item.color} /><span className="text-lg font-black tabular-nums">{item.value}</span></div>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">{item.label}</p>
            </div>
          ))}
        </section>

        {dashboard?.sos_requests.length ? (
          <button onClick={() => setTab("help")} className="flex w-full items-center gap-3 rounded-2xl border border-red-500/30 bg-red-950/30 p-3 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15"><Bell size={18} className="animate-pulse text-red-300" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-black text-red-100">{dashboard.sos_requests.length} attendee request{dashboard.sos_requests.length === 1 ? "" : "s"}</span><span className="block truncate text-xs text-red-300/70">Tap to reply or mark resolved</span></span>
          </button>
        ) : null}

        <nav className="grid grid-cols-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1">
          {([
            ["overview", "Event view", Table2],
            ["attendance", "Check-in", UserCheck],
            ["help", `Help${dashboard?.sos_requests.length ? ` (${dashboard.sos_requests.length})` : ""}`, MessageCircle],
          ] as const).map(([value, label, Icon]) => (
            <button key={value} onClick={() => setTab(value)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition ${tab === value ? "bg-teal-500 text-slate-950 shadow-lg shadow-teal-950/30" : "text-slate-500 hover:text-white"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        {(tab === "overview" || tab === "attendance") && (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or number" className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-400/40" />
          </div>
        )}

        {loading && !dashboard ? (
          <div className="flex justify-center py-20"><Loader2 size={26} className="animate-spin text-teal-400" /></div>
        ) : tab === "help" ? (
          <section className="space-y-3">
            {!dashboard?.sos_requests.length ? (
              <div className="rounded-3xl border border-white/[0.07] bg-white/[0.03] px-5 py-14 text-center"><CheckCircle2 className="mx-auto text-teal-400" size={30} /><p className="mt-3 text-sm font-bold">No open help requests</p><p className="mt-1 text-xs text-slate-600">This page refreshes automatically.</p></div>
            ) : dashboard.sos_requests.map(request => (
              <article key={request.id} className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/35 to-slate-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h2 className="font-black">{request.participant_name || `#${request.participant_number}`}</h2><span className="text-[10px] text-slate-500">#{request.participant_number}</span><span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-300">{request.status}</span></div>
                    {request.table_info && <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-300"><MapPin size={11} />{request.table_info}</p>}
                  </div>
                  <span className="text-[9px] text-slate-600">{new Date(request.updated_at || request.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {request.message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm leading-6 text-slate-200">{request.message}</p>}
                {request.organizer_reply && <p className="mt-2 text-[11px] text-teal-300">Last reply: {request.organizer_reply}</p>}
                <div className="mt-3 flex gap-2">
                  <input value={replyText[request.id] || ""} onChange={event => setReplyText(previous => ({ ...previous, [request.id]: event.target.value }))} onKeyDown={event => { if (event.key === "Enter") replySos(request) }} placeholder="Reply to attendee…" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm outline-none focus:border-teal-400/40" />
                  <button onClick={() => replySos(request)} disabled={!replyText[request.id]?.trim() || sosBusy[request.id]} className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500 text-slate-950 disabled:opacity-40">{sosBusy[request.id] ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</button>
                </div>
                <button onClick={() => resolveSos(request)} disabled={sosBusy[request.id]} className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-bold text-slate-300 hover:text-white disabled:opacity-40"><CheckCircle2 size={14} /> Mark resolved</button>
              </article>
            ))}
          </section>
        ) : tab === "attendance" ? (
          <section className="space-y-2">
            {filteredParticipants.map(participant => (
              <button key={participant.number} onClick={() => toggleAttendance(participant)} disabled={toggling[participant.number]} className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${participant.attended ? "border-teal-500/25 bg-teal-950/25" : "border-white/[0.07] bg-white/[0.03] hover:border-white/15"}`}>
                {toggling[participant.number] ? <Loader2 size={22} className="shrink-0 animate-spin text-slate-500" /> : participant.attended ? <CheckCircle2 size={22} className="shrink-0 text-teal-400" /> : <Circle size={22} className="shrink-0 text-slate-700" />}
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-black">{participant.name}</span><span className="text-[10px] text-slate-600">#{participant.number}</span>{participant.first_time && <span className="rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">new</span>}</span><span className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">{round && participant.tables[String(round)] ? <span className="font-bold text-amber-300">Table {participant.tables[String(round)]}</span> : null}<span>{participant.age ? `${participant.age}y` : "Age —"}</span></span></span>
                <span className={`text-[10px] font-black ${participant.attended ? "text-teal-300" : "text-slate-600"}`}>{participant.attended ? "PRESENT" : "ABSENT"}</span>
              </button>
            ))}
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {filteredParticipants.map(participant => {
              const table = round ? participant.tables[String(round)] : null
              const choicePartner = participant.phase2_partner ? participantByNumber.get(participant.phase2_partner) : null
              const algorithmPartner = participant.phase3_partner ? participantByNumber.get(participant.phase3_partner) : null
              return (
                <article key={participant.number} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-black ${table ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : participant.attended ? "border-teal-400/20 bg-teal-400/10 text-teal-300" : "border-white/[0.07] bg-black/20 text-slate-600"}`}>{table ?? participant.number}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5"><h2 className="truncate text-sm font-black">{participant.name}</h2><span className="text-[9px] text-slate-600">#{participant.number}</span>{participant.first_time ? <span className="rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">first event</span> : <span className="text-[9px] text-slate-600">{participant.previous_event_count} prior</span>}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px]"><span className={participant.attended ? "font-bold text-teal-300" : "text-slate-600"}>{participant.attended ? "Checked in" : "Not here"}</span><span className={participant.ranking_submitted ? "font-bold text-amber-300" : "text-slate-600"}>{participant.ranking_submitted ? "Ranking saved" : "Ranking pending"}</span>{table && <span className="font-black text-purple-300">Current table {table}</span>}</div>
                    </div>
                  </div>
                  {(choicePartner || algorithmPartner) && (
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 text-[10px]">
                      <div className="rounded-lg bg-pink-500/[0.06] px-2 py-1.5"><span className="block text-slate-600">Choice match</span><span className="font-bold text-pink-300">{choicePartner?.name || "—"}</span></div>
                      <div className="rounded-lg bg-purple-500/[0.06] px-2 py-1.5"><span className="block text-slate-600">Algorithm match</span><span className="font-bold text-purple-300">{algorithmPartner?.name || "—"}</span></div>
                    </div>
                  )}
                </article>
              )
            })}
          </section>
        )}

        {!loading && (tab === "overview" || tab === "attendance") && filteredParticipants.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-600">No attendees match this search.</div>
        )}
      </main>
    </div>
  )
}
