// ─── AI Welcome Prompt Builder ───────────────────────────────────────────────
// Shared between participant.mjs (on-demand) and admin/index.mjs (batch).
// Key design: deterministic anchor selection + opening move variety +
// behavioral survey fields for advice + few-shot example + gender agreement
// check + returning participant non-repetition.

// Anchor field set — the survey data points we rotate through.
// Each anchor has: key, label (for prompt), extractor function.
const ANCHOR_FIELDS = [
  { key: "hobbies",        label: "الهوايات",         extract: sd => sd?.answers?.vibe_2 || sd?.vibe_2 || "" },
  { key: "weekend",        label: "الويكند المثالي",   extract: sd => sd?.answers?.vibe_1 || sd?.vibe_1 || "" },
  { key: "music",          label: "الموسيقى/الفنان",   extract: sd => sd?.answers?.vibe_3 || sd?.vibe_3 || "" },
  { key: "friends_desc",   label: "وصف الأصدقاء له",   extract: sd => sd?.answers?.vibe_5 || sd?.vibe_5 || "" },
  { key: "deep_talk",      label: "السوالف العميقة",    extract: sd => sd?.answers?.vibe_4 || sd?.vibe_4 || "" },
  { key: "conv_role",      label: "الدور في الجلسة",    extract: sd => sd?.answers?.conversational_role || sd?.conversational_role || "" },
  { key: "social_battery", label: "طاقة اجتماعية",      extract: sd => sd?.answers?.social_battery || sd?.social_battery || "" },
  { key: "humor_type",     label: "نوع الفكاهة",         extract: sd => sd?.answers?.humor_subtype || sd?.humor_subtype || "" },
]

// Opening moves — assigned deterministically by participant number.
const OPENING_MOVES = [
  "ابدأ بملاحظة خفيفة عن هوايته أو اهتمامه",
  "ابدأ بسؤال صغير وودي عن توقعه لليلة",
  "ابدأ بالترحيب المباشر باسمه ثم انطلق للتفاصيل",
  "ابدأ بشي عن أجواء الليلة أو المكان واربطه به",
]

// Human-readable mapping for conversational_role values
const CONV_ROLE_LABELS = {
  A: "المبادر — اللي يفتح المواضيع ويحرك الجو",
  B: "المتفاعل — يشارك بحماس ويرد على اللي ينقال",
  C: "المستمع — يحب يسمع أكثر ويركز في التفاصيل",
}

// Human-readable mapping for social_battery values
const SOCIAL_BATTERY_LABELS = {
  A: "طاقته تزيد مع الناس الجداد — يحس إنه نشطت",
  B: "بطاريته تقل — يستمتع بس يحس إنه يحتاج هدوء بعد فترة",
}

/**
 * Deterministically pick 1-2 anchors for a participant.
 * Uses participant number as seed, round-robins across the field set.
 * @param {number} participantNum - participant assigned_number
 * @param {object} surveyData - parsed survey_data object
 * @param {string[]} excludeAnchors - anchor keys to exclude (from prior events)
 * @returns {{ key: string, label: string, value: string }[]}
 */
function pickAnchors(participantNum, surveyData, excludeAnchors = []) {
  // Filter to anchors that have actual data
  const available = ANCHOR_FIELDS.filter(a => {
    if (excludeAnchors.includes(a.key)) return false
    const val = a.extract(surveyData)
    return val && String(val).trim().length > 0
  })

  if (available.length === 0) {
    // Fall back to all anchors (even empty ones) excluding excluded
    const fallback = ANCHOR_FIELDS.filter(a => !excludeAnchors.includes(a.key))
    if (fallback.length === 0) return []
    // Pick 1 deterministically
    const idx = participantNum % fallback.length
    return [{ ...fallback[idx], value: "" }]
  }

  // Pick 1-2 anchors deterministically: seed on participant number
  // Primary: round-robin by participant number
  const primaryIdx = participantNum % available.length
  const primary = available[primaryIdx]

  // Secondary: offset by half the list length to get variety
  let secondary = null
  if (available.length >= 2) {
    const secondaryIdx = (primaryIdx + Math.floor(available.length / 2)) % available.length
    secondary = available[secondaryIdx]
  }

  const picked = [primary]
  if (secondary) picked.push(secondary)

  return picked.map(a => ({
    key: a.key,
    label: a.label,
    value: a.extract(surveyData),
  }))
}

/**
 * Deterministically assign an opening move.
 * @param {number} participantNum
 * @returns {string}
 */
function pickOpeningMove(participantNum) {
  return OPENING_MOVES[participantNum % OPENING_MOVES.length]
}

/**
 * Build the AI welcome prompt with all improvements.
 * @param {object} params
 * @param {number} params.participantNum - assigned_number
 * @param {string} params.firstName
 * @param {string} params.gender - "male" or "female"
 * @param {string} params.age
 * @param {object} params.surveyData - parsed survey_data
 * @param {string[]} params.priorAnchors - anchor keys used in prior events
 * @param {string[]} params.priorMessages - welcome message texts from prior events
 * @returns {{ prompt: string, anchorsUsed: string[] }}
 */
function buildWelcomePrompt({ participantNum, firstName, gender, age, surveyData, priorAnchors = [], priorMessages = [] }) {
  // Pick anchors, excluding ones used in prior events
  const anchors = pickAnchors(participantNum, surveyData, priorAnchors)
  const anchorKeys = anchors.map(a => a.key)
  const openingMove = pickOpeningMove(participantNum)

  // Build anchor data lines for prompt (only the chosen ones)
  const anchorLines = anchors.map(a => `- ${a.label}: ${a.value || "غير محدد"}`).join("\n")

  // Build behavioral advice line from conversational_role and social_battery
  const convRoleVal = surveyData?.answers?.conversational_role || surveyData?.conversational_role || ""
  const socialBatteryVal = surveyData?.answers?.social_battery || surveyData?.social_battery || ""
  const convRoleLabel = CONV_ROLE_LABELS[convRoleVal] || ""
  const socialBatteryLabel = SOCIAL_BATTERY_LABELS[socialBatteryVal] || ""

  let behavioralLine = ""
  if (convRoleLabel || socialBatteryLabel) {
    const parts = []
    if (convRoleLabel) parts.push(`دوره في الجلسة: ${convRoleLabel}`)
    if (socialBatteryLabel) parts.push(`طاقته الاجتماعية: ${socialBatteryLabel}`)
    behavioralLine = parts.join(" · ")
  }

  // Gender for prompt
  const genderAr = gender === "male" ? "ذكر" : gender === "female" ? "أنثى" : "غير محدد"

  // Returning participant section
  let returningSection = ""
  if (priorMessages.length > 0) {
    const priorTexts = priorMessages.map((msg, i) => `رسالة سابقة ${i + 1}:\n"${msg}"`).join("\n\n")
    returningSection = `

ملاحظة مهمة — ${firstName} شارك في فعالية سابقة ووصلته رسالة ترحيب قبل.
هذي الرسائل اللي وصلته قبل:
${priorTexts}

لا تكرر نفس الفكرة ولا نفس المدخل ولا نفس النصيحة. خلي هذي الرسالة مختلفة تماماً عن السابقة.`
  }

  // Few-shot example
  const fewShot = `

مثال ممتاز (لاحظ اللهجة الطبيعية، التخصيص، وقصر الجمل):
"فهد، بين شغفك بالشطرنج وحبك تصلح الأشياء بيدك، توقعنا إنك بتحلل كل طاولة قبل لا تقرر تجلس عندها — خذ وقتك، ما فيه استعجال. وإذا حسيت إنك ما تعرف حد بالبداية، طبيعي جداً، الكل بنفس الموقف. الليلة فيها نقاشات تستاهل."`

  // Behavioral advice instruction
  const behavioralInstruction = behavioralLine
    ? `6. النصيحة: استخدم بياناته السلوكية تحديداً — ${behavioralLine}. اربطها بنصيحة عملية تفيده الليلة (مثلاً: لو من النوع اللي يفتح السوالف، خلّ مساحة للباقين؛ لو بطاريته تقل، عادي ياخذ نفس). لازم تكون محددة له، مو نصيحة عامة.`
    : `6. النصيحة (اختياري): لو تقدر تربط شخصيته بنصيحة عملية صغيرة تفيده الليلة، أضفها. لازم تكون محددة له، مو نصيحة عامة تصلح لأي شخص.`

  const prompt = `أنت صديق مضيف ودود، تكتب بلهجة رياضية طبيعية. مو شاعر، بس شخص حقيقي يرحب بصديق.

المهمة: رسالة ترحيب قصيرة (60-100 كلمة) لشخص اسمه "${firstName}" انضم لفعالية "التوافق الأعمى" — فعالية تعارف اجتماعي.

الهدف بالترتيب:
1. تحس إنها مكتوبة له شخصياً
2. تحمّسه للفعالية
3. نصيحة صغيرة وحقيقية تفيده بالجلسة

بيانات ${firstName} (لا تذكرها صراحة — استخدمها بشكل غير مباشر):
- الجنس: ${genderAr}
- العمر: ${age || "غير محدد"}
${anchorLines}

تعليمات البناء:
- الافتتاحية: ${openingMove}
- استخدم فقط البيانات المذكورة вышеه — لا تضيف معلومات غير موجودة

القواعد:

1. الاسم: لو مكتوب بحروف إنجليزية، عرّبه (bayan ← بيان، Thamer ← ثامر).

2. الجنس: كل فعل وضمير يطابق ${genderAr} بدون استثناء.

3. البساطة: اكتب كأنك ترسل واتساب لصديق. جمل قصيرة وعادية. بدون استعارات أدبية، بدون حوار مفتعل.

4. التركيز: استخدم عنصر أو اثنين بس من البيانات المذكورة. تجاهل الباقي.

5. ممنوع نهائياً:
   - تورية على اسم الفعالية أو كلمة "أعمى"
   - كلام عن الحب/العاطفة/الزواج
   - عبارات مستهلكة ("أهلاً وسهلاً")
   - ذكر أنك AI أو شرح آلية المطابقة
   - مواعظ عامة ما لها علاقة ببياناته الفعلية
   - تجاوز 100 كلمة
   - أي مقدمة أو علامات اقتباس حول الرسالة — أخرج النص فقط

${behavioralInstruction}

7. الخاتمة: ترحيب دافئ وقصير. بدون سؤال فلسفي أو جملة "إصابة" مصطنعة.
${fewShot}
${returningSection}

فحص أخير قبل ما تطلع الرسالة: اقرأها مرة ثانية وتأكد إن كل فعل وضمير يطابق جنس ${firstName} (${genderAr}). أي خطأ في تطابق الجنس يخرب الإحساس بأنها مكتوبة له شخصياً.`

  return { prompt, anchorsUsed: anchorKeys }
}

module.exports = { buildWelcomePrompt, pickAnchors, pickOpeningMove, ANCHOR_FIELDS }
