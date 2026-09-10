const MINIMUM_ANALYZED_SCORE = 60

const DIMENSIONS = Object.freeze({
  commonGround: { source: "semanticCommonGround", maximum: 18 },
  interaction: { source: "interactionRhythm", maximum: 20 },
  humor: { source: "humorOpenness", maximum: 10 },
  attachment: { source: "attachmentComfort", maximum: 8 },
  lifestyle: { source: "lifestyleSustainability", maximum: 12 },
  values: { source: "valuesBoundariesLanguage", maximum: 17 },
  communication: { source: "communicationDisagreement", maximum: 10 },
  intent: { source: "intent", maximum: 5 },
})

// Describe narrow questionnaire signals, never people or future outcomes.
const COPY = Object.freeze({
  commonGround: {
    headline: "نقاط مشتركة في التفاصيل",
    lead: name => `تُظهر إجاباتك وإجابات ${name} بعض التفاصيل والاهتمامات المشتركة التي قد تمنح الحديث نقطة بداية سهلة.`,
    support: "هذه الإشارة تصف ما ظهر في الإجابات فقط، وقد تختلف تجربة الحوار الفعلية.",
    prompt: "سؤال اختياري إن واصلتما الحديث: ما التفصيلة التي بقيت في بالك من اللقاء؟",
  },
  interaction: {
    headline: "تقارب في إيقاع الحوار",
    lead: name => `تشير الإجابات إلى بعض التقارب بينك وبين ${name} في المبادرة والاستماع وعمق الحديث.`,
    support: "هذا لا يحدد تلقائياً مدى الراحة أو الانجذاب؛ اللقاء نفسه يبقى المصدر الأهم.",
    prompt: "سؤال اختياري إن واصلتما الحديث: ما الموضوع الذي تمنيت أن يأخذ وقتاً أطول؟",
  },
  humor: {
    headline: "تقارب في الدعابة والانفتاح",
    lead: name => `تعكس إجاباتك وإجابات ${name} بعض التشابه في أسلوب المزاح ومستوى الانفتاح المفضّل.`,
    support: "الدعابة شديدة الارتباط بالسياق، لذلك تُقرأ هذه النتيجة كإشارة محدودة لا كحكم.",
    prompt: "سؤال اختياري إن واصلتما الحديث: أي لحظة خفيفة من اللقاء أحببتها؟",
  },
  attachment: {
    headline: "تقارب في تفضيلات القرب",
    lead: name => `توجد في الإجابات إشارات إلى تقارب بينك وبين ${name} في تفضيلات الطمأنة والمساحة الشخصية.`,
    support: "هذه ليست قراءة نفسية أو تشخيصاً، ولا تتنبأ بكيفية تصرف أي منكما خارج الفعالية.",
    prompt: "سؤال اختياري إن واصلتما الحديث: ما أسلوب التواصل الذي يجعلك مرتاحاً؟",
  },
  lifestyle: {
    headline: "تشابه في بعض تفاصيل اليوم",
    lead: name => `تُظهر الإجابات بعض التشابه بين روتينك وروتين ${name} في التوقيت والتخطيط والأنشطة.`,
    support: "تشابه الروتين عامل واحد محدود، ولا يعني وحده سهولة العلاقة أو صعوبتها.",
    prompt: "سؤال اختياري إن واصلتما الحديث: كيف يبدو يوم عادي تحبه؟",
  },
  values: {
    headline: "نقاط تقارب في القيم والحدود",
    lead: name => `تشير الإجابات إلى بعض النقاط المتقاربة بينك وبين ${name} في الأولويات والحدود وطريقة التعبير.`,
    support: "الإجابات المختصرة لا تكفي لفهم القيم كاملة؛ الحوار المباشر أدق من هذه القراءة.",
    prompt: "سؤال اختياري إن واصلتما الحديث: ما الموقف الذي غيّر رأيك في شيء مهم؟",
  },
  communication: {
    headline: "تقارب في أسلوب التواصل",
    lead: name => `تعكس الإجابات بعض التقارب بينك وبين ${name} في طريقة التعبير والتعامل مع الاختلاف.`,
    support: "هذه إشارة تقريبية من اختيارات محدودة وليست ضماناً لسهولة التواصل دائماً.",
    prompt: "سؤال اختياري إن واصلتما الحديث: كيف تفضّل توضيح سوء الفهم؟",
  },
  intent: {
    headline: "تقارب في هدف التعارف",
    lead: name => `تُظهر الإجابات تقارباً محتملاً بينك وبين ${name} في الهدف المعلن من التعارف.`,
    support: "قد تتغير النية أو تتضح أكثر مع الوقت، لذلك لا تُعامل هذه الإشارة كالتزام من أي طرف.",
    prompt: "سؤال اختياري إن واصلتما الحديث: ما الذي تتمنى أن تجده في تعارف جديد؟",
  },
})

function normalizedScore(value) {
  if (value === null || value === undefined || value === "") return null
  const score = Number(value)
  return Number.isFinite(score) ? Math.round(Math.max(0, Math.min(100, score))) : null
}

function signalForScore(score) {
  if (score >= 76) return "تشابه مرتفع في الإجابات"
  if (score >= 68) return "تشابه متوسط في الإجابات"
  return "تشابه محدود في الإجابات"
}

export function buildEvent3PairInsight({ score: rawScore, breakdown, partnerName }) {
  const score = normalizedScore(rawScore)
  if (score === null || score < MINIMUM_ANALYZED_SCORE) return null

  const safeName = String(partnerName || "هذا الشخص").trim().slice(0, 80) || "هذا الشخص"
  const ranked = []
  for (const [key, definition] of Object.entries(DIMENSIONS)) {
    const value = Number(breakdown?.[definition.source])
    if (!Number.isFinite(value)) continue
    ranked.push({ key, ratio: Math.max(0, Math.min(1, value / definition.maximum)) })
  }
  ranked.sort((left, right) => right.ratio - left.ratio)

  const signal = signalForScore(score)
  const strongest = ranked[0]?.key
  if (!strongest) {
    return {
      signal,
      headline: "قراءة عامة من الإجابات",
      body: `تشير النتيجة الإجمالية إلى بعض النقاط المشتركة بين إجاباتك وإجابات ${safeName}، لكن التفاصيل المتاحة لا تكفي لتحديد بُعد بارز. هذه قراءة تقريبية ولا تتنبأ بتجربة التعارف.`,
      prompt: "إن واصلتما الحديث، يمكن أن تبدآ من تفصيلة لم تأخذ وقتها في اللقاء الأول.",
    }
  }

  const supporting = ranked.find(item => item.key !== strongest)?.key || strongest
  const promptSource = ranked.length > 1 ? ranked[ranked.length - 1].key : strongest
  const primaryCopy = COPY[strongest]
  const supportingCopy = COPY[supporting]
  const promptCopy = COPY[promptSource]
  return {
    signal,
    headline: primaryCopy.headline,
    body: `${primaryCopy.lead(safeName)} ${supportingCopy.support}`,
    prompt: promptCopy.prompt,
  }
}
