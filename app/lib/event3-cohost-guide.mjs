import { EVENT3_PHASE_TIMER_SECONDS } from "../../server/event3/timing.mjs"

const timedDurationLabel = seconds => `${Math.round(seconds / 60)} دقيقة`

export const EVENT3_CHOICE_COHOST_PHASES = Object.freeze([
  {
    phase: "setup",
    label: "التجهيز",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.setup,
    durationLabel: "قبل البداية",
    instruction: "راجعي الحضور والطاولات، وتأكدي أن كل مشارك يعرف رقم طاولته قبل بدء الجولة الأولى.",
    expiredInstruction: null,
    nextAction: "استعدي لتوجيه الجميع إلى طاولات الجولة الأولى.",
  },
  {
    phase: "round1",
    label: "الجلسة الجماعية الأولى",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.round1,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.round1),
    instruction: "وجّهي الجميع إلى طاولاتهم، ثم دعي الهواتف جانبًا حتى يقترب انتهاء الجلسة.",
    expiredInstruction: "انتهى وقت الجلسة. اطلبي من الجميع فتح هواتفهم لإكمال تقييم المجموعة وترتيب الأشخاص الذين قابلوهم.",
    nextAction: "أعلني بوضوح عند فتح تقييم المجموعة والترتيب الأول.",
  },
  {
    phase: "ranking1",
    label: "تقييم وترتيب الجولة الأولى",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.ranking1,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.ranking1),
    instruction: "أعلني أن التقييم والترتيب مفتوحان الآن. تابعي المتبقيين وساعدي من لم يظهر له النموذج.",
    expiredInstruction: "انتهت مهلة التقييم والترتيب. راجعي عدد الردود غير المكتملة قبل نقل المشاركين.",
    nextAction: "تأكدي من وصول الردود، ثم وجّهي الجميع إلى طاولات الجولة الثانية.",
  },
  {
    phase: "round2",
    label: "الجلسة الجماعية الثانية",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.round2,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.round2),
    instruction: "ساعدي المشاركين على الوصول إلى طاولاتهم الجديدة، ثم اتركي المساحة للمحادثة.",
    expiredInstruction: "انتهى وقت الجلسة. اطلبي من الجميع إكمال تقييم المجموعة وترتيب الأشخاص الذين قابلوهم.",
    nextAction: "أعلني فتح تقييم المجموعة والترتيب الثاني فور انتقال المرحلة.",
  },
  {
    phase: "ranking2",
    label: "تقييم وترتيب الجولة الثانية",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.ranking2,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.ranking2),
    instruction: "أعلني أن التقييم والترتيب مفتوحان الآن، وتابعي الردود غير المكتملة من لوحة التقييمات.",
    expiredInstruction: "انتهت المهلة. راجعي المتبقيين وساعديهم على الإكمال قبل الجولة الأخيرة.",
    nextAction: "بعد اكتمال الردود، وجّهي الجميع إلى طاولات الجولة الثالثة.",
  },
  {
    phase: "round3",
    label: "الجلسة الجماعية الثالثة",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.round3,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.round3),
    instruction: "وجّهي المشاركين إلى آخر طاولة جماعية، ثم اتركي الهواتف جانبًا حتى نهاية الوقت.",
    expiredInstruction: "انتهى وقت الجلسة الجماعية الأخيرة. اطلبي إكمال التقييم والترتيب النهائي.",
    nextAction: "أعلني أن هذا هو آخر تقييم جماعي وآخر فرصة لتعديل الترتيب.",
  },
  {
    phase: "ranking3",
    label: "التقييم والترتيب النهائي",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.ranking3,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.ranking3),
    instruction: "أعلني بدء التقييم والترتيب النهائي. تابعي من بدأ ولم يكمل ومن لم يبدأ بعد.",
    expiredInstruction: "انتهت المهلة. تأكدي من اكتمال التقييمات والترتيبات قبل اعتماد اللقاءات الفردية.",
    nextAction: "أخبري المشاركين أن لقاءاتهم الفردية تُجهّز الآن.",
  },
  {
    phase: "phase2_processing",
    label: "تجهيز الاختيار الأول",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase2_processing,
    durationLabel: "حتى اعتماد اللقاءات",
    instruction: "اطلبي من المشاركين البقاء قريبًا ومتابعة هواتفهم، وتحققي من اكتمال اللقاءات قبل توجيه أي شخص.",
    expiredInstruction: null,
    nextAction: "عند اكتمال التجهيز، ابدئي الاستراحة قبل إعلان اللقاء الأول.",
  },
  {
    phase: "break",
    label: "استراحة",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.break,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.break),
    instruction: "أعلني مدة الاستراحة وموعد العودة، وكوني متاحة لمن يحتاج مساعدة بهدوء.",
    expiredInstruction: "انتهت الاستراحة. اطلبي من الجميع العودة وفتح هواتفهم لمعرفة اللقاء الأول.",
    nextAction: "جهّزي المشاركين للانتقال إلى أماكن لقاء الاختيار الأول.",
  },
  {
    phase: "phase2_reveal",
    label: "لقاء الاختيار الأول",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase2_reveal,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.phase2_reveal),
    instruction: "وجّهي كل شخص إلى شريكه ومكان اللقاء، ثم اتركي الهواتف جانبًا أثناء الحديث.",
    expiredInstruction: "انتهى اللقاء الأول. اطلبي من الطرفين إكمال تقييم اللقاء قبل الانتقال.",
    nextAction: "تابعي اكتمال تقييم اللقاء الأول بينما يجهّز المضيف اللقاء الثاني.",
  },
  {
    phase: "phase3_processing",
    label: "تجهيز الاختيار الثاني",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase3_processing,
    durationLabel: "حتى اعتماد اللقاءات",
    instruction: "تابعي تقييم اللقاء الأول، واطلبي من المشاركين الانتظار حتى تظهر لهم تفاصيل اللقاء التالي.",
    expiredInstruction: null,
    nextAction: "عند اعتماد اللقاءات، وجّهي كل شخص إلى شريكه الثاني.",
  },
  {
    phase: "phase3_reveal",
    label: "لقاء الاختيار الثاني",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase3_reveal,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.phase3_reveal),
    instruction: "تأكدي أن كل شخص وصل إلى شريكه الثاني، ثم دعي المحادثة تأخذ وقتها الكامل.",
    expiredInstruction: "انتهى اللقاء الثاني. اطلبي من الطرفين إكمال تقييم اللقاء قبل الانتقال.",
    nextAction: "تابعي اكتمال التقييم بينما يجهّز المضيف اللقاء الثالث.",
  },
  {
    phase: "phase4_processing",
    label: "تجهيز الاختيار الثالث",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase4_processing,
    durationLabel: "حتى اعتماد اللقاءات",
    instruction: "تابعي تقييم اللقاء الثاني، واطلبي من المشاركين انتظار تفاصيل اللقاء الأخير.",
    expiredInstruction: null,
    nextAction: "عند اعتماد اللقاءات، وجّهي الجميع إلى لقاء الاختيار الثالث.",
  },
  {
    phase: "phase4_reveal",
    label: "لقاء الاختيار الثالث",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.phase4_reveal,
    durationLabel: timedDurationLabel(EVENT3_PHASE_TIMER_SECONDS.phase4_reveal),
    instruction: "تأكدي أن كل شخص وصل إلى شريكه الأخير، ثم اتركي المساحة للمحادثة بعيدًا عن الهاتف.",
    expiredInstruction: "انتهى اللقاء الأخير. اطلبي من الجميع إكمال التقييم قبل إعلان النتائج.",
    nextAction: "راجعي التقييمات المتبقية، ثم اجمعي المشاركين للنتائج النهائية.",
  },
  {
    phase: "final_reveal",
    label: "النتائج النهائية",
    durationSeconds: EVENT3_PHASE_TIMER_SECONDS.final_reveal,
    durationLabel: "الختام",
    instruction: "اجمعي المشاركين للختام، ووجّهيهم إلى النتائج ووسائل التواصل التي وافق الطرفان على مشاركتها.",
    expiredInstruction: null,
    nextAction: "تابعي أي طلب مساعدة قبل مغادرة المشاركين.",
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
