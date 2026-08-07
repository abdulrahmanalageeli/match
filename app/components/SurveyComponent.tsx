import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import { Button } from "../../components/ui/button"
import { Checkbox } from "../../components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Label } from "../../components/ui/label"
import { Textarea } from "../../components/ui/textarea"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { ChevronLeft, ChevronRight, Shield, AlertTriangle, CheckCircle, Loader2, Star, FileText, X, ListPlus, Sparkles, Info } from "lucide-react"
import HobbiesPickerModal from "./HobbiesPickerModal"

interface SurveyData {
  answers: Record<string, string | string[]>
  termsAccepted: boolean
  dataConsent: boolean
  marketingConsent?: boolean
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

export const surveyQuestions = [
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
  // Preferred age range (optional) - inserted as fractional to avoid shifting counts
  {
    id: "preferred_age_range",
    question: "السؤال 2.25",
    description: "وش المدى العمري اللي يناسبك في الطرف الآخر؟",
    type: "age_range",
    required: false,
    category: "personal_info"
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
  // Nationality (required) - Saudi on top, then the rest exactly as provided
  {
    id: "nationality",
    question: "السؤال 3.5",
    description: "جنسيتك؟",
    type: "select",
    placeholder: "اختر جنسيتك",
    options: [
      { value: "السعودية", label: "السعودية" },
      { value: "الإمارات", label: "الإمارات" },
      { value: "الكويت", label: "الكويت" },
      { value: "قطر", label: "قطر" },
      { value: "البحرين", label: "البحرين" },
      { value: "عمان", label: "عمان" },
      { value: "الأردن", label: "الأردن" },
      { value: "لبنان", label: "لبنان" },
      { value: "سوريا", label: "سوريا" },
      { value: "فلسطين", label: "فلسطين" },
      { value: "العراق", label: "العراق" },
      { value: "اليمن", label: "اليمن" },
      { value: "مصر", label: "مصر" },
      { value: "السودان", label: "السودان" },
      { value: "ليبيا", label: "ليبيا" },
      { value: "تونس", label: "تونس" },
      { value: "الجزائر", label: "الجزائر" },
      { value: "المغرب", label: "المغرب" },
      { value: "موريتانيا", label: "موريتانيا" },
      { value: "الصومال", label: "الصومال" },
      { value: "جيبوتي", label: "جيبوتي" },
      { value: "جزر القمر", label: "جزر القمر" },
      { value: "أخرى", label: "أخرى" }
    ],
    required: true,
    category: "personal_info"
  },
  // Nationality preference (optional)
  {
    id: "nationality_preference",
    question: "السؤال 3.75",
    description: "هل يهمك يكون الطرف الآخر من نفس جنسيتك؟",
    type: "radio",
    options: [
      { value: "same", label: "نعم، أفضل شخص من نفس الجنسية." },
      { value: "any", label: "ما يفرق، الأهم التوافق الشخصي." }
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
    id: "gender_preference",
    question: "السؤال 4.5",
    description: "تبي تتعرف على:",
    type: "radio",
    options: [
      { value: "male", label: "ذكر" },
      { value: "female", label: "أنثى" },
      { value: "any", label: "مايفرق (ذكر او أنثى عادي)" }
    ],
    required: true,
    category: "personal_info",
    defaultValue: "any"
  },
  // Humor/Banter Style - Matching Determinant
  {
    id: "humor_banter_style",
    question: "السؤال 4.25",
    description: "في أول 10 دقائق، ما هو الأسلوب الذي يبدو طبيعياً لك؟",
    type: "radio",
    options: [
      { value: "A", label: "خفة دم وضحك" },
      { value: "B", label: "كلام لطيف ومجاملة" },
      { value: "C", label: "هدوء وصدق" },
      { value: "D", label: "المباشرة والجدية" }
    ],
    required: true,
    category: "interaction_style"
  },
  // Early Openness Comfort - Matching Determinant
  {
    id: "early_openness_comfort",
    question: "السؤال 4.75",
    description: "عندما تقابل شخصاً جديداً، ما الذي يبدو مناسباً لك؟",
    type: "radio",
    options: [
      { value: "0", label: "أحتفظ بالأمور الشخصية حتى أتعرف عليهم جيداً" },
      { value: "1", label: "أفضل الحديث السطحي في البداية" },
      { value: "2", label: "أحب المشاركة المتوازنة - مزيج من الخفيف والحقيقي" },
      { value: "3", label: "أنفتح بسرعة وأشارك القصص الشخصية" }
    ],
    required: true,
    category: "interaction_style"
  },
  // Conversation initiative preference. This replaces the retired MBTI block
  // without altering the stable numbering of the older questions below.
  {
    id: "conversation_initiative_preference",
    question: "السؤال 5",
    description: "في الجلسة الفردية، أي توزيع للكلام والمبادرة يريحك أكثر؟",
    type: "radio",
    options: [
      { value: "A", label: "أرتاح مع شخص يفتح المواضيع ويقود الحوار" },
      { value: "B", label: "أفضل أن تكون المبادرة والكلام متبادلين" },
      { value: "C", label: "أرتاح أكثر عندما أكون أنا المبادر" },
      { value: "D", label: "ما يفرق؛ أتأقلم حسب الشخص" }
    ],
    required: true,
    category: "interaction_synergy"
  },
  // Attachment Style Questions 9-13
  {
    id: "attachment_1",
    question: "السؤال 9",
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
    question: "السؤال 10",
    description: "كيف تتصرف عندما يحدث خلاف بينك وبين شخص قريب منك؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أواجهه بهدوء وأحاول التفاهم" },
      { value: "ب", label: "ب. أقلق من مواجهته وأفضل أن أبقى منزعجًا بصمت" },
      { value: "ج", label: "ج. أنسحب وأحاول تجاهل الموقف أو الشخص" },
      { value: "د", label: "د. أقترب جدًا ثم أبتعد فجأة" }
    ],
    required: true,
    category: "attachment"
  },
  {
    id: "attachment_3",
    question: "السؤال 11",
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
    question: "السؤال 12",
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
    question: "السؤال 13",
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
  // Lifestyle Questions 14-18
  {
    id: "lifestyle_1",
    question: "السؤال 14",
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
    question: "السؤال 15",
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
    question: "السؤال 16",
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
    question: "السؤال 17",
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
    question: "السؤال 18",
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
  // Core Values Questions 19-23
  {
    id: "core_values_1",
    question: "السؤال 19",
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
    question: "السؤال 20",
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
    question: "السؤال 21",
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
    question: "السؤال 22",
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
    question: "السؤال 23",
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

  // Communication Style Questions 24-28
  {
    id: "communication_1",
    question: "السؤال 24",
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
    question: "السؤال 25",
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
    question: "السؤال 26",
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
    question: "السؤال 27",
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
    question: "السؤال 28",
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
  // Vibe and Compatibility Questions 29-34
  {
    id: "vibe_1",
    question: "السؤال 29",
    description: "كيف توصف الويكند المثالي بالنسبه لك؟",
    type: "text",
    placeholder: "مثال: أحب النوم كثيراً، أخرج مع الأصدقاء، أشاهد الأفلام في البيت، أقرأ كتاب...",
    required: true,
    category: "vibe",
    minLength: 30,
    maxLength: 150
  },
  {
    id: "vibe_2",
    question: "السؤال 30",
    description: "عدد خمس هوايات تستمتع فيها؟",
    type: "text",
    placeholder: "مثال: القراءة، السفر، الطبخ، الرسم، الرياضة...",
    required: true,
    category: "vibe",
    minLength: 20,
    maxLength: 100
  },
  {
    id: "vibe_3",
    question: "السؤال 31",
    description: "اذكر ثلاثة فنانين أو أنواع موسيقية تفضلها؟",
    type: "text",
    placeholder: "مثال: عبد المجيد عبد الله، أم كلثوم، موسيقى الجاز... (افصل بينها بفواصل)",
    required: true,
    category: "vibe",
    minLength: 25,
    maxLength: 100
  },
  {
    id: "vibe_4",
    question: "السؤال 32",
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
    question: "السؤال 33",
    description: "كيف يوصفونك اصدقائك بالعادة؟",
    type: "text",
    placeholder: "مثال: مضحك، هادئ، مستمع جيد، طموح، مساعد...",
    required: true,
    category: "vibe",
    minLength: 20,
    maxLength: 150
  },
  {
    id: "vibe_6",
    question: "السؤال 34",
    description: "كيف تصف اصدقائك؟",
    type: "text",
    placeholder: "مثال: مخلصين، مضحكين، داعمين، أذكياء، متفهمين...",
    required: true,
    category: "vibe",
    minLength: 20,
    maxLength: 150
  },
  // Interaction Synergy (Q35–Q41)
  {
    id: "conversational_role",
    question: "السؤال 35",
    description: "في أي جلسة أو \"جمعة\"، وش يكون دورك العفوي؟",
    type: "radio",
    options: [
      { value: "A", label: "أ. المبادر: أنا اللي أفتح المواضيع وأحرك الجو." },
      { value: "B", label: "ب. المتفاعل: أشارك بحماس وأرد على اللي ينقال." },
      { value: "C", label: "ج. المستمع: أحب أسمع أكثر من إني أتكلم وأركز في التفاصيل." }
    ],
    required: true,
    category: "interaction_synergy"
  },
  {
    id: "conversation_depth_pref",
    question: "السؤال 36",
    description: "وش نوع السوالف اللي تشدك وتخليك تسترسل؟",
    type: "radio",
    options: [
      { value: "A", label: "أ. العميقة: أحب نحلل \"ليه وكيف\" ونغوص في الفلسفة والأسباب." },
      { value: "B", label: "ب. الواقعية: أحب نتكلم عن \"وش صار ومتى\" وأخبار اليوم والأشياء الملموسة." }
    ],
    required: true,
    category: "interaction_synergy"
  },
  {
    id: "social_battery",
    question: "السؤال 37",
    description: "بعد ساعة من السوالف مع ناس جدد، كيف تحس طاقتك؟",
    type: "radio",
    options: [
      { value: "A", label: "أ. تزيد: أحس إني نشطت وأبي أكمل السهرة." },
      { value: "B", label: "ب. تقل: استمتعت بس أحس \"بطاريتي\" بدت تخلص وأحتاج هدوء." }
    ],
    required: true,
    category: "interaction_synergy"
  },
  {
    id: "humor_subtype",
    question: "السؤال 38",
    description: "وش أكثر شيء يضحكك من قلب؟",
    type: "radio",
    options: [
      { value: "A", label: "أ. الذبّات والسرعة: الذكاء في الرد والسخرية الخفيفة." },
      { value: "B", label: "ب. المواقف العفوية: الأشياء اللي تصير فجأة وبدون تخطيط." },
      { value: "C", label: "ج. القصص والسرد: طريقة حكي السالفة وتفاصيلها المضحكة." }
    ],
    required: true,
    category: "interaction_synergy"
  },
  {
    id: "curiosity_style",
    question: "السؤال 39",
    description: "وش اللي يمتعك أكثر وأنت تتعرف على شخص جديد؟",
    type: "radio",
    options: [
      { value: "A", label: "أ. إنه يسألني أسئلة عميقة عن نفسي وتجاربي." },
      { value: "B", label: "ب. إني أنا اللي أسأله وأكتشف تفاصيل حياته." },
      { value: "C", label: "ج. \"الأخذ والعطاء\" السريع والمزح بدون رسميات." }
    ],
    required: true,
    category: "interaction_synergy"
  },
  // Intent & Goal
  {
    id: "intent_goal",
    question: "السؤال 40",
    description: "وش هدفك الأساسي من حضورك معنا اليوم؟",
    type: "radio",
    options: [
      { value: "A", label: "أ. ودي أوسع دائرة معارفي وأكون صداقات جديدة ورهيبة." },
      { value: "B", label: "ب. أبحث عن شيء أعمق: شخص يفهمني فكرياً ونكون على \"نفس الموجة\" تماماً." },
      { value: "C", label: "ج. جاي أجرب تجربة اجتماعية جديدة وأغير جو." }
    ],
    required: true,
    category: "intent_goal"
  },
  {
    id: "silence_comfort",
    question: "السؤال 41",
    description: "لو صار فيه هدوء مفاجئ في الجلسة، وش يكون شعورك؟",
    type: "radio",
    options: [
      { value: "A", label: "أ. قلق: أحس لازم أقول أي شيء عشان أكسر الصمت." },
      { value: "B", label: "ب. راحة: عادي عندي، الهدوء جزء من السالفة ولا يوترني." }
    ],
    required: true,
    category: "interaction_synergy"
  }
]

const questionsPerPage = 5

const hasValidAgeFlexDecision = (answers: Record<string, string | string[]>): boolean => {
  const openAge = answers['open_age_preference'] === 'true' || (answers['open_age_preference'] as any) === true
  if (openAge) return true
  const decision = String(answers['age_flex_one_year'] || '')
  return decision === 'accept' || decision === 'decline'
}

const getMeaningfulTextLength = (value: unknown): number =>
  String(value ?? '').trim().replace(/\s+/g, ' ').length

const getPreferredAgeRangeError = (answers: Record<string, string | string[]>): string | null => {
  const openAge = answers['open_age_preference'] === 'true' || (answers['open_age_preference'] as any) === true
  if (openAge) return null

  const minRaw = String(answers['preferred_age_min'] || '').trim()
  const maxRaw = String(answers['preferred_age_max'] || '').trim()
  if (!minRaw || !maxRaw) return 'أدخل الحد الأدنى والأعلى للعمر، أو اختر بدون قيود عمرية.'

  const minAge = parseInt(minRaw, 10)
  const maxAge = parseInt(maxRaw, 10)
  if (!Number.isFinite(minAge) || !Number.isFinite(maxAge)) return 'أدخل عمرين صحيحين.'
  if (minAge < 18 || maxAge > 99) return 'اختر أعمارًا بين 18 و99 سنة.'
  if (minAge > maxAge) return 'العمر الأدنى يجب أن يكون أصغر من العمر الأعلى.'
  if ((maxAge - minAge) < 3) return 'اجعل المدى العمري 3 سنوات على الأقل.'
  return null
}

// Function to convert Arabic numbers to English numbers
const convertArabicToEnglish = (input: string): string => {
  const arabicNumbers = '٠١٢٣٤٥٦٧٨٩'
  const englishNumbers = '0123456789'
  
  return input.replace(/[٠-٩]/g, (match) => {
    const index = arabicNumbers.indexOf(match)
    return englishNumbers[index]
  })
}

// Normalize various input formats into { cc, local } suitable for E.164 composition
// Handles: +9665xxxxxxxx, 009665xxxxxxxx, 9665xxxxxxxx, 05xxxxxxxx, 5xxxxxxxx, plain digits
const normalizeAndSplitPhone = (rawInput: string, fallbackCC = '966'): { cc: string, local: string } => {
  if (!rawInput) return { cc: fallbackCC, local: '' }
  let s = convertArabicToEnglish(String(rawInput)).trim()
  // Remove spaces, hyphens, parentheses
  s = s.replace(/[\s\-()]/g, '')
  // Strip leading + or 00 international prefix
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('00')) s = s.slice(2)
  // Keep digits only
  s = s.replace(/[^0-9]/g, '')

  let cc = ''
  let local = ''

  // Saudi-specific rules first (primary audience)
  if (s.startsWith('966')) {
    cc = '966'
    local = s.slice(3)
    if (local.startsWith('0')) local = local.slice(1)
  } else if (/^05\d{8}$/.test(s)) {
    // National format with trunk '0'
    cc = '966'
    local = s.slice(1)
  } else if (/^5\d{8}$/.test(s)) {
    // National significant number
    cc = '966'
    local = s
  } else if (s.length >= 11 && !s.startsWith('0')) {
    // Generic international: assume 3-digit CC if unknown
    cc = s.slice(0, 3)
    local = s.slice(3)
    if (local.startsWith('0')) local = local.slice(1)
  } else {
    // Fallback to local with default CC, strip leading zeros
    cc = fallbackCC
    local = s.replace(/^0+/, '')
  }

  // Final sanitation: digits only
  cc = cc.replace(/[^0-9]/g, '').slice(0, 3)
  local = local.replace(/[^0-9]/g, '')
  return { cc, local }
}

// Function to calculate attachment style
const calculateAttachmentStyle = (answers: Record<string, string | string[]>): string => {
  const counts = {
    أ: 0, // Secure
    ب: 0, // Anxious
    ج: 0, // Avoidant
    د: 0  // Fearful/Disorganized
  }

  // Attachment questions 1-5. Stored answers remain compatible with surveys
  // completed while attachment_2 was temporarily hidden.
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

  // Count answers for communication style questions (now questions 24-28)
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
  
  // Process each lifestyle question (now questions 14-18)
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
  
  // Process each core values question (now questions 19-23)
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

// Function to extract and merge vibe description from all 6 questions (now questions 29-34)
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

// Function to determine actual gender preference based on user's gender and choice
const determineGenderPreference = (answers: Record<string, string | string[]>): string => {
  const userGender = answers['gender'] as string
  const genderChoice = answers['gender_preference'] as string
  
  if (genderChoice === 'any') {
    return 'any_gender'
  } else if (genderChoice === userGender) {
    return 'same_gender'
  } else {
    return 'opposite_gender'
  }
}

const SurveyComponent = memo(function SurveyComponent({ 
  onSubmit, 
  surveyData, 
  setSurveyData,
  setIsEditingSurvey,
  loading = false,
  assignedNumber,
  secureToken
}: { 
  onSubmit: (data: SurveyData) => void
  surveyData: SurveyData
  setSurveyData: React.Dispatch<React.SetStateAction<SurveyData>>
  setIsEditingSurvey?: React.Dispatch<React.SetStateAction<boolean>>
  loading?: boolean
  assignedNumber?: number
  secureToken?: string
}) {
  
  const [currentPage, setCurrentPage] = useState(0)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [showHobbiesModal, setShowHobbiesModal] = useState(false)
  const surveyContainerRef = useRef<HTMLDivElement | null>(null)
  const [showPhoneConfirmModal, setShowPhoneConfirmModal] = useState(false)
  const [phoneConfirmDisplay, setPhoneConfirmDisplay] = useState('')
  const [showResumeBanner, setShowResumeBanner] = useState(false)
  const [validationAttemptedPages, setValidationAttemptedPages] = useState<Set<number>>(() => new Set())
  const surveyProgressKey = 'survey_progress'
  const hasRestoredRef = useRef(false)
  const hasInitializedPhoneRef = useRef(false)

  // Helper to parse hobbies from the text field
  const getHobbiesArray = useCallback((str: string) => {
    if (!str) return [] as string[]
    return String(str)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }, [])

  // Restore survey progress from localStorage on mount
  useEffect(() => {
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true
    try {
      const saved = localStorage.getItem(surveyProgressKey)
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (!parsed.answers || typeof parsed.page !== 'number') return
      const hasExistingAnswers = Object.keys(surveyData.answers).some(
        k => !['gender_preference', 'open_intent_goal_mismatch'].includes(k) && surveyData.answers[k]
      )
      // Database answers are authoritative when an existing participant edits
      // their survey. A stale browser draft must never blank or replace them.
      if (hasExistingAnswers) return
      setSurveyData((prev: SurveyData) => ({
        ...prev,
        answers: { ...prev.answers, ...parsed.answers },
        termsAccepted: parsed.termsAccepted ?? prev.termsAccepted,
        dataConsent: parsed.dataConsent ?? prev.dataConsent,
        marketingConsent: parsed.marketingConsent ?? prev.marketingConsent,
      }))
      if (typeof parsed.page === 'number' && parsed.page > 0) {
        setCurrentPage(parsed.page)
        setShowResumeBanner(true)
        setTimeout(() => setShowResumeBanner(false), 5000)
      }
    } catch {}
  }, [])

  // Auto-save survey progress to localStorage whenever answers or page changes
  useEffect(() => {
    if (!hasRestoredRef.current) return
    try {
      const hasAnswers = Object.keys(surveyData.answers).some(
        k => k !== 'gender_preference' && surveyData.answers[k]
      )
      if (!hasAnswers) return
      localStorage.setItem(surveyProgressKey, JSON.stringify({
        answers: surveyData.answers,
        page: currentPage,
        termsAccepted: surveyData.termsAccepted,
        dataConsent: surveyData.dataConsent,
        marketingConsent: surveyData.marketingConsent === true,
        savedAt: Date.now(),
      }))
    } catch {}
  }, [surveyData.answers, surveyData.termsAccepted, surveyData.dataConsent, currentPage])

  // Clear saved progress on successful submit
  const clearSurveyProgress = useCallback(() => {
    try { localStorage.removeItem(surveyProgressKey) } catch {}
  }, [])

  // Hydrate legacy records that only have a composed phone_number. Run this
  // once per mount; live edits update all phone fields atomically below.
  useEffect(() => {
    if (hasInitializedPhoneRef.current) return
    const composedRaw = String(surveyData.answers['phone_number'] || '')
    if (!composedRaw) return
    const fallbackCC = String(surveyData.answers['phone_cc'] || '966')
    const parsed = normalizeAndSplitPhone(composedRaw, fallbackCC)
    const cc = parsed.cc.slice(0, 3)
    const local = parsed.local.slice(0, Math.max(9, 15 - cc.length))
    const prevCC = String(surveyData.answers['phone_cc'] || '')
    const prevLocal = String(surveyData.answers['phone_local'] || '')
    const newComposed = (cc ? `+${cc}${local}` : local)
    const prevComposed = String(surveyData.answers['phone_number'] || '')
    hasInitializedPhoneRef.current = true
    if (cc !== prevCC || local !== prevLocal || newComposed !== prevComposed) {
      setSurveyData((prev) => ({
        ...prev,
        answers: {
          ...prev.answers,
          phone_cc: cc,
          phone_local: local,
          phone_number: newComposed
        }
      }))
    }
  }, [surveyData.answers['phone_number'], setSurveyData])

  // Default country code to +966 if nothing set yet
  useEffect(() => {
    const hasCC = !!surveyData.answers['phone_cc']
    const hasComposed = !!surveyData.answers['phone_number']
    if (!hasCC && !hasComposed) {
      setSurveyData((prev) => ({
        ...prev,
        answers: {
          ...prev.answers,
          phone_cc: '966'
        }
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Default to accepting a partner with a different participation goal.
  // Preserve any explicit answer when resuming or editing an existing survey.
  useEffect(() => {
    setSurveyData((prev) => {
      const current = prev.answers['open_intent_goal_mismatch']
      if (current !== undefined && current !== null && current !== '') return prev
      return {
        ...prev,
        answers: {
          ...prev.answers,
          open_intent_goal_mismatch: 'true'
        }
      }
    })
  }, [setSurveyData])

  // Build a stable display order without changing IDs/types (DB-safe)
  const orderedQuestions = useMemo(() => {
    const desiredOrder: string[] = [
      // Personal Info
      'name','age','gender','nationality','nationality_preference','phone_number',
      // Preferences
      'gender_preference','preferred_age_range',
      // Conversation initiative (replaces the retired MBTI block)
      'conversation_initiative_preference',
      // Attachment
      'attachment_1','attachment_2','attachment_3','attachment_4','attachment_5',
      // Communication
      'communication_1','communication_2','communication_3','communication_4','communication_5','silence_comfort',
      // Lifestyle
      'lifestyle_1','lifestyle_2','lifestyle_3','lifestyle_4','lifestyle_5',
      // Core Values
      'core_values_1','core_values_2','core_values_3','core_values_4','core_values_5',
      // Vibe
      'vibe_1','vibe_2','vibe_3','vibe_4','vibe_5','vibe_6',
      // Interaction Style
      'humor_banter_style','early_openness_comfort',
      // Interaction Synergy
      'conversational_role','conversation_depth_pref','social_battery','humor_subtype','curiosity_style',
      // Intent
      'intent_goal'
    ]
    const byId = new Map<string, any>()
    surveyQuestions.forEach(q => byId.set(q.id, q))
    return desiredOrder.map(id => byId.get(id)).filter(Boolean)
  }, [])

  // Section titles for prettier grouping
  const getSectionTitle = useCallback((id: string): string | null => {
    const personal = new Set(['name','age','gender','nationality','nationality_preference','phone_number'])
    const prefs = new Set(['gender_preference','preferred_age_range'])
    const attach = new Set(['attachment_1','attachment_2','attachment_3','attachment_4','attachment_5'])
    const comm = new Set(['communication_1','communication_2','communication_3','communication_4','communication_5','silence_comfort'])
    const lifestyle = new Set(['lifestyle_1','lifestyle_2','lifestyle_3','lifestyle_4','lifestyle_5'])
    const core = new Set(['core_values_1','core_values_2','core_values_3','core_values_4','core_values_5'])
    const vibe = new Set(['vibe_1','vibe_2','vibe_3','vibe_4','vibe_5','vibe_6'])
    const interactionStyle = new Set(['humor_banter_style','early_openness_comfort'])
    const interactionSynergy = new Set(['conversation_initiative_preference','conversational_role','conversation_depth_pref','social_battery','humor_subtype','curiosity_style'])
    const intent = new Set(['intent_goal'])

    if (personal.has(id)) return 'نبذة عنك'
    if (prefs.has(id)) return 'تفضيلات عامة'
    if (attach.has(id)) return 'علاقتك بالآخرين'
    if (comm.has(id)) return 'طريقة تواصلك'
    if (lifestyle.has(id)) return 'أسلوب حياتك'
    if (core.has(id)) return 'قيمك الأساسية'
    if (vibe.has(id)) return 'أسئلة مفتوحة'
    if (interactionStyle.has(id) || interactionSynergy.has(id)) return 'طريقتك في التفاعل'
    if (intent.has(id)) return 'هدف المشاركة'
    return null
  }, [])

  // Memoize expensive calculations - pages based on orderedQuestions
  const totalPages = useMemo(() => Math.ceil(orderedQuestions.length / questionsPerPage), [orderedQuestions.length])
  const progress = useMemo(() => ((currentPage + 1) / totalPages) * 100, [currentPage, totalPages])
  // Determine which page contains the phone number question (to run duplicate check at the right time)
  const phoneQuestionPage = useMemo(() => {
    const idx = orderedQuestions.findIndex(q => q.id === 'phone_number')
    return idx >= 0 ? Math.floor(idx / questionsPerPage) : 0
  }, [orderedQuestions])
  
  // Memoize current page questions to avoid re-slicing on every render
  const currentQuestions = useMemo(() => 
    orderedQuestions.slice(currentPage * questionsPerPage, (currentPage + 1) * questionsPerPage),
    [currentPage, orderedQuestions]
  )
  const currentSectionTitle = useMemo(
    () => getSectionTitle(currentQuestions[0]?.id) || 'استبيان التوافق',
    [currentQuestions, getSectionTitle]
  )

  // Smoothly scroll to the top of the survey content when navigating pages (with extra offset)
  useEffect(() => {
    const el = surveyContainerRef.current
    const extraOffset = 160 // px; adjusted to avoid header covering first question
    if (el && typeof window !== 'undefined') {
      const rect = el.getBoundingClientRect()
      const y = Math.max(0, rect.top + window.scrollY - extraOffset)
      window.scrollTo({ top: y, behavior: 'smooth' })
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [currentPage])

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

  const updatePhoneParts = useCallback((countryCode: string, localNumber: string) => {
    const nextCC = convertArabicToEnglish(countryCode).replace(/\D/g, '').slice(0, 3)
    const maxLocalLength = Math.max(9, 15 - nextCC.length)
    const nextLocal = convertArabicToEnglish(localNumber)
      .replace(/\D/g, '')
      .replace(/^0+/, '')
      .slice(0, maxLocalLength)
    const nextComposed = nextCC ? `+${nextCC}${nextLocal}` : nextLocal

    hasInitializedPhoneRef.current = true
    setIsEditingSurvey?.(true)
    setSurveyData((prev: SurveyData) => ({
      ...prev,
      answers: {
        ...prev.answers,
        phone_cc: nextCC,
        phone_local: nextLocal,
        phone_number: nextComposed,
      }
    }))
  }, [setIsEditingSurvey, setSurveyData])

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

  const getQuestionValidationMessage = useCallback((question: any): string | null => {
    const answers = surveyData.answers

    if (question.id === 'preferred_age_range') {
      const rangeError = getPreferredAgeRangeError(answers)
      if (rangeError) return rangeError
      if (!hasValidAgeFlexDecision(answers)) return 'اختر موافقتك على مرونة سنة واحدة.'
      return null
    }

    if (question.id === 'phone_number') {
      const cc = String(answers['phone_cc'] || '').replace(/\D/g, '')
      const local = String(answers['phone_local'] || '').replace(/\D/g, '').replace(/^0+/, '')
      if (cc.length < 1 || cc.length > 3 || local.length < 9 || (cc.length + local.length) > 15) {
        return 'أدخل رقم هاتف صحيحًا لا يتجاوز 15 رقمًا مع رمز الدولة.'
      }
      return null
    }

    const value = answers[question.id]
    if (question.required) {
      if (Array.isArray(value) ? value.length === 0 : value == null || String(value).trim() === '') {
        return 'هذا الحقل مطلوب.'
      }
      if (question.type === 'text' && question.minLength) {
        const minimum = question.minLength
        const currentLength = getMeaningfulTextLength(value)
        if (currentLength < minimum) return `أضف ${minimum - currentLength} حرفًا على الأقل لإكمال الإجابة.`
      }
    }

    return null
  }, [surveyData.answers])

  const navigateToQuestion = useCallback((questionId: string) => {
    const index = orderedQuestions.findIndex((question) => question.id === questionId)
    if (index < 0) return
    const page = Math.floor(index / questionsPerPage)
    setCurrentPage(page)
    window.setTimeout(() => {
      document.getElementById(`survey-question-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
  }, [orderedQuestions])

  const optionLabel = useCallback((questionId: string, rawValue: unknown): string => {
    const value = String(rawValue ?? '')
    if (!value) return 'غير محدد'
    const question = questionMap.get(questionId)
    return question?.options?.find((option: any) => String(option.value) === value)?.label || value
  }, [questionMap])

  const preferenceReviewItems = useMemo(() => {
    const answers = surveyData.answers
    const openAge = answers['open_age_preference'] === 'true' || (answers['open_age_preference'] as any) === true
    const ageRange = openAge
      ? 'بدون قيود عمرية'
      : (answers['preferred_age_min'] && answers['preferred_age_max']
          ? `${answers['preferred_age_min']}–${answers['preferred_age_max']} سنة`
          : 'غير محدد')
    const ageFlex = openAge
      ? 'غير مطبق — العمر مفتوح'
      : answers['age_flex_one_year'] === 'accept'
        ? 'نعم، أقبل ±1 سنة'
        : answers['age_flex_one_year'] === 'decline'
          ? 'لا، التزم بالمدى'
          : 'غير محدد'

    return [
      { label: 'المدى العمري', value: ageRange, questionId: 'preferred_age_range' },
      { label: 'مرونة سنة واحدة', value: ageFlex, questionId: 'preferred_age_range' },
      { label: 'الجنس المفضل', value: optionLabel('gender_preference', answers['gender_preference']), questionId: 'gender_preference' },
      { label: 'تفضيل الجنسية', value: optionLabel('nationality_preference', answers['nationality_preference']), questionId: 'nationality_preference' },
      { label: 'هدف المشاركة', value: optionLabel('intent_goal', answers['intent_goal']), questionId: 'intent_goal' },
    ]
  }, [optionLabel, surveyData.answers])

  const nextPage = async () => {
    setValidationAttemptedPages((previous) => new Set(previous).add(currentPage))
    const firstInvalid = currentQuestions.find((question) => getQuestionValidationMessage(question) !== null)
    if (firstInvalid) {
      window.setTimeout(() => {
        document.getElementById(`survey-question-${firstInvalid.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }

    // TEMP DISABLE: skip phone duplicate check on next page
    const TEMP_DISABLE_PHONE_DUP_CHECK = true
    // Check for phone number duplicates when moving from the page that contains phone number
    if (!TEMP_DISABLE_PHONE_DUP_CHECK && currentPage === phoneQuestionPage) {
      const phoneNumber = surveyData.answers.phone_number
      if (phoneNumber) {
        try {
          const res = await fetch("/api/participant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "check-phone-duplicate",
              phone_number: phoneNumber,
              current_participant_number: assignedNumber, // Exclude current participant from duplicate check
              secure_token: secureToken // For additional validation
            }),
          })
          
          const data = await res.json()
          
          if (!res.ok && data.duplicate) {
            alert(`❌ رقم الهاتف مسجل مسبقاً!\n\nإذا كنت مشاركاً سابقاً، يرجى استخدام زر "لاعب عائد" لتعديل بياناتك.\n\nلا يُسمح بإنشاء أكثر من حساب واحد.`)
            return // Don't proceed to next page
          }
        } catch (error) {
          console.error("Error checking phone duplicate:", error)
          // Continue to next page if API call fails
        }
      }
    }
    
    // Phone confirmation: if we are on the page that includes the phone number, ask user to confirm
    if (currentPage === phoneQuestionPage) {
      const cc = String(surveyData.answers['phone_cc'] || '').replace(/[^0-9]/g, '')
      const local = String(surveyData.answers['phone_local'] || '').replace(/[^0-9]/g, '').replace(/^0+/, '')
      const composed = cc ? `+${cc}${local}` : local
      setPhoneConfirmDisplay(composed || '')
      setShowPhoneConfirmModal(true)
      return
    }
    
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
    for (const question of orderedQuestions) {
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
          if (question.type === "text" && question.minLength && getMeaningfulTextLength(value) < question.minLength) {
            alert(`يرجى إضافة تفاصيل أكثر في السؤال ${question.question} (الحد الأدنى: ${question.minLength} حرف)`);
            return;
          }
        }
      }
    }

    if (!hasValidAgeFlexDecision(surveyData.answers)) {
      alert("يرجى تحديد ما إذا كنت توافق على مرونة سنة واحدة في المدى العمري");
      return;
    }
    
    if (surveyData.termsAccepted && surveyData.dataConsent) {
      
      // Calculate attachment style (questions 9-13)
      const attachmentStyle = calculateAttachmentStyle(surveyData.answers)
      
      // Calculate communication style (questions 24-28)
      const communicationStyle = calculateCommunicationStyle(surveyData.answers)
      
      // Calculate lifestyle preferences (questions 14-18)
      const lifestylePreferences = calculateLifestylePreferences(surveyData.answers)
      
      // Calculate core values (questions 19-23)
      const coreValues = calculateCoreValues(surveyData.answers)
      
      // Extract vibe descriptions (questions 29-34)
      const vibeDescription = extractVibeDescription(surveyData.answers)
      const idealPersonDescription = extractIdealPersonDescription(surveyData.answers)
      
      // Extract personal information
      const name = surveyData.answers['name'] as string
      const gender = surveyData.answers['gender'] as string
      let phoneNumber = surveyData.answers['phone_number'] as string
      if (!phoneNumber) {
        const cc = String(surveyData.answers['phone_cc'] || '').replace(/[^0-9]/g, '')
        const local = String(surveyData.answers['phone_local'] || '').replace(/[^0-9]/g, '').replace(/^0+/, '')
        phoneNumber = cc || local ? `+${cc}${local}` : ''
      }
      
      // Determine actual gender preference based on user's gender and choice
      const actualGenderPreference = determineGenderPreference(surveyData.answers)
      
      // Add all personality types and personal info to survey data
      const finalData = {
        ...surveyData,
        name,
        gender,
        phoneNumber,
        attachmentStyle,
        communicationStyle,
        lifestylePreferences,
        coreValues,
        vibeDescription,
        idealPersonDescription,
        // Store both the raw choice and the determined preference
        answers: {
          ...surveyData.answers,
          // Add the determined preference for backend compatibility
          actual_gender_preference: actualGenderPreference
        }
      }
      
      clearSurveyProgress();
      onSubmit(finalData);
    } else {
      alert("يرجى الموافقة على الشروط والأحكام وسياسة الخصوصية");
    }
  }, [surveyData, onSubmit, clearSurveyProgress])

  // Handle submit with provided data (to avoid race condition)
  const handleSubmitWithData = useCallback((dataToSubmit: SurveyData) => {
    // Validate all required questions (including MBTI dropdown and all other questions)
    for (const question of orderedQuestions) {
      if (question.required) {
        const value = dataToSubmit.answers[question.id];
        
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
          if (question.type === "text" && question.minLength && getMeaningfulTextLength(value) < question.minLength) {
            alert(`يرجى إضافة تفاصيل أكثر في السؤال ${question.question} (الحد الأدنى: ${question.minLength} حرف)`);
            return;
          }
        }
      }
    }

    if (!hasValidAgeFlexDecision(dataToSubmit.answers)) {
      alert("يرجى تحديد ما إذا كنت توافق على مرونة سنة واحدة في المدى العمري");
      return;
    }
    
    // Terms are already accepted in the provided data, so skip that check
    if (dataToSubmit.termsAccepted && dataToSubmit.dataConsent) {
      
      // Calculate attachment style (questions 9-13)
      const attachmentStyle = calculateAttachmentStyle(dataToSubmit.answers)
      
      // Calculate communication style (questions 24-28)
      const communicationStyle = calculateCommunicationStyle(dataToSubmit.answers)
      
      // Calculate lifestyle preferences (questions 14-18)
      const lifestylePreferences = calculateLifestylePreferences(dataToSubmit.answers)
      
      // Calculate core values (questions 19-23)
      const coreValues = calculateCoreValues(dataToSubmit.answers)
      
      // Extract vibe descriptions (questions 29-34)
      const vibeDescription = extractVibeDescription(dataToSubmit.answers)
      const idealPersonDescription = extractIdealPersonDescription(dataToSubmit.answers)
      
      // Extract personal information
      const name = dataToSubmit.answers['name'] as string
      const gender = dataToSubmit.answers['gender'] as string
      let phoneNumber = dataToSubmit.answers['phone_number'] as string
      if (!phoneNumber) {
        const cc = String(dataToSubmit.answers['phone_cc'] || '').replace(/[^0-9]/g, '')
        const local = String(dataToSubmit.answers['phone_local'] || '').replace(/[^0-9]/g, '').replace(/^0+/, '')
        phoneNumber = cc || local ? `+${cc}${local}` : ''
      }
      
      // Determine actual gender preference based on user's gender and choice
      const actualGenderPreference = determineGenderPreference(dataToSubmit.answers)
      
      // Add all personality types and personal info to survey data
      const finalData = {
        ...dataToSubmit,
        name,
        gender,
        phoneNumber,
        attachmentStyle,
        communicationStyle,
        lifestylePreferences,
        coreValues,
        vibeDescription,
        idealPersonDescription,
        // Store both the raw choice and the determined preference
        answers: {
          ...dataToSubmit.answers,
          // Add the determined preference for backend compatibility
          actual_gender_preference: actualGenderPreference
        }
      }
      
      clearSurveyProgress();
      onSubmit(finalData);
    } else {
      alert("يرجى الموافقة على الشروط والأحكام وسياسة الخصوصية");
    }
  }, [onSubmit, clearSurveyProgress])

  const renderQuestion = (question: any) => {
    const value = surveyData.answers[question.id]

    switch (question.type) {
      case "radio":
        return (
          <RadioGroup
            value={value as string || ""}
            onValueChange={(val) => handleInputChange(question.id, val)}
            className="mt-4 space-y-2.5"
            dir="rtl"
          >
            {question.options.map((option: any) => (
              <div
                key={option.value}
                className={`group rounded-xl border p-3.5 transition-colors focus-within:ring-2 focus-within:ring-cyan-500/20 ${
                  (value as string) === option.value
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-950 dark:border-cyan-400/70 dark:bg-cyan-400/10'
                    : 'border-slate-200 bg-white/80 hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-slate-700 dark:bg-slate-900/35 dark:hover:border-cyan-400/40 dark:hover:bg-cyan-400/5'
                }`}
              >
                <div className="flex flex-row-reverse items-center gap-3">
                  <RadioGroupItem
                    value={option.value}
                    id={`${question.id}-${option.value}`}
                    className="h-5 w-5 shrink-0 overflow-hidden rounded-full border-2 border-slate-300 text-cyan-600 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 data-[state=checked]:border-cyan-600 data-[state=checked]:bg-cyan-600 dark:border-slate-600"
                  />
                  <Label
                    htmlFor={`${question.id}-${option.value}`}
                    className="flex-1 cursor-pointer text-right text-sm font-semibold leading-relaxed text-slate-700 transition-colors group-hover:text-slate-950 dark:text-slate-200 dark:group-hover:text-white"
                  >
                    {option.label}
                  </Label>
                </div>
              </div>
            ))}
            {/* Extra preference (optional): Open to different goal */}
            {question.id === 'intent_goal' && (
              <div className="mt-3" role="region" aria-label="تفضيل إضافي مرتبط بهدف المشاركة">
                <div className="rounded-xl border-2 border-dashed transition p-3 bg-amber-50/70 dark:bg-amber-900/10 border-amber-300/70 dark:border-amber-400/40">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                      <Info className="w-4 h-4" />
                      <span className="text-xs font-semibold">تفضيل إضافي</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-800/40 text-amber-900 dark:text-amber-200">اختياري</span>
                  </div>
                  <div className="flex flex-row-reverse items-center gap-3">
                    {(() => {
                      const raw = surveyData.answers['open_intent_goal_mismatch'] as any
                      const checked = raw === true || raw === 'true'
                      return (
                        <Checkbox
                          id={`intent_goal-open_mismatch`}
                          checked={!!checked}
                          onCheckedChange={(c: boolean) => handleInputChange('open_intent_goal_mismatch', c ? 'true' : 'false')}
                          className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-slate-500 text-emerald-600 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none ring-0 overflow-hidden data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 flex-shrink-0"
                        />
                      )
                    })()}
                    <Label
                      htmlFor={`intent_goal-open_mismatch`}
                      className="text-right cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors duration-200 flex-1 leading-relaxed"
                    >
                      ما عندي مشكلة لو كان هدف الطرف الآخر مختلف عن هدفي
                    </Label>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
                    هذا الاختيار لا يغني عن تحديد هدفك بالأعلى — يجب اختيار أحد الخيارات قبل المتابعة.
                  </p>
                </div>
              </div>
            )}
          </RadioGroup>
        )

      case "checkbox":
        return (
          <div className="mt-3 space-y-2.5" dir="rtl">
            {question.options.map((option: any) => (
              <div
                key={option.value}
                className={`group rounded-xl border p-3.5 transition-colors focus-within:ring-2 focus-within:ring-cyan-500/20 ${
                  ((value as string[] || []).includes(option.value))
                    ? 'border-cyan-500 bg-cyan-50 dark:border-cyan-400/70 dark:bg-cyan-400/10'
                    : 'border-slate-200 bg-white/80 hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-slate-700 dark:bg-slate-900/35 dark:hover:border-cyan-400/40 dark:hover:bg-cyan-400/5'
                }`}
              >
                <div className="flex flex-row-reverse items-center gap-3">
                  <Checkbox
                    id={`${question.id}-${option.value}`}
                    checked={(value as string[] || []).includes(option.value)}
                    onCheckedChange={(checked: boolean) =>
                      handleCheckboxChange(question.id, option.value, checked)
                    }
                    className="h-5 w-5 shrink-0 overflow-hidden rounded-md border-2 border-slate-300 text-cyan-600 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 data-[state=checked]:border-cyan-600 data-[state=checked]:bg-cyan-600 dark:border-slate-600"
                  />
                  <Label
                    htmlFor={`${question.id}-${option.value}`}
                    className="flex-1 cursor-pointer text-right text-sm font-semibold leading-relaxed text-slate-700 transition-colors group-hover:text-slate-950 dark:text-slate-200 dark:group-hover:text-white"
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
          <div className="mt-4" dir="rtl">
            <Select
              value={value as string || ""}
              onValueChange={(val) => handleInputChange(question.id, val)}
            >
              <SelectTrigger className="text-right border-2 border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700">
                <SelectValue placeholder={question.placeholder || "اختر"} />
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

      case "age_range":
        // Use two numeric inputs stored under preferred_age_min and preferred_age_max
        const minVal = (surveyData.answers['preferred_age_min'] as string) || ""
        const maxVal = (surveyData.answers['preferred_age_max'] as string) || ""
        const openAge = (surveyData.answers['open_age_preference'] === 'true') || (surveyData.answers['open_age_preference'] === true as any)
        const oneYearFlexDecision = String(surveyData.answers['age_flex_one_year'] || '')
        return (
          <div className="mt-4">
            {/* Open Age toggle - centered pill above inputs */}
            <div className="mb-3 flex justify-center">
              <Button
                type="button"
                onClick={() => {
                  const next = !openAge
                  handleInputChange('open_age_preference', next ? 'true' : 'false')
                  if (next) {
                    handleInputChange('preferred_age_min', '')
                    handleInputChange('preferred_age_max', '')
                    handleInputChange('age_flex_one_year', 'not_applicable')
                  }
                }}
                aria-pressed={!!openAge}
                className={`inline-flex items-center gap-2 rounded-full h-9 px-4 text-xs font-medium transition shadow-sm border whitespace-nowrap
                  ${openAge
                    ? 'bg-linear-to-r from-violet-600 to-indigo-600 text-white border-transparent hover:from-violet-700 hover:to-indigo-700'
                    : 'bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-300/60 dark:border-slate-700/60 hover:bg-white/90 dark:hover:bg-slate-700/60'}`}
              >
                <Sparkles className={`w-4 h-4 ${openAge ? 'text-white' : 'text-violet-500 dark:text-violet-300'}`} />
                <span>{openAge ? 'مفتوح: بدون قيود عمرية' : 'تفعيل: بدون قيود عمرية'}</span>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3" dir="ltr">
              <div className="order-2">
                <Label className="text-xs text-gray-600 dark:text-gray-300 block text-right mb-1">من عمر</Label>
                <Input
                  type="text"
                  value={minVal}
                  disabled={!!openAge}
                  onChange={(e) => {
                    const converted = convertArabicToEnglish(e.target.value).replace(/[^0-9]/g, '').slice(0, 2)
                    handleInputChange('preferred_age_min', converted)
                  }}
                  placeholder="مثلاً 24"
                  className="text-right border-2 border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 rounded-lg px-3 py-2 text-sm"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  dir="ltr"
                />
              </div>
              <div className="order-1">
                <Label className="text-xs text-gray-600 dark:text-gray-300 block text-right mb-1">إلى عمر</Label>
                <Input
                  type="text"
                  value={maxVal}
                  disabled={!!openAge}
                  onChange={(e) => {
                    const converted = convertArabicToEnglish(e.target.value).replace(/[^0-9]/g, '').slice(0, 2)
                    handleInputChange('preferred_age_max', converted)
                  }}
                  placeholder="مثلاً 32"
                  className="text-right border-2 border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 rounded-lg px-3 py-2 text-sm"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  dir="ltr"
                />
              </div>
            </div>
            {!openAge && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600/70 dark:bg-slate-900/35" dir="rtl">
                <div className="mb-2.5 flex items-start justify-between gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
                      هل تقبل مرونة سنة واحدة؟
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      تُستخدم هذه المرونة فقط إذا لم نجد لك تطابقًا مناسبًا ضمن المدى الذي حددته.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
                    مطلوب
                  </span>
                </div>
                <RadioGroup
                  value={oneYearFlexDecision}
                  onValueChange={(answer) => handleInputChange('age_flex_one_year', answer)}
                  className="grid grid-cols-2 gap-2"
                  dir="rtl"
                >
                  {[
                    { value: 'accept', label: 'نعم، سنة إضافية عادي' },
                    { value: 'decline', label: 'لا، التزم بالمدى' }
                  ].map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`age-flex-${option.value}`}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-right text-xs font-semibold leading-snug transition-colors sm:text-sm ${
                        oneYearFlexDecision === option.value
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-950 ring-1 ring-cyan-500/20 dark:border-cyan-400/70 dark:bg-cyan-400/10 dark:text-cyan-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:border-slate-500'
                      }`}
                    >
                      <RadioGroupItem id={`age-flex-${option.value}`} value={option.value} className="shrink-0" />
                      <span>{option.label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            )}
            {openAge && (
              <p className="mt-2 text-xs text-green-700 dark:text-green-300 text-center">لن يتم تطبيق أي حدود عمرية عليك أو على شريكك من جهتك — سيتم تجاهل المدى العمري.</p>
            )}
          </div>
        )

      case "number":
        return (
          <div className="mt-4" dir="rtl">
            <Input
              type="text"
              value={value as string || ""}
              onChange={(e) => {
                // Convert Arabic numbers to English numbers
                const convertedValue = convertArabicToEnglish(e.target.value)
                // Only allow numbers and basic characters
                const numericValue = convertedValue.replace(/[^0-9]/g, '')
                handleInputChange(question.id, numericValue)
              }}
              placeholder={question.placeholder}
              className="text-right border-2 border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 rounded-lg px-3 py-2 text-sm"
              inputMode="numeric"
              pattern="[0-9]*"
              dir="ltr"
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
        const meaningfulLength = getMeaningfulTextLength(value)
        const maxLength = question.maxLength || 1000
        const isOverLimit = currentLength > maxLength
        
        // Use Input for phone number and name, Textarea for longer text
        const isPhoneNumber = question.id === 'phone_number'
        const isName = question.id === 'name'
        const isHobbies = question.id === 'vibe_2'
        
        // Name and phone don't have 50% minimum requirement
        if (isPhoneNumber || isName) {
          if (isPhoneNumber) {
            const ccRaw = String(surveyData.answers['phone_cc'] || '')
            const localRaw = String(surveyData.answers['phone_local'] || '')
            const cc = convertArabicToEnglish(ccRaw).replace(/[^0-9]/g, '').slice(0, 3)
            const localDigits = convertArabicToEnglish(localRaw).replace(/[^0-9]/g, '')
            const local = localDigits.replace(/^0+/, '')
            const maxLocalLength = Math.max(9, 15 - cc.length)
            const composed = cc ? `+${cc} ${local}` : local ? `${local}` : ''
            const ccInvalid = cc.length < 1 || cc.length > 3
            const localInvalid = local.length < 9 || local.length > maxLocalLength
            const showPhoneErrors = validationAttemptedPages.has(currentPage)
            return (
              <div className="mt-4" dir="rtl">
                <div className="grid grid-cols-5 gap-2" dir="ltr">
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-600 dark:text-gray-300 block text-right mb-1">رمز الدولة</Label>
                    <div className="relative" dir="ltr">
                      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm font-bold text-slate-500 dark:text-slate-300">+</span>
                      <Input
                        value={cc}
                        onChange={(e) => updatePhoneParts(e.target.value, local)}
                        placeholder="966"
                        className={`rounded-lg border-2 py-2 pl-7 pr-3 text-left text-sm ${
                          showPhoneErrors && ccInvalid ? 'border-rose-300 dark:border-rose-600 focus:border-rose-500 dark:focus:border-rose-400' : 'border-slate-200 dark:border-slate-700 focus:border-cyan-500 dark:focus:border-cyan-400'
                        } bg-white dark:bg-slate-700`}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={3}
                        autoComplete="tel-country-code"
                      />
                    </div>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs text-gray-600 dark:text-gray-300 block text-right mb-1">الرقم</Label>
                    <Input
                      value={local}
                      onChange={(e) => {
                        const raw = e.target.value
                        const normalizedRaw = convertArabicToEnglish(raw).trim().replace(/[\s\-()]/g, '')
                        const digits = normalizedRaw.replace(/[^0-9]/g, '')
                        const isPastedSaudiNumber = /^(?:\+966|00966|966)/.test(normalizedRaw) && digits.length > 9
                        if (isPastedSaudiNumber) {
                          const { cc: ncc, local: nlocal } = normalizeAndSplitPhone(raw, String(surveyData.answers['phone_cc'] || '966'))
                          updatePhoneParts(ncc, nlocal)
                          return
                        }
                        updatePhoneParts(cc, digits)
                      }}
                      placeholder="5XXXXXXXX"
                      className={`text-right border-2 rounded-lg px-3 py-2 text-sm ${
                        showPhoneErrors && localInvalid ? 'border-rose-300 dark:border-rose-600 focus:border-rose-500 dark:focus:border-rose-400' : 'border-slate-200 dark:border-slate-700 focus:border-cyan-500 dark:focus:border-cyan-400'
                      } bg-white dark:bg-slate-700`}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={20}
                      autoComplete="tel-national"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2 text-xs">
                  <span className="text-gray-600 dark:text-gray-300" dir="ltr">{composed || question.placeholder}</span>
                  <span className={`font-medium ${showPhoneErrors && (ccInvalid || localInvalid) ? 'text-rose-500 dark:text-rose-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {showPhoneErrors && ccInvalid
                      ? 'أدخل رمز دولة صحيحًا (1–3 أرقام).'
                      : showPhoneErrors && localInvalid
                        ? 'أدخل رقمًا محليًا صحيحًا ضمن الحد الدولي.'
                        : `${local.length}/${maxLocalLength} أرقام للرقم المحلي`}
                  </span>
                </div>
              </div>
            )
          }
          // Name input fallback
          return (
            <div className="relative mt-4" dir="rtl">
              <Input
                value={value as string || ""}
                onChange={(e) => {
                  let newValue = e.target.value;
                  if (isPhoneNumber) {
                    newValue = convertArabicToEnglish(newValue);
                  }
                  if (newValue.length <= maxLength) {
                    handleInputChange(question.id, newValue);
                  }
                }}
                placeholder={question.placeholder}
                className={`text-right border-2 rounded-lg px-3 py-2 text-sm ${
                  isOverLimit 
                    ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400'
                    : 'border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
                } bg-white dark:bg-slate-700`}
              />
              <div className="flex justify-between items-center mt-2 text-xs">
                <span className={`font-medium ${isOverLimit ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {currentLength}/{maxLength} حرف
                </span>
                {isOverLimit && (
                  <span className="text-red-500 dark:text-red-400 font-medium">تجاوزت الحد المسموح</span>
                )}
              </div>
            </div>
          )
        }
        
        // Matching-oriented free text uses a purpose-specific minimum. Keep the
        // untouched field neutral, then show progress once the participant types.
        const minRequired = question.minLength || 0
        const isBelowMinimum = minRequired > 0 && meaningfulLength < minRequired
        const showMinimumProgress = meaningfulLength > 0 && isBelowMinimum
        const remaining = Math.max(0, minRequired - meaningfulLength)
        
        return (
          <div className="mt-4">
            {isHobbies && (
              <div className="mb-2 flex justify-center">
                <Button
                  type="button"
                  onClick={() => setShowHobbiesModal(true)}
                  className="inline-flex items-center gap-2 rounded-full h-9 px-4 text-xs font-medium transition shadow-sm border bg-white/80 dark:bg-slate-800/70 border-slate-300/60 dark:border-slate-700/60 hover:bg-white dark:hover:bg-slate-700/60 whitespace-nowrap"
                >
                  <ListPlus className="w-4 h-4 text-violet-500" />
                  <span className="text-slate-700 dark:text-slate-200">اختيار من قائمة الهوايات</span>
                </Button>
              </div>
            )}
            <Textarea
              value={value as string || ""}
              onChange={(e) => {
                const newValue = e.target.value
                if (newValue.length <= maxLength) {
                  handleInputChange(question.id, newValue)
                }
              }}
              placeholder={question.placeholder}
              className={`min-h-[88px] resize-none rounded-xl border px-3.5 py-3 text-right text-sm leading-6 shadow-none transition-colors ${
                isOverLimit 
                  ? 'border-rose-300 dark:border-rose-600 focus:border-rose-500 dark:focus:border-rose-400'
                  : showMinimumProgress
                  ? 'border-amber-300 dark:border-amber-600 focus:border-amber-500 dark:focus:border-amber-400'
                  : 'border-slate-200 focus:border-cyan-500 dark:border-slate-700 dark:focus:border-cyan-400'
              } bg-white/80 placeholder:text-slate-400 dark:bg-slate-900/40 dark:placeholder:text-slate-500`}
            />
            
            {/* Character counter */}
            <div className="flex justify-between items-center mt-2 text-xs">
              <span className={`font-medium ${
                isOverLimit ? 'text-red-500 dark:text-red-400' : 
                isBelowMinimum
                  ? (showMinimumProgress ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400')
                  : 'text-green-600 dark:text-green-400'
              }`}>
                {currentLength}/{maxLength} حرف
              </span>
              {isOverLimit ? (
                <span className="text-red-500 dark:text-red-400 font-medium">
                  تجاوزت الحد المسموح
                </span>
              ) : showMinimumProgress ? (
                <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                  باقي {remaining} حرف فقط
                </span>
              ) : isBelowMinimum ? (
                <span className="text-gray-500 dark:text-gray-400 font-medium">
                  الحد الأدنى: {minRequired} حرف
                </span>
              ) : (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  ممتاز، كذا يكفي ✓
                </span>
              )}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const renderTermsModal = () => (
    <Dialog open={showTermsModal} onOpenChange={setShowTermsModal}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-500" />
              الشروط والأحكام
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTermsModal(false)}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-800 dark:to-slate-700 rounded-2xl p-4 border-2 border-blue-200 dark:border-blue-700 shadow-lg">
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
                <div className="bg-white dark:bg-slate-700 rounded-xl p-3">
                  <p className="text-gray-700 dark:text-gray-200 text-xs">
                    <strong className="text-blue-600 dark:text-blue-400">1. جمع البيانات:</strong> نقوم بجمع بياناتك الشخصية لغرض التوافق والمطابقة فقط.
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-700 rounded-xl p-3">
                  <p className="text-gray-700 dark:text-gray-200 text-xs">
                    <strong className="text-blue-600 dark:text-blue-400">2. استخدام البيانات:</strong> تستخدم البيانات حصرياً لتحليل التوافق وتقديم خدمات المطابقة.
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-700 rounded-xl p-3">
                  <p className="text-gray-700 dark:text-gray-200 text-xs">
                    <strong className="text-blue-600 dark:text-blue-400">3. حماية البيانات:</strong> نلتزم بمعايير حماية البيانات السعودية (PDPL) ونحافظ على سرية معلوماتك.
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-700 rounded-xl p-3">
                  <p className="text-gray-700 dark:text-gray-200 text-xs">
                    <strong className="text-blue-600 dark:text-blue-400">4. الذكاء الاصطناعي:</strong> نستخدم تقنيات الذكاء الاصطناعي المطابقة للوائح السعودية.
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-700 rounded-xl p-3">
                  <p className="text-gray-700 dark:text-gray-200 text-xs">
                    <strong className="text-blue-600 dark:text-blue-400">5. حقوقك:</strong> يمكنك طلب حذف بياناتك أو تعديلها في أي وقت.
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-700 rounded-xl p-3">
                  <p className="text-gray-700 dark:text-gray-200 text-xs">
                    <strong className="text-blue-600 dark:text-blue-400">6. الأمان:</strong> نستخدم تقنيات تشفير متقدمة لحماية بياناتك.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="bg-white/0">
      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-slate-700 max-w-sm mx-4">
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
      <div className="mx-auto max-w-3xl px-2 py-3 sm:px-4 sm:py-5" dir="rtl">
        {/* Header with Progress */}
        <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/55 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 text-right">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="inline-flex rounded-full bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300">
                  {currentSectionTitle}
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  خطوة {currentPage + 1} من {totalPages}
                </span>
              </div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-xl">
                خذها سؤال بسؤال
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                ما فيه إجابة صح أو خطأ — وإجاباتك تنحفظ تلقائيًا.
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>{Math.round(progress)}٪ مكتمل</span>
              <span>{currentPage === totalPages - 1 ? 'آخر خطوة' : 'كمّل على راحتك'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-linear-to-l from-cyan-400 to-blue-600 transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Disclaimer Section */}
        {currentPage === 0 && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-4 text-right dark:border-cyan-400/15 dark:bg-cyan-400/[0.06]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-300">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">الصراحة تعطيك تطابقًا أفضل</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300 sm:text-sm">
                اختر الإجابة الأقرب لك فعلًا. ما نبحث عن المثالية؛ نبحث عن الشخص المناسب لك.
              </p>
              <div className="mt-3 flex items-start gap-2 border-t border-cyan-200/70 pt-3 dark:border-cyan-400/15">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                <p className="text-xs font-bold leading-5 text-rose-700 dark:text-rose-300">
                  تنبيه: أي معلومات غير صحيحة أو مضللة يتم اكتشافها ستؤدي إلى حظر دائم من المشاركة في جميع الفعاليات.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Resume Banner */}
        {showResumeBanner && (
          <div className="mb-4">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800/50 rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-4 h-4 text-white" />
              </div>
              <p className="text-sm text-green-700 dark:text-green-300 font-medium flex-1">
                تم استئناف الاستبيان من حيث توقفت — صفحة {currentPage + 1} من {totalPages}
              </p>
              <button
                onClick={() => { setCurrentPage(0); setShowResumeBanner(false); }}
                className="text-xs text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 underline font-medium whitespace-nowrap"
              >
                البدء من جديد
              </button>
            </div>
          </div>
        )}

        {/* Vibe Questions Disclaimer */}
        {(() => {
          const currentQuestions = orderedQuestions.slice(currentPage * questionsPerPage, (currentPage + 1) * questionsPerPage);
          const hasVibeQuestions = currentQuestions.some(q => q.category === 'vibe');
          
          if (hasVibeQuestions) {
            return (
              <div className="mb-6">
                <div className="flex items-start gap-3 rounded-2xl border border-violet-200/70 bg-violet-50/70 p-4 text-right dark:border-violet-400/15 dark:bg-violet-400/[0.06]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm dark:bg-slate-900 dark:text-violet-300">
                    <Star className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">هنا نحتاج لمحة حقيقية عنك</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300 sm:text-sm">
                      إجابات قصيرة وواضحة تكفي. اكتب بطريقتك، والأمثلة موجودة فقط لمساعدتك تبدأ.
                    </p>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Survey Content */}
        <div className="space-y-3" ref={surveyContainerRef}>
          <div className="space-y-3">
            {currentQuestions.map((question, index) => (
              <div key={question.id} id={`survey-question-${question.id}`} className="group scroll-mt-28">
                {/* Section header when a new section starts on this page */}
                {(() => {
                  const absoluteIndex = currentPage * questionsPerPage + index
                  const title = getSectionTitle(question.id)
                  const prevTitle = absoluteIndex > 0 ? getSectionTitle(orderedQuestions[absoluteIndex - 1]?.id) : null
                  if (title && title !== prevTitle) {
                    return (
                      <div className="mb-2 mt-5 first:mt-0">
                        <div className="flex items-center gap-3">
                          <h4 className="whitespace-nowrap text-xs font-extrabold text-cyan-700 dark:text-cyan-300">
                            {title}
                          </h4>
                          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
                        </div>
                      </div>
                    )
                  }
                  return null
                })()}
                <div className={`rounded-2xl border bg-white/95 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)] transition-colors dark:bg-slate-950/45 sm:p-5 ${
                  validationAttemptedPages.has(currentPage) && getQuestionValidationMessage(question)
                    ? 'border-rose-400 bg-rose-50/30 ring-2 ring-rose-500/10 dark:border-rose-500/70 dark:bg-rose-500/[0.04]'
                    : 'border-slate-200/90 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'
                }`}>
                  <div className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        سؤال {currentPage * questionsPerPage + index + 1}
                      </span>
                      {!getQuestionValidationMessage(question) && (() => {
                        const rawValue = surveyData.answers[question.id]
                        const hasAnswer = question.id === 'preferred_age_range'
                          ? hasValidAgeFlexDecision(surveyData.answers) && (
                              surveyData.answers['open_age_preference'] === 'true' ||
                              ((surveyData.answers['preferred_age_min'] as string) && (surveyData.answers['preferred_age_max'] as string))
                            )
                          : question.id === 'phone_number'
                            ? Boolean(surveyData.answers['phone_local'])
                            : Array.isArray(rawValue)
                              ? rawValue.length > 0
                              : Boolean(String(rawValue ?? '').trim())
                        return hasAnswer ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="h-3.5 w-3.5" />
                            تمت الإجابة
                          </span>
                        ) : null
                      })()}
                    </div>
                    <div>
                      <h3 className="mb-3 text-right text-[15px] font-bold leading-7 text-slate-900 dark:text-slate-100 sm:text-base">
                        {question.description || question.question}
                      </h3>
                      <div className="space-y-3">
                        {renderQuestion(question)}
                        {validationAttemptedPages.has(currentPage) && getQuestionValidationMessage(question) && (
                          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-right text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                            {getQuestionValidationMessage(question)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Enhanced Navigation */}
        <div className={currentPage === totalPages - 1
          ? "mx-auto mt-8 flex max-w-lg flex-col items-stretch gap-4"
          : "sticky bottom-3 z-20 mt-6 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-2.5 shadow-xl shadow-slate-950/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85"
        }>
          <Button
            onClick={prevPage}
            disabled={currentPage === 0}
            variant="outline"
            className={`flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-none transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 ${
              currentPage === totalPages - 1 ? 'order-2 self-start' : 'shrink-0'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
            <span className="font-medium">السابق</span>
          </Button>

          {currentPage === totalPages - 1 ? (
            <div className="order-1 flex w-full flex-col items-end gap-3">
              <div className="w-full overflow-hidden rounded-2xl border border-cyan-200 bg-white text-right shadow-sm dark:border-cyan-500/30 dark:bg-slate-900/90 dark:shadow-black/20">
                <div className="flex items-center gap-3 border-b border-cyan-100 bg-cyan-50/70 px-4 py-3 dark:border-cyan-500/20 dark:bg-cyan-400/5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm shadow-cyan-600/20">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-950 dark:text-white">راجع تفضيلات المطابقة</h3>
                    <p className="mt-0.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300">تأكد منها قبل الإرسال — يمكنك تعديل أي اختيار مباشرة.</p>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 px-3 dark:divide-slate-800">
                  {preferenceReviewItems.map((item) => {
                    const missing = item.value === 'غير محدد'
                    return (
                      <div key={item.label} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{item.label}</p>
                          <p className={`mt-0.5 truncate text-sm font-semibold ${missing ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
                            {item.value}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigateToQuestion(item.questionId)}
                          className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-cyan-700 transition-colors hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:text-cyan-300 dark:hover:border-cyan-500/50 dark:hover:bg-cyan-400/5"
                        >
                          تعديل
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-right shadow-sm dark:border-slate-700 dark:bg-slate-900/90 dark:shadow-black/20">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-950 dark:text-white">الموافقة والخصوصية</h3>
                    <p className="mt-0.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300">راجع الخيارات التالية قبل إرسال الاستبيان</p>
                  </div>
                </div>

                <div className="space-y-2 p-3">
                  <label className="group flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-950/35 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/5">
                    <Checkbox
                      checked={surveyData.termsAccepted}
                      onCheckedChange={checked => setSurveyData(prev => ({ ...prev, termsAccepted: checked === true }))}
                      aria-label="الموافقة على الشروط والأحكام"
                      className="mt-0.5 h-5 w-5 rounded-md border-2 border-slate-400 bg-white data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:border-slate-500 dark:bg-slate-900"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <a href="/terms" target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-700 underline decoration-blue-300 underline-offset-2 dark:text-blue-300">الشروط والأحكام</a>
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">مطلوب</span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-700 dark:text-slate-200">قرأت الشروط وأوافق عليها صراحةً.</span>
                    </span>
                  </label>

                  <label className="group flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-950/35 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/5">
                    <Checkbox
                      checked={surveyData.dataConsent}
                      onCheckedChange={checked => setSurveyData(prev => ({ ...prev, dataConsent: checked === true }))}
                      aria-label="الموافقة على معالجة البيانات"
                      className="mt-0.5 h-5 w-5 rounded-md border-2 border-slate-400 bg-white data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:border-slate-500 dark:bg-slate-900"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <a href="/privacy" target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-700 underline decoration-blue-300 underline-offset-2 dark:text-blue-300">إشعار الخصوصية</a>
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">مطلوب</span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-700 dark:text-slate-200">أوافق صراحةً على معالجة بياناتي وتحليلها آليًا للتسجيل والتوافق وإدارة الفعالية، بما في ذلك النقل الموضح في الإشعار.</span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/35">
                    <Checkbox
                      checked={surveyData.marketingConsent === true}
                      onCheckedChange={checked => setSurveyData(prev => ({ ...prev, marketingConsent: checked === true }))}
                      aria-label="الموافقة على الرسائل التسويقية"
                      className="mt-0.5 h-5 w-5 rounded-md border-2 border-slate-400 bg-white data-[state=checked]:border-cyan-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:text-white dark:border-slate-500 dark:bg-slate-900"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">تحديثات الفعاليات</span>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">اختياري</span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">أرغب باستلام إعلانات الفعاليات القادمة عبر واتساب، ويمكنني إلغاء الاشتراك في أي وقت.</span>
                    </span>
                  </label>
                </div>

                <button type="button" onClick={() => setShowTermsModal(true)} className="flex w-full items-center justify-between border-t border-slate-200 px-4 py-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 dark:border-slate-700 dark:text-blue-300 dark:hover:bg-blue-500/5">
                  <span>عرض ملخص حماية البيانات</span>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              
              <Button
                onClick={() => {
                  const firstInvalidIndex = orderedQuestions.findIndex((question) => getQuestionValidationMessage(question) !== null)
                  if (firstInvalidIndex >= 0) {
                    const invalidQuestion = orderedQuestions[firstInvalidIndex]
                    const invalidPage = Math.floor(firstInvalidIndex / questionsPerPage)
                    setValidationAttemptedPages((previous) => new Set(previous).add(invalidPage))
                    navigateToQuestion(invalidQuestion.id)
                    return
                  }
                  
                  if (!surveyData.termsAccepted || !surveyData.dataConsent) {
                    alert("يرجى الموافقة بشكل صريح على الشروط وإشعار الخصوصية قبل الإرسال")
                    return
                  }
                  handleSubmitWithData(surveyData);
                }}
                disabled={loading || !surveyData.termsAccepted || !surveyData.dataConsent}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg shadow hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:transform-none text-sm"
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
            </div>
          ) : (
            <Button
              onClick={nextPage}
              disabled={loading}
              className="min-h-11 flex-1 items-center gap-2 rounded-xl bg-cyan-500 px-6 text-sm font-extrabold text-slate-950 shadow-sm shadow-cyan-500/20 transition-colors hover:bg-cyan-400 disabled:opacity-50 sm:flex-none sm:min-w-40"
            >
              <span>التالي</span>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Hobbies Picker Modal */}
        <HobbiesPickerModal
          open={showHobbiesModal}
          onOpenChange={setShowHobbiesModal}
          initialSelected={getHobbiesArray(String(surveyData.answers['vibe_2'] || ''))}
          maxLength={surveyQuestions.find(question => question.id === 'vibe_2')?.maxLength}
          onApply={(selected) => {
            handleInputChange('vibe_2', selected.join(', '))
            setShowHobbiesModal(false)
          }}
        />

        {/* Terms Modal */}
        {renderTermsModal()}

        {/* Phone Confirmation Modal */}
        <Dialog open={showPhoneConfirmModal} onOpenChange={setShowPhoneConfirmModal}>
          <DialogContent
            className="w-[calc(100%-2rem)] max-w-sm gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-700 dark:bg-slate-950 [&>button]:left-4 [&>button]:right-auto [&>button]:top-4"
            dir="rtl"
          >
            <div className="px-6 pb-5 pt-6">
              <DialogHeader className="pl-8 text-right sm:text-right">
                <DialogTitle className="text-xl font-bold text-slate-950 dark:text-white">
                  تأكيد رقم الهاتف
                </DialogTitle>
                <p className="pt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  تأكد من الرقم قبل متابعة الاستبيان
                </p>
              </DialogHeader>

              <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-4 dark:bg-cyan-400/[0.08]">
                <p className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                  هل هذا رقم هاتفك الصحيح؟
                </p>
                <p className="mt-2 text-center text-xl font-bold tracking-wide text-slate-950 dark:text-white" dir="ltr">
                  {phoneConfirmDisplay || '—'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
              <Button
                onClick={() => {
                  setShowPhoneConfirmModal(false)
                  setCurrentPage((p) => Math.min(p + 1, totalPages - 1))
                }}
                className="min-h-11 rounded-xl bg-cyan-500 text-sm font-bold text-slate-950 shadow-none hover:bg-cyan-400"
              >
                <CheckCircle className="h-4 w-4" />
                نعم، صحيح
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowPhoneConfirmModal(false)}
                className="min-h-11 rounded-xl border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                تعديل الرقم
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
})

export default SurveyComponent
