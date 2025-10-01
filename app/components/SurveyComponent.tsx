import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "../../components/ui/button"
import { Checkbox } from "../../components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Label } from "../../components/ui/label"
import { Textarea } from "../../components/ui/textarea"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Progress } from "../../components/ui/progress"
import { ChevronLeft, ChevronRight, Shield, AlertTriangle, CheckCircle, Loader2, Star } from "lucide-react"

interface SurveyData {
  answers: Record<string, string | string[]>
  termsAccepted: boolean
  dataConsent: boolean
  mbtiType?: string
  attachmentStyle?: string
  communicationStyle?: string
  lifestylePreferences?: string
  coreValues?: string
  vibeDescription?: string
  idealPersonDescription?: string
  name?: string
  age?: number
  gender?: string
  phoneNumber?: string
}

const surveyQuestions = [
  // Personal Information Questions
  {
    id: "name",
    question: "السؤال 1",
    description: "ما اسمك؟",
    type: "text",
    placeholder: "أدخل اسمك الكامل",
    required: true,
    category: "personal_info",
    maxLength: 50
  },
  {
    id: "age",
    question: "السؤال 2",
    description: "ما عمرك؟",
    type: "number",
    placeholder: "أدخل عمرك",
    required: true,
    category: "personal_info",
    min: 18,
    max: 65
  },
  {
    id: "gender",
    question: "السؤال 3", 
    description: "ما جنسك؟",
    type: "radio",
    options: [
      { value: "male", label: "ذكر" },
      { value: "female", label: "أنثى" }
    ],
    required: true,
    category: "personal_info"
  },
  {
    id: "phone_number",
    question: "السؤال 4",
    description: "ما رقم هاتفك؟ (لتواصلنا معك)",
    type: "text",
    placeholder: "مثال: +966501234567",
    required: true,
    category: "personal_info",
    maxLength: 20
  },
  {
    id: "same_gender_preference",
    question: "السؤال 4.5",
    description: "هل تفضل التواصل مع أشخاص من نفس الجنس فقط؟",
    type: "checkbox",
    options: [
      { value: "yes", label: "نعم، أفضل التواصل مع أشخاص من نفس الجنس فقط" }
    ],
    required: false,
    category: "personal_info"
  },
  // MBTI Personality Type Dropdown
  {
    id: "mbti_type",
    question: "السؤال 5",
    description: "ما هو نوع شخصيتك حسب اختبار MBTI؟",
    type: "select",
    options: [
      { value: "INTJ", label: "INTJ - المعماري" },
      { value: "INTP", label: "INTP - المنطقي" },
      { value: "ENTJ", label: "ENTJ - القائد" },
      { value: "ENTP", label: "ENTP - المبتكر" },
      { value: "INFJ", label: "INFJ - المستشار" },
      { value: "INFP", label: "INFP - الوسيط" },
      { value: "ENFJ", label: "ENFJ - المعلم" },
      { value: "ENFP", label: "ENFP - المبدع" },
      { value: "ISTJ", label: "ISTJ - المفتش" },
      { value: "ISFJ", label: "ISFJ - المدافع" },
      { value: "ESTJ", label: "ESTJ - المدير" },
      { value: "ESFJ", label: "ESFJ - القنصل" },
      { value: "ISTP", label: "ISTP - الحرفي" },
      { value: "ISFP", label: "ISFP - المغامر" },
      { value: "ESTP", label: "ESTP - المقنع" },
      { value: "ESFP", label: "ESFP - الممثل" }
    ],
    required: true,
    category: "mbti",
    helpText: "إذا كنت لا تعرف نوع شخصيتك، يمكنك اختبار مجاني على موقع 16personalities.com"
  },
  // Attachment Style Questions 5-9
  {
    id: "attachment_1",
    question: "السؤال 5",
    description: "كيف تشعر إذا لم يتواصل معك صديقك المقرّب لعدة أيام؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أتفهم أنه مشغول، ولا أشعر بقلق" },
      { value: "ب", label: "ب. أبدأ بالتفكير أنني فعلت شيئًا خاطئًا" },
      { value: "ج", label: "ج. لا أحب الاعتماد على أحد كثيرًا من الأساس" },
      { value: "د", label: "د. أشعر بالتوتر الشديد وأتردد بين الاقتراب والانسحاب" }
    ],
    required: true,
    category: "attachment"
  },
  {
    id: "attachment_2",
    question: "السؤال 6",
    description: "كيف تتصرف عندما يحدث خلاف بينك وبين شخص قريب منك؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أواجهه بهدوء وأحاول التفاهم" },
      { value: "ب", label: "ب. أقلق من مواجهته وأفضل أن أبقى منزعجًا بصمت" },
      { value: "ج", label: "ج. أنسحب وأحاول تجاهل الموقف أو الشخص" },
      { value: "د", label: "د. أتصرف بشكل متناقض؛ أقترب جدًا ثم أبتعد فجأة" }
    ],
    required: true,
    category: "attachment"
  },
  {
    id: "attachment_3",
    question: "السؤال 7",
    description: "ما شعورك تجاه القرب العاطفي من الآخرين؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أشعر بالراحة، وأعرف كيف أُعبّر عن نفسي" },
      { value: "ب", label: "ب. أحتاج دائمًا إلى طمأنة الطرف الآخر لي" },
      { value: "ج", label: "ج. لا أرتاح كثيرًا في العلاقات القريبة" },
      { value: "د", label: "د. أحب القرب، لكن أخاف أن أُرفض أو أُجرح" }
    ],
    required: true,
    category: "attachment"
  },
  {
    id: "attachment_4",
    question: "السؤال 8",
    description: "عندما تمرّ بوقت صعب، كيف تتعامل مع الأصدقاء؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أشاركهم مشاعري وأثق بدعمهم" },
      { value: "ب", label: "ب. أحتاجهم بشدة وأتضايق إن لم يستجيبوا فورًا" },
      { value: "ج", label: "ج. أفضّل حل مشاكلي لوحدي" },
      { value: "د", label: "د. أحيانًا أطلب الدعم ثم أندم وأغلق على نفسي" }
    ],
    required: true,
    category: "attachment"
  },
  {
    id: "attachment_5",
    question: "السؤال 9",
    description: "ما رأيك في العلاقات المقربة طويلة المدى؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أراها صحّية وأحب وجودها في حياتي" },
      { value: "ب", label: "ب. أراها مهمّة لكنني أخاف فقدانها" },
      { value: "ج", label: "ج. أفضل العلاقات الخفيفة والمرنة" },
      { value: "د", label: "د. أريدها ولكن أرتبك وأتجنّبها إذا شعرت بالضغط" }
    ],
    required: true,
    category: "attachment"
  },
  // Lifestyle Questions 10-14
  {
    id: "lifestyle_1",
    question: "السؤال 10",
    description: "في أي وقت من اليوم تكون عادة في أفضل حالتك؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. في الصباح – أكون نشيطًا ومنتجًا في الساعات الأولى" },
      { value: "ب", label: "ب. بعد الظهر أو المغرب – أبدأ أرتاح وأتفاعل أكثر في هذا الوقت" },
      { value: "ج", label: "ج. في الليل – أفضّل السهر وأكون أكثر تفاعلًا في المساء" }
    ],
    required: true,
    category: "lifestyle"
  },
  {
    id: "lifestyle_2",
    question: "السؤال 11",
    description: "كم تفضل أن تتواصل مع صديقك المقرّب؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أحب التواصل اليومي أو شبه اليومي" },
      { value: "ب", label: "ب. يكفيني التواصل كل يومين أو ثلاثة" },
      { value: "ج", label: "ج. أرتاح إذا كان التواصل متباعد بدون ضغط أو التزام" }
    ],
    required: true,
    category: "lifestyle"
  },
  {
    id: "lifestyle_3",
    question: "السؤال 12",
    description: "كم تهمك المساحة الشخصية في علاقات الصداقة؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أحتاج وقتًا لنفسي كل يوم، حتى مع أقرب الناس" },
      { value: "ب", label: "ب. أحب قضاء وقت طويل مع صديقي لكن أقدّر المساحة أحيانًا" },
      { value: "ج", label: "ج. أرتاح أكثر إذا كنا دائمًا متواصلين أو متشاركين في الأنشطة" }
    ],
    required: true,
    category: "lifestyle"
  },
  {
    id: "lifestyle_4",
    question: "السؤال 13",
    description: "كيف تفضل أن تدير وقتك عادة؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أحب التنظيم والتخطيط المسبق، حتى في اللقاءات مع الأصدقاء" },
      { value: "ب", label: "ب. أُفضل وجود فكرة عامة، لكن أحب التفاعل بعفوية" },
      { value: "ج", label: "ج. لا أحب التخطيط، أترك الأمور تمشي بطبيعتها" }
    ],
    required: true,
    category: "lifestyle"
  },
  {
    id: "lifestyle_5",
    question: "السؤال 14",
    description: "كيف تحب تقضي نهاية الأسبوع غالبًا؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أخرج كثيرًا، أحب النشاطات والجلسات الاجتماعية" },
      { value: "ب", label: "ب. أُفضل الجلسات الهادئة مع شخص أو اثنين" },
      { value: "ج", label: "ج. أُحب البقاء وحدي أو تقليل التواصل خلال نهاية الأسبوع" }
    ],
    required: true,
    category: "lifestyle"
  },
  // Core Values Questions 15-19
  {
    id: "core_values_1",
    question: "السؤال 15",
    description: "الصدق أم الحفاظ على العلاقة؟ صديقك ارتكب خطأ بسيط في العمل وطلب منك ألا تتدخل. فجأة، مديرك يسألك: \"هل كنت تعرف عن هذا؟\"",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أخبره بالحقيقة، حتى لو أحرجت صديقي" },
      { value: "ب", label: "ب. أُغيّر الموضوع دون أن أكذب أو أُفشي شيء" },
      { value: "ج", label: "ج. أُغطي على صديقي، الولاء أهم من الإحراج" }
    ],
    required: true,
    category: "core_values"
  },
  {
    id: "core_values_2",
    question: "السؤال 16",
    description: "الطموح أم الاستقرار؟ صديقك قرر يترك وظيفة مستقرة ويبدأ مشروعًا من الصفر. يسألك عن رأيك بصراحة.",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أشجعه تمامًا. المخاطرة ضرورية لتحقيق النمو" },
      { value: "ب", label: "ب. أتفهم قراره، لكن أنصحه بالتريّث قليلاً" },
      { value: "ج", label: "ج. أرى أن ترك الاستقرار مغامرة غير محسوبة" }
    ],
    required: true,
    category: "core_values"
  },
  {
    id: "core_values_3",
    question: "السؤال 17",
    description: "التقبل أم التشابه؟ بدأت تقترب من شخص تختلف معه في الدين أو القيم الثقافية، لكنه محترم. هل تعتقد أن علاقتكما ستنجح؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. نعم، الاختلاف لا يهم طالما فيه احترام" },
      { value: "ب", label: "ب. ربما تنجح، لكن الاختلافات قد تُرهقني لاحقًا" },
      { value: "ج", label: "ج. لا، أُفضل أشخاصًا يشبهونني في الأمور الأساسية" }
    ],
    required: true,
    category: "core_values"
  },
  {
    id: "core_values_4",
    question: "السؤال 18",
    description: "الاعتماد أم الاستقلال؟ تمر بمرحلة صعبة، وصديقك المقرب لم يتواصل معك كثيرًا، لكنه قال إنه \"يعرف إنك تفضل الخصوصية.\"",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أتفهمه، فعلاً أرتاح لما أحد يتركني لحالي" },
      { value: "ب", label: "ب. أُقدّر المساحة، لكن كنت أتمنى تواصلًا أكثر" },
      { value: "ج", label: "ج. شعرت بالإهمال، الصديق الحقيقي يبقى موجود دائمًا" }
    ],
    required: true,
    category: "core_values"
  },
  {
    id: "core_values_5",
    question: "السؤال 19",
    description: "الواجب الشخصي أم الحرية الفردية؟ صديقك قطع علاقته بشخص آخر لأنه أخطأ، ويطلب منك أن تفعل الشيء نفسه. الشخص الآخر لم يخطئ في حقك مباشرة.",
    type: "radio",
    options: [
      { value: "أ", label: "أ. لا أُقاطع أحدًا لمجرد أن صديقي طلب، كل شخص له حكمه الخاص" },
      { value: "ب", label: "ب. أتفهّم مشاعره، وقد أُقلل تواصلي احترامًا له" },
      { value: "ج", label: "ج. أقف معه وأقطع العلاقة، لأن الولاء أهم" }
    ],
    required: true,
    category: "core_values"
  },

  // Communication Style Questions 20-24
  {
    id: "communication_1",
    question: "السؤال 20",
    description: "إذا شعرت أن صديقك تخطى حدودك بطريقة أزعجتك، كيف تتصرف؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أواجهه بلطف وأوضح له أن ما فعله أزعجني" },
      { value: "ب", label: "ب. لا أقول شيئًا وأحتفظ بالمشاعر داخليًا" },
      { value: "ج", label: "ج. أهاجمه أو أُظهر انزعاجي بشكل مباشر وغاضب" },
      { value: "د", label: "د. أُظهر له انزعاجي بتلميحات أو تصرفات غير مباشرة دون أن أتكلم بصراحة" }
    ],
    required: true,
    category: "communication"
  },
  {
    id: "communication_2",
    question: "السؤال 21",
    description: "عندما تحتاج إلى شيء من شخص مقرّب، كيف تطلبه عادة؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أطلبه بوضوح وبأسلوب محترم" },
      { value: "ب", label: "ب. أُفضّل ألا أطلب وأتمنى أن يلاحظ حاجتي بنفسه" },
      { value: "ج", label: "ج. أطلبه بإلحاح أو بأسلوب فيه ضغط" },
      { value: "د", label: "د. أقول له \"مو مشكلة\" لكن أتضايق لو ما ساعدني" }
    ],
    required: true,
    category: "communication"
  },
  {
    id: "communication_3",
    question: "السؤال 22",
    description: "إذا لم يعجبك رأي في نقاش جماعي، كيف تتصرف؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أعبّر عن اختلافي بهدوء وأوضح وجهة نظري" },
      { value: "ب", label: "ب. أوافق ظاهريًا حتى لو داخليًا غير مقتنع" },
      { value: "ج", label: "ج. أُهاجم الرأي وأقلّل من قيمة المتحدث" },
      { value: "د", label: "د. أظل صامتًا لكن أتكلم عن الشخص لاحقًا أو أُظهر استيائي بشكل غير مباشر" }
    ],
    required: true,
    category: "communication"
  },
  {
    id: "communication_4",
    question: "السؤال 23",
    description: "عندما تشعر بالتوتر أو الغضب، كيف تُعبّر عنه؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أُشارك ما أشعر به بشكل صريح دون إيذاء أحد" },
      { value: "ب", label: "ب. أحتفظ بالمشاعر لنفسي وأتجنب المواجهة" },
      { value: "ج", label: "ج. أرفع صوتي أو أنفجر على الآخرين" },
      { value: "د", label: "د. أُظهر أن كل شيء بخير لكن أُعاقب الآخر بالصمت أو البرود" }
    ],
    required: true,
    category: "communication"
  },
  {
    id: "communication_5",
    question: "السؤال 24",
    description: "كيف تُعبّر عن رأيك عندما لا توافق أحدًا مقرّبًا منك؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أشرح موقفي بصدق مع احترام الطرف الآخر" },
      { value: "ب", label: "ب. أُفضل ألا أقول شيئًا حتى لا أزعله" },
      { value: "ج", label: "ج. أصرّ على رأيي وأُقلل من رأيه" },
      { value: "د", label: "د. أُعبّر بسخرية أو تلميحات بدلًا من الكلام الصريح" }
    ],
    required: true,
    category: "communication"
  },
  // Vibe and Compatibility Questions 25-30
  {
    id: "vibe_1",
    question: "السؤال 25",
    description: "كيف توصف الويكند المثالي بالنسبه لك؟",
    type: "text",
    placeholder: "مثال: أحب النوم كثيراً، أخرج مع الأصدقاء، أشاهد الأفلام في البيت، أقرأ كتاب...",
    required: true,
    category: "vibe",
    maxLength: 150
  },
  {
    id: "vibe_2",
    question: "السؤال 26",
    description: "عدد خمس هوايات تستمتع فيها؟",
    type: "text",
    placeholder: "مثال: القراءة، السفر، الطبخ، الرسم، الرياضة...",
    required: true,
    category: "vibe",
    maxLength: 100
  },
  {
    id: "vibe_3",
    question: "السؤال 27",
    description: "لو بتروح حفل موسيقي، مين الفنان اللي تختار؟",
    type: "text",
    placeholder: "مثال: عبد المجيد عبد الله، أم كلثوم، Ed Sheeran، أو أي فنان تفضله...",
    required: true,
    category: "vibe",
    maxLength: 100
  },
  {
    id: "vibe_4",
    question: "السؤال 28",
    description: "هل تحب السوالف العميقه والفلسفية؟",
    type: "radio",
    options: [
      { value: "نعم", label: "نعم، أحب النقاشات العميقة والفلسفية" },
      { value: "لا", label: "لا، أفضل الحديث الخفيف والبسيط" },
      { value: "أحياناً", label: "أحياناً، حسب المزاج والموقف" }
    ],
    required: true,
    category: "vibe"
  },
  {
    id: "vibe_5",
    question: "السؤال 29",
    description: "كيف يوصفونك اصدقائك بالعادة؟",
    type: "text",
    placeholder: "مثال: مضحك، هادئ، مستمع جيد، طموح، مساعد...",
    required: true,
    category: "vibe",
    maxLength: 150
  },
  {
    id: "vibe_6",
    question: "السؤال 30",
    description: "كيف تصف اصدقائك؟",
    type: "text",
    placeholder: "مثال: مخلصين، مضحكين، داعمين، أذكياء، متفهمين...",
    required: true,
    category: "vibe",
    maxLength: 150
  }
]

const questionsPerPage = 5

// Function to get MBTI personality type from dropdown
const getMBTIType = (answers: Record<string, string | string[]>): string => {
  const mbtiType = answers['mbti_type'] as string
  return mbtiType || ''
}

// Function to calculate attachment style
const calculateAttachmentStyle = (answers: Record<string, string | string[]>): string => {
  const counts = {
    أ: 0, // Secure
    ب: 0, // Anxious
    ج: 0, // Avoidant
    د: 0  // Fearful/Disorganized
  }

  // Count answers for attachment style questions (now questions 5-9)
  for (let i = 1; i <= 5; i++) {
    const questionId = `attachment_${i}`
    const answer = answers[questionId] as string
    
    if (answer && (answer === 'أ' || answer === 'ب' || answer === 'ج' || answer === 'د')) {
      counts[answer]++
    }
  }

  // Find the style with the highest count (minimum 3 for clear classification)
  const maxCount = Math.max(counts.أ, counts.ب, counts.ج, counts.د)
  
  if (maxCount >= 3) {
    if (counts.أ === maxCount) return 'Secure'
    if (counts.ب === maxCount) return 'Anxious'
    if (counts.ج === maxCount) return 'Avoidant'
    if (counts.د === maxCount) return 'Fearful'
  }

  // Handle mixed patterns
  const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const [first, second] = sortedCounts
  
  if (first[1] === second[1] && first[1] >= 2) {
    // Mixed pattern - return combination of top two
    const styleMap = { أ: 'Secure', ب: 'Anxious', ج: 'Avoidant', د: 'Fearful' }
    return `Mixed (${styleMap[first[0] as keyof typeof styleMap]}-${styleMap[second[0] as keyof typeof styleMap]})`
  }

  // Default to the most common answer
  const styleMap = { أ: 'Secure', ب: 'Anxious', ج: 'Avoidant', د: 'Fearful' }
  return styleMap[first[0] as keyof typeof styleMap] || 'Secure'
}

// Function to calculate communication style
const calculateCommunicationStyle = (answers: Record<string, string | string[]>): string => {
  const counts = {
    أ: 0, // Assertive
    ب: 0, // Passive
    ج: 0, // Aggressive
    د: 0  // Passive-Aggressive
  }

  // Count answers for communication style questions (now questions 20-24)
  for (let i = 1; i <= 5; i++) {
    const questionId = `communication_${i}`
    const answer = answers[questionId] as string
    
    if (answer && (answer === 'أ' || answer === 'ب' || answer === 'ج' || answer === 'د')) {
      counts[answer]++
    }
  }

  // Find the style with the highest count (minimum 3 for clear classification)
  const maxCount = Math.max(counts.أ, counts.ب, counts.ج, counts.د)
  
  if (maxCount >= 3) {
    if (counts.أ === maxCount) return 'Assertive'
    if (counts.ب === maxCount) return 'Passive'
    if (counts.ج === maxCount) return 'Aggressive'
    if (counts.د === maxCount) return 'Passive-Aggressive'
  }

  // Handle tied patterns - if two styles are tied with 2+ answers each, pick one randomly
  const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const [first, second] = sortedCounts
  
  if (first[1] === second[1] && first[1] >= 2) {
    // Random selection between tied styles
    const tiedStyles = sortedCounts.filter(([_, count]) => count === first[1])
    const randomIndex = Math.floor(Math.random() * tiedStyles.length)
    const selectedStyle = tiedStyles[randomIndex][0]
    
    const styleMap = { أ: 'Assertive', ب: 'Passive', ج: 'Aggressive', د: 'Passive-Aggressive' }
    return styleMap[selectedStyle as keyof typeof styleMap] || 'Assertive'
  }

  // Default to the most common answer
  const styleMap = { أ: 'Assertive', ب: 'Passive', ج: 'Aggressive', د: 'Passive-Aggressive' }
  return styleMap[first[0] as keyof typeof styleMap] || 'Assertive'
}

// Function to calculate lifestyle preferences
const calculateLifestylePreferences = (answers: Record<string, string | string[]>): string => {
  const preferences = []
  
  // Process each lifestyle question (now questions 10-14)
  for (let i = 1; i <= 5; i++) {
    const questionId = `lifestyle_${i}`
    const answer = answers[questionId] as string
    
    if (answer) {
      preferences.push(answer)
    }
  }
  
  // Return as a string (e.g., "أ,ب,ج,أ,ب")
  return preferences.join(',')
}

// Function to calculate core values
const calculateCoreValues = (answers: Record<string, string | string[]>): string => {
  const values = []
  
  // Process each core values question (now questions 15-19)
  for (let i = 1; i <= 5; i++) {
    const questionId = `core_values_${i}`
    const answer = answers[questionId] as string
    
    if (answer) {
      values.push(answer)
    }
  }
  
  // Return as a string (e.g., "أ,ب,ج,أ,ب")
  return values.join(',')
}

// Function to extract and merge vibe description from all 6 questions (now questions 25-30)
const extractVibeDescription = (answers: Record<string, string | string[]>): string => {
  const weekend = (answers['vibe_1'] as string) || ''
  const hobbies = (answers['vibe_2'] as string) || ''
  const music = (answers['vibe_3'] as string) || ''
  const deepTalk = (answers['vibe_4'] as string) || ''
  const friendsDescribe = (answers['vibe_5'] as string) || ''
  const describeFriends = (answers['vibe_6'] as string) || ''
  
  // Create a structured, token-efficient prompt combining all answers
  const structuredPrompt = [
    weekend ? `Weekend: ${weekend}` : '',
    hobbies ? `Hobbies: ${hobbies}` : '',
    music ? `Music: ${music}` : '',
    deepTalk ? `Deep conversations: ${deepTalk}` : '',
    friendsDescribe ? `Friends describe me as: ${friendsDescribe}` : '',
    describeFriends ? `I describe my friends as: ${describeFriends}` : ''
  ].filter(Boolean).join(' | ')
  
  return structuredPrompt
}

// Function to extract ideal person description (now empty as we merged everything into vibe description)
const extractIdealPersonDescription = (answers: Record<string, string | string[]>): string => {
  return '' // No longer needed as all information is in vibeDescription
}

export default function SurveyComponent({ 
  onSubmit, 
  surveyData, 
  setSurveyData,
  setIsEditingSurvey,
  loading = false
}: { 
  onSubmit: (data: SurveyData) => void
  surveyData: SurveyData
  setSurveyData: React.Dispatch<React.SetStateAction<SurveyData>>
  setIsEditingSurvey?: React.Dispatch<React.SetStateAction<boolean>>
  loading?: boolean
}) {
  
  const [currentPage, setCurrentPage] = useState(0)

  // Memoize expensive calculations
  const totalPages = useMemo(() => Math.ceil(surveyQuestions.length / questionsPerPage) + 1, [])
  const progress = useMemo(() => ((currentPage + 1) / totalPages) * 100, [currentPage, totalPages])
  
  // Memoize current page questions to avoid re-slicing on every render
  const currentQuestions = useMemo(() => 
    surveyQuestions.slice(currentPage * questionsPerPage, (currentPage + 1) * questionsPerPage),
    [currentPage]
  )

  const handleInputChange = useCallback((questionId: string, value: string | string[]) => {
    // Mark that user is actively editing the survey
    setIsEditingSurvey?.(true)
    
    setSurveyData((prevData: SurveyData) => ({
      ...prevData,
      answers: {
        ...prevData.answers,
        [questionId]: value
      }
    }))
  }, [setSurveyData, setIsEditingSurvey])

  // Memoize question lookup for performance
  const questionMap = useMemo(() => {
    const map = new Map()
    surveyQuestions.forEach(q => map.set(q.id, q))
    return map
  }, [])

  const handleCheckboxChange = useCallback((questionId: string, value: string, checked: boolean) => {
    // Mark that user is actively editing the survey
    setIsEditingSurvey?.(true)
    
    setSurveyData((prevData: SurveyData) => {
      const currentValues = (prevData.answers[questionId] as string[]) || []
      if (checked) {
        const question = questionMap.get(questionId)
        if (question && 'maxSelections' in question && typeof question.maxSelections === 'number' && currentValues.length >= question.maxSelections) {
          return prevData // Don't add if max reached
        }
        return {
          ...prevData,
          answers: {
            ...prevData.answers,
            [questionId]: [...currentValues, value]
          }
        }
      } else {
        return {
          ...prevData,
          answers: {
            ...prevData.answers,
            [questionId]: currentValues.filter(v => v !== value)
          }
        }
      }
    })
  }, [setSurveyData, setIsEditingSurvey, questionMap])

  // Memoize page validation to avoid expensive recalculation on every render
  const isPageValid = useMemo(() => {
    const validationCache = new Map<number, boolean>()
    
    return (page: number) => {
      // Check cache first
      if (validationCache.has(page)) {
        return validationCache.get(page)!
      }
      
      let isValid = true
      
      if (page === totalPages - 1) {
        isValid = surveyData.termsAccepted && surveyData.dataConsent
      } else {
        const startIndex = page * questionsPerPage
        const endIndex = Math.min(startIndex + questionsPerPage, surveyQuestions.length)
        
        for (let i = startIndex; i < endIndex; i++) {
          const question = surveyQuestions[i]
          const value = surveyData.answers[question.id]
          
          if (question.required) {
            if (Array.isArray(value)) {
              if (!value || value.length === 0) {
                isValid = false
                break
              }
            } else {
              if (!value || value === "" || value.trim() === "") {
                isValid = false
                break
              }
              
              // Check character limit for text questions
              if (question.type === "text" && question.maxLength && value.length > question.maxLength) {
                isValid = false
                break
              }
            }
          }
        }
      }
      
      // Cache the result
      validationCache.set(page, isValid)
      return isValid
    }
  }, [surveyData.answers, surveyData.termsAccepted, surveyData.dataConsent, totalPages])

  const nextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1)
    }
  }

  const prevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleSubmit = useCallback(() => {
    // Validate all required questions (including MBTI dropdown and all other questions)
    for (const question of surveyQuestions) {
      if (question.required) {
        const value = surveyData.answers[question.id];
        
        if (Array.isArray(value)) {
          if (!value || value.length === 0) {
            alert("يرجى استكمال جميع أسئلة الاستبيان المطلوبة");
            return;
          }
        } else {
          if (!value || value === "" || value.trim() === "") {
            alert("يرجى استكمال جميع أسئلة الاستبيان المطلوبة");
            return;
          }
          
          // Check character limit for text questions
          if (question.type === "text" && question.maxLength && value.length > question.maxLength) {
            alert(`يرجى تقصير النص في السؤال ${question.question} (الحد الأقصى: ${question.maxLength} حرف)`);
            return;
          }
        }
      }
    }
    
    if (surveyData.termsAccepted && surveyData.dataConsent) {
      
      // Get MBTI personality type from dropdown
      const mbtiType = getMBTIType(surveyData.answers)
      
      // Calculate attachment style (questions 2-6)
      const attachmentStyle = calculateAttachmentStyle(surveyData.answers)
      
      // Calculate communication style (questions 17-21)
      const communicationStyle = calculateCommunicationStyle(surveyData.answers)
      
      // Calculate lifestyle preferences (questions 7-11)
      const lifestylePreferences = calculateLifestylePreferences(surveyData.answers)
      
      // Calculate core values (questions 12-16)
      const coreValues = calculateCoreValues(surveyData.answers)
      
      // Extract vibe descriptions (questions 22-27)
      const vibeDescription = extractVibeDescription(surveyData.answers)
      const idealPersonDescription = extractIdealPersonDescription(surveyData.answers)
      
      // Extract personal information
      const name = surveyData.answers['name'] as string
      const gender = surveyData.answers['gender'] as string
      const phoneNumber = surveyData.answers['phone_number'] as string
      
      // Add all personality types and personal info to survey data
      const finalData = {
        ...surveyData,
        name,
        gender,
        phoneNumber,
        mbtiType,
        attachmentStyle,
        communicationStyle,
        lifestylePreferences,
        coreValues,
        vibeDescription,
        idealPersonDescription
      }
      
      onSubmit(finalData);
    } else {
      alert("يرجى الموافقة على الشروط والأحكام وسياسة الخصوصية");
    }
  }, [surveyData, onSubmit])

  const renderQuestion = (question: any) => {
    const value = surveyData.answers[question.id]

    switch (question.type) {
      case "radio":
        return (
          <RadioGroup
            value={value as string || ""}
            onValueChange={(val) => handleInputChange(question.id, val)}
            className="space-y-4 mt-4"
          >
            {question.options.map((option: any) => (
              <div key={option.value} className="group">
                <div className="flex items-start space-x-5 space-x-reverse">
                  <RadioGroupItem 
                    value={option.value} 
                    id={`${question.id}-${option.value}`} 
                    className="w-4 h-4 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20 mt-0.5 flex-shrink-0"
                  />
                  <Label 
                    htmlFor={`${question.id}-${option.value}`} 
                    className="text-right cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1 leading-relaxed"
                  >
                    {option.label}
                  </Label>
                </div>
              </div>
            ))}
          </RadioGroup>
        )

      case "checkbox":
        return (
          <div className="space-y-3 mt-3">
            {question.options.map((option: any) => (
              <div key={option.value} className="group">
                <div className="flex items-start space-x-5 space-x-reverse">
                  <Checkbox
                    id={`${question.id}-${option.value}`}
                    checked={(value as string[] || []).includes(option.value)}
                    onCheckedChange={(checked) => 
                      handleCheckboxChange(question.id, option.value, checked as boolean)
                    }
                    className="w-4 h-4 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20 mt-0.5 flex-shrink-0"
                  />
                  <Label 
                    htmlFor={`${question.id}-${option.value}`} 
                    className="text-right cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1 leading-relaxed"
                  >
                    {option.label}
                  </Label>
                </div>
              </div>
            ))}
            {question.maxSelections && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-3 bg-white/50 dark:bg-slate-700/50 px-3 py-1.5 rounded-lg">
                اختر {question.maxSelections} فقط
              </p>
            )}
          </div>
        )

      case "select":
        return (
          <div className="mt-4">
            <Select
              value={value as string || ""}
              onValueChange={(val) => handleInputChange(question.id, val)}
            >
              <SelectTrigger className="text-right border-2 border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm">
                <SelectValue placeholder="اختر نوع شخصيتك" />
              </SelectTrigger>
              <SelectContent>
                {question.options.map((option: any) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {question.helpText && (
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                <p className="text-xs text-blue-700 dark:text-blue-300 text-right">
                  💡 {question.helpText}
                </p>
                <a 
                  href="https://www.16personalities.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline mt-1 block text-right"
                >
                  اختبار مجاني على 16personalities.com
                </a>
              </div>
            )}
          </div>
        )

      case "number":
        return (
          <div className="mt-4">
            <Input
              type="number"
              value={value as string || ""}
              onChange={(e) => handleInputChange(question.id, e.target.value)}
              placeholder={question.placeholder}
              min={question.min}
              max={question.max}
              className="text-right border-2 border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 rounded-lg px-3 py-2 text-sm"
            />
            {(question.min || question.max) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-2">
                {question.min && question.max ? `من ${question.min} إلى ${question.max}` : 
                 question.min ? `الحد الأدنى: ${question.min}` : 
                 question.max ? `الحد الأقصى: ${question.max}` : ''}
              </p>
            )}
          </div>
        )

      case "text":
        const currentLength = (value as string || "").length
        const maxLength = question.maxLength || 1000
        const isOverLimit = currentLength > maxLength
        
        // Use Input for phone number and name, Textarea for longer text
        const isPhoneNumber = question.id === 'phone_number'
        const isName = question.id === 'name'
        
        if (isPhoneNumber || isName) {
          return (
            <div className="relative mt-4">
              <Input
                value={value as string || ""}
                onChange={(e) => {
                  const newValue = e.target.value
                  if (newValue.length <= maxLength) {
                    handleInputChange(question.id, newValue)
                  }
                }}
                placeholder={question.placeholder}
                className={`text-right border-2 rounded-lg px-3 py-2 text-sm ${
                  isOverLimit 
                    ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400' 
                    : 'border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
                } bg-white dark:bg-slate-700`}
              />
              
              {/* Character counter */}
              <div className="flex justify-between items-center mt-2 text-xs">
                <span className={`font-medium ${isOverLimit ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {currentLength}/{maxLength} حرف
                </span>
                {isOverLimit && (
                  <span className="text-red-500 dark:text-red-400 font-medium">
                    تجاوزت الحد المسموح
                  </span>
                )}
              </div>
            </div>
          )
        }
        
        return (
          <div className="relative mt-4">
            <Textarea
              value={value as string || ""}
              onChange={(e) => {
                const newValue = e.target.value
                if (newValue.length <= maxLength) {
                  handleInputChange(question.id, newValue)
                }
              }}
              placeholder={question.placeholder}
              className={`min-h-[40px] text-right border-2 rounded-lg px-3 py-1.5 text-sm resize-none ${
                isOverLimit 
                  ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400' 
                  : 'border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
              } bg-white dark:bg-slate-700`}
            />
            
            {/* Character counter */}
            <div className="flex justify-between items-center mt-2 text-xs">
              <span className={`font-medium ${isOverLimit ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {currentLength}/{maxLength} حرف
              </span>
              {isOverLimit && (
                <span className="text-red-500 dark:text-red-400 font-medium">
                  تجاوزت الحد المسموح
                </span>
              )}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const renderTermsPage = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="relative inline-block mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full"></div>
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">الشروط والأحكام</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">يرجى قراءة والموافقة على الشروط التالية</p>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-800 dark:to-slate-700 rounded-2xl p-3 border-2 border-blue-200 dark:border-blue-700 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-base font-bold text-blue-800 dark:text-blue-200">
            شروط الخصوصية وحماية البيانات
          </h3>
        </div>
        <div className="space-y-3 text-right">
          <div className="space-y-3 text-sm">
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200 text-xs">
                <strong className="text-blue-600 dark:text-blue-400">1. جمع البيانات:</strong> نقوم بجمع بياناتك الشخصية لغرض التوافق والمطابقة فقط.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200 text-xs">
                <strong className="text-blue-600 dark:text-blue-400">2. استخدام البيانات:</strong> تستخدم البيانات حصرياً لتحليل التوافق وتقديم خدمات المطابقة.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200 text-xs">
                <strong className="text-blue-600 dark:text-blue-400">3. حماية البيانات:</strong> نلتزم بمعايير حماية البيانات السعودية (PDPL) ونحافظ على سرية معلوماتك.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200 text-xs">
                <strong className="text-blue-600 dark:text-blue-400">4. الذكاء الاصطناعي:</strong> نستخدم تقنيات الذكاء الاصطناعي المطابقة للوائح السعودية.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200 text-xs">
                <strong className="text-blue-600 dark:text-blue-400">5. حقوقك:</strong> يمكنك طلب حذف بياناتك أو تعديلها في أي وقت.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200 text-xs">
                <strong className="text-blue-600 dark:text-blue-400">6. الأمان:</strong> نستخدم تقنيات تشفير متقدمة لحماية بياناتك.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="group">
          <div className="flex items-center space-x-4 space-x-reverse bg-white/80 dark:bg-slate-800/80 rounded-xl p-3 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-400 transition-all duration-300">
            <Checkbox
              id="terms"
              checked={surveyData.termsAccepted}
              onCheckedChange={(checked) => {
                setIsEditingSurvey?.(true)
                setSurveyData({ ...surveyData, termsAccepted: checked as boolean })
              }}
              className="w-3.5 h-3.5 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20"
            />
            <Label htmlFor="terms" className="text-right cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1">
              أوافق على الشروط والأحكام
            </Label>
          </div>
        </div>

        <div className="group">
          <div className="flex items-center space-x-4 space-x-reverse bg-white/80 dark:bg-slate-800/80 rounded-xl p-3 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-400 transition-all duration-300">
            <Checkbox
              id="dataConsent"
              checked={surveyData.dataConsent}
              onCheckedChange={(checked) => {
                setIsEditingSurvey?.(true)
                setSurveyData({ ...surveyData, dataConsent: checked as boolean })
              }}
              className="w-3.5 h-3.5 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20"
            />
            <Label htmlFor="dataConsent" className="text-right cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1">
              أوافق على معالجة بياناتي الشخصية وفقاً لسياسة الخصوصية
            </Label>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-2xl border border-gray-200 dark:border-slate-700 max-w-sm mx-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full"></div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">جاري تحليل البيانات</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">يرجى الانتظار بينما نقوم بتحليل إجاباتك وتوليد التوصيات...</p>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-3xl mx-auto p-4">
        {/* Header with Progress */}
        <div className="mb-6">
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
              <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                اكتشف أشخاص متوافقين معك
              </span>
            </div>
          </div>
          
          {/* Enhanced Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">التقدم</span>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{currentPage + 1} من {totalPages}</span>
            </div>
            <div className="relative">
              <div className="h-2 bg-white/50 dark:bg-slate-800/50 rounded-full overflow-hidden backdrop-blur-sm">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out animate-shimmer"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Disclaimer Section */}
        {currentPage === 0 && (
          <div className="mb-6">
            <Card className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-800/50 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-red-800 dark:text-red-200 mb-3">
                      ⚠️ تنبيه مهم - يرجى القراءة بعناية
                    </h3>
                    <div className="space-y-2 text-sm text-red-700 dark:text-red-300">
                      <p className="font-semibold">
                        🎯 <strong>كن صادقاً وموضوعياً في إجاباتك</strong>
                      </p>
                      <p>
                        • نظام التوافق يعتمد على صدق إجاباتك لإيجاد الأشخاص المناسبين لك
                      </p>
                      <p>
                        • الإجابات المضللة أو غير الصادقة تؤثر سلباً على جودة المطابقة
                      </p>
                      <p>
                        • <strong className="text-red-800 dark:text-red-200">المشاركون الذين يقدمون معلومات مضللة قد يتم منعهم من الفعاليات المستقبلية</strong>
                      </p>
                      <p className="mt-3 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
                        💡 <strong>نصيحة:</strong> أجب بصراحة عن شخصيتك الحقيقية واهتماماتك الفعلية للحصول على أفضل النتائج
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Vibe Questions Disclaimer */}
        {(() => {
          const currentQuestions = surveyQuestions.slice(currentPage * questionsPerPage, (currentPage + 1) * questionsPerPage);
          const hasVibeQuestions = currentQuestions.some(q => q.category === 'vibe');
          
          if (hasVibeQuestions) {
            return (
              <div className="mb-6">
                <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-800/50 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
                          <Star className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-purple-800 dark:text-purple-200 mb-3">
                          ⭐ أسئلة الطاقة والشخصية - الأهم في التوافق!
                        </h3>
                        <div className="space-y-2 text-sm text-purple-700 dark:text-purple-300">
                          <p className="font-semibold">
                            🎯 <strong>هذه الأسئلة لها أعلى وزن في نظام التوافق </strong>
                          </p>
                          <p>
                            • املأ الإجابات بأكبر قدر من التفاصيل الممكنة
                          </p>
                          <p>
                            • كلما كانت إجاباتك أكثر تفصيلاً، كانت المطابقة أدق وأفضل
                          </p>
                          <p>
                            • استخدم كامل المساحة المتاحة لكل سؤال لوصف شخصيتك بصدق
                          </p>
                          <p className="mt-3 p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-800">
                            💡 <strong>نصيحة:</strong> هذه الأسئلة تحدد مدى توافق طاقتك وشخصيتك مع الآخرين - لا تتردد في الكتابة بتفصيل!
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          }
          return null;
        })()}

        {/* Survey Content */}
        <div className="space-y-4">
          {currentPage === totalPages - 1 ? (
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-slate-700/50 p-4">
              {renderTermsPage()}
            </div>
          ) : (
            <div className="space-y-4">
                              {currentQuestions.map((question, index) => (
                    <div key={question.id} className="group">
                      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-slate-700/50 p-3">
                      <div className="flex items-start gap-3">
                        <div className="relative">
                          <div className="w-6 h-6 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow">
                            {currentPage * questionsPerPage + index + 1}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3 text-right leading-relaxed">
                            {question.question}
                          </h3>
                          {question.description && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 text-right leading-relaxed">
                              {question.description}
                            </p>
                          )}
                          <div className="space-y-3">
                            {renderQuestion(question)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Enhanced Navigation */}
        <div className="flex justify-between items-center mt-8">
          <Button
            onClick={prevPage}
            disabled={currentPage === 0}
            variant="outline"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-400 transition-all duration-300 hover:shadow-lg disabled:opacity-50 text-sm"
          >
            <ChevronRight className="w-4 h-4" />
            <span className="font-medium">السابق</span>
          </Button>

          {currentPage === totalPages - 1 ? (
            <Button
              onClick={() => {
                handleSubmit()
              }}
              disabled={!surveyData.termsAccepted || !surveyData.dataConsent || loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg shadow hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:transform-none text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري التحليل...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>إرسال الاستبيان</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={nextPage}
              disabled={!isPageValid(currentPage)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg shadow hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:transform-none text-sm"
            >
              <span>التالي</span>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
} 