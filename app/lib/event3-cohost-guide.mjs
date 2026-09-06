import { EVENT3_PHASE_TIMER_SECONDS } from "../../server/event3/timing.mjs"

const timedDurationLabel = seconds => `${Math.round(seconds / 60)} دقيقة`

export const EVENT3_CHOICE_COHOST_PHASES = Object.freeze([
  {
    phase: "setup",
    label: "التجهيز",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.setup,
    durationLabel: "قبل البداية",
    instruction: "راجعي الحضور والطاولات، وتأكدي أن كل شخص يعرف رقم طاولته قبل ما نبدأ.",
    expiredInstruction: null,
    nextAction: "جهّزي الجميع وروّحيهم لطاولات الجولة الأولى.",
  },
  {
    phase: "round1",
    label: "الجلسة الجماعية الأولى",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.round1,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.round1),
    instruction: "تأكدي أن كل شخص وصل لطاولته، وبعدها خليهم يبعدون الجوالات ويركزون مع المجموعة.",
    expiredInstruction: "خلص وقت الجلسة. خلي الجميع يفتحون جوالاتهم ويكملون تقييم المجموعة وترتيب الأشخاص اللي قابلوهم.",
    nextAction: "أعلني للجميع أول ما يفتح التقييم والترتيب الأول.",
  },
  {
    phase: "ranking1",
    label: "تقييم وترتيب الجولة الأولى",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.ranking1,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.ranking1),
    instruction: "قولي للجميع إن التقييم والترتيب فتح الآن. تابعي مين باقي وساعدي أي شخص ما ظهر له النموذج.",
    expiredInstruction: "خلص وقت التقييم والترتيب. شيّكي مين باقي قبل ما تنقلين المشاركين.",
    nextAction: "تأكدي أن الردود وصلت، وبعدها وجّهي الجميع لطاولات الجولة الثانية.",
  },
  {
    phase: "round2",
    label: "الجلسة الجماعية الثانية",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.round2,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.round2),
    instruction: "ساعديهم يوصلون لطاولاتهم الجديدة، وبعدها اتركي لهم مساحة للمحادثة.",
    expiredInstruction: "خلص وقت الجلسة. خلي الجميع يكملون تقييم المجموعة ويرتبون الأشخاص اللي قابلوهم.",
    nextAction: "أعلني عن التقييم والترتيب الثاني أول ما تتغير المرحلة.",
  },
  {
    phase: "ranking2",
    label: "تقييم وترتيب الجولة الثانية",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.ranking2,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.ranking2),
    instruction: "قولي للجميع إن التقييم والترتيب فتح، وتابعي من صفحة التقييمات مين باقي.",
    expiredInstruction: "خلص الوقت. شوفي مين باقي وساعديه يكمل قبل الجولة الأخيرة.",
    nextAction: "بعد ما تكتمل الردود، وجّهي الجميع لطاولات الجولة الثالثة.",
  },
  {
    phase: "round3",
    label: "الجلسة الجماعية الثالثة",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.round3,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.round3),
    instruction: "وجّهيهم لآخر طاولة جماعية، وخليهم يبعدون الجوالات إلى نهاية الجلسة.",
    expiredInstruction: "خلصت آخر جلسة جماعية. خلي الجميع يكملون التقييم والترتيب النهائي.",
    nextAction: "ذكّريهم أن هذا آخر تقييم جماعي وآخر فرصة يعدّلون ترتيبهم.",
  },
  {
    phase: "ranking3",
    label: "التقييم والترتيب النهائي",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.ranking3,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.ranking3),
    instruction: "أعلني عن التقييم والترتيب النهائي، وشيّكي مين بدأ وما كمل ومين ما بدأ.",
    expiredInstruction: "خلص الوقت. تأكدي من التقييمات والترتيبات قبل ما يعتمد المضيف اللقاءات الفردية.",
    nextAction: "قولي للمشاركين إننا نجهّز لقاءاتهم الفردية الآن.",
  },
  {
    phase: "phase2_processing",
    label: "تجهيز الاختيار الأول",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase2_processing,
    durationLabel: "حتى اعتماد اللقاءات",
    instruction: "خلي المشاركين قريبين ويتابعون جوالاتهم. لا توجّهين أحد لين تكتمل اللقاءات.",
    expiredInstruction: null,
    nextAction: "أول ما يخلص التجهيز، ابدئي الاستراحة قبل إعلان اللقاء الأول.",
  },
  {
    phase: "break",
    label: "استراحة",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.break,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.break),
    instruction: "قولي لهم كم مدة الاستراحة ومتى يرجعون، وخليك قريبة من أي شخص يحتاج مساعدة.",
    expiredInstruction: "خلصت الاستراحة. رجّعي الجميع وخليهم يفتحون جوالاتهم عشان يعرفون اللقاء الأول.",
    nextAction: "جهّزيهم يروحون لمكان لقاء الاختيار الأول.",
  },
  {
    phase: "phase2_reveal",
    label: "لقاء الاختيار الأول",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase2_reveal,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.phase2_reveal),
    instruction: "تأكدي أن كل شخص وصل لشريكه ومكانه الصح، وبعدها خليهم يبعدون الجوالات.",
    expiredInstruction: "خلص اللقاء الأول. خلي الطرفين يكملون التقييم قبل ما يتحركون.",
    nextAction: "تابعي تقييم اللقاء الأول، والمضيف يجهّز اللقاء الثاني.",
  },
  {
    phase: "phase3_processing",
    label: "تجهيز الاختيار الثاني",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase3_processing,
    durationLabel: "حتى اعتماد اللقاءات",
    instruction: "تابعي تقييم اللقاء الأول، وخليهم ينتظرون لين تظهر لهم تفاصيل اللقاء الجاي.",
    expiredInstruction: null,
    nextAction: "أول ما تعتمد اللقاءات، وجّهي كل شخص لشريكه الثاني.",
  },
  {
    phase: "phase3_reveal",
    label: "لقاء الاختيار الثاني",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase3_reveal,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.phase3_reveal),
    instruction: "تأكدي أن كل شخص وصل لشريكه الثاني، وبعدها اتركي لهم وقتهم كامل.",
    expiredInstruction: "خلص اللقاء الثاني. خلي الطرفين يكملون التقييم قبل ما يتحركون.",
    nextAction: "تابعي التقييم، والمضيف يجهّز اللقاء الثالث.",
  },
  {
    phase: "phase4_processing",
    label: "تجهيز الاختيار الثالث",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase4_processing,
    durationLabel: "حتى اعتماد اللقاءات",
    instruction: "تابعي تقييم اللقاء الثاني، وخليهم ينتظرون تفاصيل اللقاء الأخير.",
    expiredInstruction: null,
    nextAction: "أول ما تعتمد اللقاءات، وجّهي الجميع للقاء الاختيار الثالث.",
  },
  {
    phase: "phase4_reveal",
    label: "لقاء الاختيار الثالث",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase4_reveal,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.phase4_reveal),
    instruction: "تأكدي أن كل شخص وصل لشريكه الأخير، وبعدها خليهم يبعدون الجوالات ويركزون مع بعض.",
    expiredInstruction: "خلص اللقاء الأخير. خلي الجميع يكملون التقييم قبل إعلان النتائج.",
    nextAction: "شيّكي على التقييمات الباقية، وبعدها اجمعي الجميع للنتائج.",
  },
  {
    phase: "final_reveal",
    label: "النتائج النهائية",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.final_reveal,
    durationLabel: "الختام",
    instruction: "اجمعي الجميع للختام، ووجّهيهم للنتائج ومعلومات التواصل اللي وافق الطرفان على مشاركتها.",
    expiredInstruction: null,
    nextAction: "قبل ما يمشون، تأكدي ما بقي أي طلب مساعدة.",
  },
].map(item => Object.freeze(item)))

const phaseByName = new Map(EVENT3_CHOICE_COHOST_PHASES.map(item => [item.phase, item]))

export function getEvent3ChoiceCohostPhase(phase) {
  return phaseByName.get(String(phase || "")) || null
}

export function getEvent3ChoiceCohostPhaseIndex(phase) {
  return EVENT3_CHOICE_COHOST_PHASES.findIndex(item => item.phase === phase)
}

export function getEvent3ChoiceCohostNextPhase(phase) {
  const index = getEvent3ChoiceCohostPhaseIndex(phase)
  return index >= 0 ? EVENT3_CHOICE_COHOST_PHASES[index + 1] || null : null
}

export function getEvent3CohostTimerStatus({ active, startTime, durationSeconds, nowMs = Date.now() }) {
  const duration = Number.isFinite(Number(durationSeconds)) ? Math.max(0, Number(durationSeconds)) : 0
  if (!active || !startTime) return { state: "inactive", remainingSeconds: duration }

  const startMs = Date.parse(startTime)
  if (!Number.isFinite(startMs)) return { state: "inactive", remainingSeconds: duration }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000))
  const remainingSeconds = Math.max(0, Math.ceil(duration - elapsedSeconds))
  return {
    state: remainingSeconds > 0 ? "running" : "expired",
    remainingSeconds,
  }
}

export function calculateEvent3ServerClockOffsetMs({ serverNow, requestStartedAt, responseReceivedAt }) {
  const serverNowMs = typeof serverNow === "string" ? Date.parse(serverNow) : Number.NaN
  const requestStartMs = Number(requestStartedAt)
  const responseReceivedMs = Number(responseReceivedAt)
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(requestStartMs) || !Number.isFinite(responseReceivedMs)) return 0
  return serverNowMs - ((requestStartMs + responseReceivedMs) / 2)
}

export function buildEvent3DisplayedMutationContext({ eventId, testMode, testSessionKey }) {
  const normalizedEventId = Number(eventId)
  if (!Number.isSafeInteger(normalizedEventId) || normalizedEventId <= 0 || typeof testMode !== "boolean") return null

  const normalizedSessionKey = String(testSessionKey || (testMode ? "" : "live")).trim()
  if (!normalizedSessionKey) return null

  return {
    expected_event_id: normalizedEventId,
    expected_test_mode: testMode,
    expected_test_session_key: normalizedSessionKey,
  }
}

export function summarizeEvent3GroupFeedbackProgress(statuses) {
  const applicable = Array.from(statuses || []).filter(status => status !== "not_applicable")
  const completeCount = applicable.filter(status => status === "complete").length
  const partialCount = applicable.filter(status => status === "partial").length
  const missingCount = applicable.filter(status => status === "missing").length
  return {
    expectedCount: applicable.length,
    completeCount,
    partialCount,
    missingCount,
    remainingCount: partialCount + missingCount,
  }
}
