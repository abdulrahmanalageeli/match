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

const COPY = Object.freeze({
  commonGround: {
    headline: "ألفة تظهر من التفاصيل",
    lead: name => `مع ${name}، البداية لا تحتاج كثيراً من الشرح؛ هناك إحساس مألوف يجعل الحديث يدخل سريعاً في منطقة طبيعية.`,
    support: "بينكما تفاصيل مشتركة تكفي لإبقاء الحوار حيّاً، من غير أن تسرق فضول اكتشاف الجديد.",
    prompt: "ابدآ من تفصيلة صغيرة علقت في بالكما الليلة؛ غالباً ستفتح موضوعاً أكبر مما تتوقعان.",
  },
  interaction: {
    headline: "حوار يعرف طريقه",
    lead: name => `بينك وبين ${name} إيقاع يلتقط نفسه بسرعة؛ مساحة الكلام والاستماع مرشحة أن تتوزع من غير شدّ.`,
    support: "الحوار هنا قابل لأن ينتقل بين الخفة والعمق من دون قفزات محرجة أو صمت يحتاج إلى إنقاذ.",
    prompt: "اتركا أول دقيقتين بلا أجندة؛ سؤال متابعة صادق سيقود اللقاء أفضل من سؤال جديد.",
  },
  humor: {
    headline: "خفة تُفهم بسرعة",
    lead: name => `خفّة الدم بينك وبين ${name} تبدو مفهومة من الطرفين؛ الإشارة تصل من غير شرح زائد أو محاولة لإبهار الآخر.`,
    support: "هذا يعطي اللقاء فرصة أن يبقى مرحاً من غير أن يتحول إلى سطحية، ويجعل العودة للجد سهلة.",
    prompt: "ارجعا للحظة أضحكتكما في اللقاء؛ ما وراءها قد يقول عنكما أكثر من السؤال نفسه.",
  },
  attachment: {
    headline: "قرب بلا ضغط",
    lead: name => `طريقة الاقتراب بينك وبين ${name} تبدو مريحة؛ لا استعجال يربك ولا مسافة تجعل الاهتمام غامضاً.`,
    support: "المسافة بين الحضور والهدوء قابلة للفهم بينكما، وهذا يمنح الثقة وقتاً لتظهر بطبيعتها.",
    prompt: "كونا واضحين في الإشارة التالية، حتى لو كانت بسيطة؛ الوضوح هنا أجمل من التخمين.",
  },
  lifestyle: {
    headline: "انسجام قابل للحياة",
    lead: name => `اللافت مع ${name} أن الانسجام لا يبدو محصوراً في أجواء الفعالية؛ يمكن تخيّل راحته في يوم عادي أيضاً.`,
    support: "التفاصيل العملية بينكما تبدو قابلة للتوفيق، لا مجرد لحظة جميلة تحتاج ظروفاً مثالية لتتكرر.",
    prompt: "اسألا بعضكما عن يوم عادي جداً؛ التفاصيل البسيطة ستكشف أين يمكن أن يلتقي عالماكما.",
  },
  values: {
    headline: "ارتياح له جذور",
    lead: name => `الارتياح مع ${name} مرشح أن يكون أعمق من انطباع لطيف؛ المهم عند أحدكما يبدو قابلاً لأن يُفهم عند الآخر.`,
    support: "هذا النوع من التقارب يظهر في المواقف أكثر من الشعارات، ويمنح الحديث وزناً من غير أن يجعله ثقيلاً.",
    prompt: "بدل سؤال مباشر، شاركا موقفاً غيّر رأيكما في شيء مهم؛ الرد سيقول الكثير بهدوء.",
  },
  communication: {
    headline: "وضوح يطمئن",
    lead: name => `مع ${name}، الكلام مرشح أن يصل قريباً مما قُصد؛ مساحة الفهم تبدو أوسع من مساحة سوء التأويل.`,
    support: "وحتى عند اختلاف الزاوية، يمكن للحوار أن يبقى فضولاً متبادلاً لا اختباراً لمن ينتصر.",
    prompt: "اسأل سؤال متابعة واحداً قبل الانتقال للموضوع التالي؛ هنا العمق يأتي من الإصغاء لا من كثرة الأسئلة.",
  },
  intent: {
    headline: "اتجاه واضح من البداية",
    lead: name => `أنت و${name} تبدوان أقرب في اتجاه هذا التعارف؛ وهذا يقلل قراءة الإشارات ويجعل الخطوة التالية أصدق.`,
    support: "عندما تكون النية مفهومة، يستطيع كل منكما أن يكون أخف وأكثر حضوراً بدلاً من مراقبة الانطباع.",
    prompt: "اختموا بسؤال بسيط وصريح: ما الشيء الذي يستحق أن نكمل الحديث عنه بعد الليلة؟",
  },
})

function normalizedScore(value) {
  if (value === null || value === undefined || value === "") return null
  const score = Number(value)
  return Number.isFinite(score) ? Math.round(Math.max(0, Math.min(100, score))) : null
}

function signalForScore(score) {
  if (score >= 85) return "انسجام نادر"
  if (score >= 76) return "إشارة قوية"
  if (score >= 68) return "إشارة واضحة"
  return "قابلية تستحق الاكتشاف"
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
      headline: score >= 80 ? "انسجام يلتقط نفسه" : "مساحة تستحق لقاءً ثانياً",
      body: `بينك وبين ${safeName} قابلية واضحة لأن يتحول الانطباع الأول إلى حوار أعمق. الجميل هنا ليس التشابه الكامل، بل سهولة اكتشاف الطرف الآخر من غير تكلّف.`,
      prompt: "لا تعيدا اللقاء الأول؛ اختارا تفصيلة لم تأخذ وقتها واسألا: ماذا كان وراءها؟",
    }
  }

  const supporting = ranked.find(item => item.key !== strongest)?.key || strongest
  const gentleNudge = ranked.length > 1 ? ranked[ranked.length - 1].key : strongest
  const primaryCopy = COPY[strongest]
  const supportingCopy = COPY[supporting]
  const nudgeCopy = COPY[gentleNudge]
  return {
    signal,
    headline: primaryCopy.headline,
    body: `${primaryCopy.lead(safeName)} ${supportingCopy.support}`,
    prompt: nudgeCopy.prompt,
  }
}
