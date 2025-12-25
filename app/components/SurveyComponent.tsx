import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import { Button } from "../../components/ui/button"
import { Checkbox } from "../../components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Label } from "../../components/ui/label"
import { Textarea } from "../../components/ui/textarea"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Progress } from "../../components/ui/progress"
import { ChevronLeft, ChevronRight, Shield, AlertTriangle, CheckCircle, Loader2, Star, FileText, X, ListPlus } from "lucide-react"
import HobbiesPickerModal from "./HobbiesPickerModal"

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
  // MBTI Questions - Four individual questions to determine personality type
  {
    id: "mbti_1",
    question: "السؤال 5",
    description: "عندما تتم دعوتك إلى مناسبة اجتماعية كبيرة، هل:",
    type: "radio",
    options: [
      { value: "أ", label: "أ. تشعر بالحماس لحضورها والتعرّف على أشخاص جدد، وربما تبقى حتى آخر الحفل" },
      { value: "ب", label: "ب. تشعر بأنك أخذت كفايتك بعد فترة وجيزة وتفكر في المغادرة باكرًا لقضاء بعض الوقت الهادئ" }
    ],
    required: true,
    category: "mbti"
  },
  {
    id: "mbti_2",
    question: "السؤال 6",
    description: "عندما تواجه مشكلة جديدة أو تحديًا غير مألوف، كيف تتعامل معه غالبًا؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. تبحث عن حلول مجرّبة ومستندة إلى خبرات سابقة أو معلومات واضحة لتطبيقها على الموقف الحالي" },
      { value: "ب", label: "ب. تفكر بأسلوب ابتكاري وتتبع حدسك في استكشاف حلول جديدة وغير تقليدية قد تقود إلى نتائج أفضل" }
    ],
    required: true,
    category: "mbti"
  },
  {
    id: "mbti_3",
    question: "السؤال 7",
    description: "عند اتخاذ قرار مصيري يؤثّر على الآخرين، هل تميل إلى:",
    type: "radio",
    options: [
      { value: "أ", label: "أ. إعطاء الأولوية للمنطق والحقائق الموضوعية حتى لو أدى ذلك إلى إزعاج البعض بالحقيقة" },
      { value: "ب", label: "ب. مراعاة مشاعر الأطراف المعنيّة والتأكد من أن القرار لا يسبب ضيقًا لأحد قدر الإمكان" }
    ],
    required: true,
    category: "mbti"
  },
  {
    id: "mbti_4",
    question: "السؤال 8",
    description: "إذا وضعت خطة مسبقًا لشيء ما (مثل رحلة أو مشروع) ثم تغيّرت الظروف بشكل مفاجئ واضطررت لتغيير خطتك، فكيف يكون شعورك؟",
    type: "radio",
    options: [
      { value: "أ", label: "أ. تشعر بالتوتر والانزعاج لأنك تفضل الالتزام بالخطة الأصلية وتجد صعوبة في تقبّل التغيير المفاجئ" },
      { value: "ب", label: "ب. تتأقلم بسهولة وترى في التغيير فرصة لخوض تجربة جديدة، ولا تمانع تعديل خططك حسب المعطيات الحالية" }
    ],
    required: true,
    category: "mbti"
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
    maxLength: 100
  },
  {
    id: "vibe_3",
    question: "السؤال 31",
    description: "لو بتروح حفل موسيقي، مين الفنان اللي تختار؟",
    type: "text",
    placeholder: "مثال: عبد المجيد عبد الله، أم كلثوم، Ed Sheeran، أو أي فنان تفضله...",
    required: true,
    category: "vibe",
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

// Function to convert Arabic numbers to English numbers
const convertArabicToEnglish = (input: string): string => {
  const arabicNumbers = '٠١٢٣٤٥٦٧٨٩'
  const englishNumbers = '0123456789'
  
  return input.replace(/[٠-٩]/g, (match) => {
    const index = arabicNumbers.indexOf(match)
    return englishNumbers[index]
  })
}

// Function to calculate MBTI personality type from four questions
const getMBTIType = (answers: Record<string, string | string[]>): string => {
  // For each question, الخيار (أ) represents the first trait in the pair (E, S, T, or J) 
  // and الخيار (ب) represents the second trait (I, N, F, or P)
  
  const mbti1 = answers['mbti_1'] as string // E vs I (Extroversion vs Introversion)
  const mbti2 = answers['mbti_2'] as string // S vs N (Sensing vs Intuition)
  const mbti3 = answers['mbti_3'] as string // T vs F (Thinking vs Feeling)
  const mbti4 = answers['mbti_4'] as string // J vs P (Judging vs Perceiving)
  
  // Build MBTI type string
  let mbtiType = ''
  
  // Question 1: Social events preference (E vs I)
  mbtiType += (mbti1 === 'أ') ? 'E' : 'I'
  
  // Question 2: Problem solving approach (S vs N)
  mbtiType += (mbti2 === 'أ') ? 'S' : 'N'
  
  // Question 3: Decision making style (T vs F)
  mbtiType += (mbti3 === 'أ') ? 'T' : 'F'
  
  // Question 4: Planning preference (J vs P)
  mbtiType += (mbti4 === 'أ') ? 'J' : 'P'
  
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

  // Count answers for attachment style questions (now questions 9-13)
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

  // Helper to parse hobbies from the text field
  const getHobbiesArray = useCallback((str: string) => {
    if (!str) return [] as string[]
    return String(str)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }, [])

  // Memoize expensive calculations - removed +1 since we no longer have a dedicated terms page
  const totalPages = useMemo(() => Math.ceil(surveyQuestions.length / questionsPerPage), [])
  const progress = useMemo(() => ((currentPage + 1) / totalPages) * 100, [currentPage, totalPages])
  // Determine which page contains the phone number question (to run duplicate check at the right time)
  const phoneQuestionPage = useMemo(() => {
    const idx = surveyQuestions.findIndex(q => q.id === 'phone_number')
    return idx >= 0 ? Math.floor(idx / questionsPerPage) : 0
  }, [])
  
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
    const validationCache = new Map<number, boolean>();

    return (page: number) => {
      if (validationCache.has(page)) {
        return validationCache.get(page)!;
      }

      let isValid = true;
      const startIndex = page * questionsPerPage;
      const endIndex = Math.min(startIndex + questionsPerPage, surveyQuestions.length);

      for (let i = startIndex; i < endIndex; i++) {
        const question = surveyQuestions[i];
        const value = surveyData.answers[question.id];

        if (question.required) {
          if (Array.isArray(value)) {
            if (!value || value.length === 0) {
              isValid = false;
              break;
            }
          } else {
            if (value == null || String(value).trim() === "") {
              isValid = false;
              break;
            }
          }
        }

        // Special validations
        if (question.id === 'phone_number') {
          const phone = String(value || '').replace(/\D/g, '');
          if (phone.length < 10) {
            isValid = false;
            break;
          }
        }

        if (question.id === 'preferred_age_range') {
          const openAge = surveyData.answers['open_age_preference'] === 'true';
          if (!openAge) {
            const minAge = surveyData.answers['preferred_age_min'];
            const maxAge = surveyData.answers['preferred_age_max'];
            if (minAge == null || maxAge == null || String(minAge).trim() === '' || String(maxAge).trim() === '') {
              isValid = false;
              break;
            }
            if (parseInt(String(minAge), 10) > parseInt(String(maxAge), 10)) {
              isValid = false;
              break;
            }
          }
        }
      }

      validationCache.set(page, isValid);
      return isValid;
    };
  }, [surveyData.answers]);

  const nextPage = async () => {
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
    
    // Check 50% minimum requirement for text questions before proceeding (except name and phone)
    const startIndex = currentPage * questionsPerPage
    const endIndex = Math.min(startIndex + questionsPerPage, surveyQuestions.length)
    const incompleteQuestions: string[] = []
    
    for (let i = startIndex; i < endIndex; i++) {
      const question = surveyQuestions[i]
      const value = surveyData.answers[question.id]
      
      // Skip 50% check for name and phone_number
      if (question.required && question.type === "text" && question.maxLength && 
          question.id !== 'name' && question.id !== 'phone_number') {
        const minRequired = Math.ceil(question.maxLength * 0.5)
        const currentLength = (value as string || "").length
        
        if (currentLength < minRequired) {
          const remaining = minRequired - currentLength
          incompleteQuestions.push(`${question.question}: يحتاج ${remaining} حرف إضافي (الحد الأدنى: ${minRequired} حرف من ${question.maxLength})`)
        }
      }
    }
    
    if (incompleteQuestions.length > 0) {
      alert(`⚠️ يرجى إكمال الحد الأدنى المطلوب (50%) للأسئلة التالية:\n\n${incompleteQuestions.join('\n\n')}\n\n💡 نصيحة: الإجابات المفصلة تساعد في إيجاد أفضل توافق لك!`)
      return // Don't proceed to next page
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
      
      // Get MBTI personality type from four questions (5-8)
      const mbtiType = getMBTIType(surveyData.answers)
      
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
      const phoneNumber = surveyData.answers['phone_number'] as string
      
      // Determine actual gender preference based on user's gender and choice
      const actualGenderPreference = determineGenderPreference(surveyData.answers)
      
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
        idealPersonDescription,
        // Store both the raw choice and the determined preference
        answers: {
          ...surveyData.answers,
          // Add the determined preference for backend compatibility
          actual_gender_preference: actualGenderPreference
        }
      }
      
      onSubmit(finalData);
    } else {
      alert("يرجى الموافقة على الشروط والأحكام وسياسة الخصوصية");
    }
  }, [surveyData, onSubmit])

  // Handle submit with provided data (to avoid race condition)
  const handleSubmitWithData = useCallback((dataToSubmit: SurveyData) => {
    // Validate all required questions (including MBTI dropdown and all other questions)
    for (const question of surveyQuestions) {
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
        }
      }
    }
    
    // Terms are already accepted in the provided data, so skip that check
    if (dataToSubmit.termsAccepted && dataToSubmit.dataConsent) {
      
      // Get MBTI personality type from four questions (5-8)
      const mbtiType = getMBTIType(dataToSubmit.answers)
      
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
      const phoneNumber = dataToSubmit.answers['phone_number'] as string
      
      // Determine actual gender preference based on user's gender and choice
      const actualGenderPreference = determineGenderPreference(dataToSubmit.answers)
      
      // Add all personality types and personal info to survey data
      const finalData = {
        ...dataToSubmit,
        name,
        gender,
        phoneNumber,
        mbtiType,
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
      
      onSubmit(finalData);
    } else {
      alert("يرجى الموافقة على الشروط والأحكام وسياسة الخصوصية");
    }
  }, [onSubmit])

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
                    onCheckedChange={(checked: boolean) => 
                      handleCheckboxChange(question.id, option.value, checked)
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
        return (
          <div className="mt-4">
            {/* Open Age toggle */}
            <div className="mb-3 flex items-center justify-end gap-2">
              <label htmlFor="open-age" className="text-sm text-gray-700 dark:text-gray-200">بدون قيود عمرية (مفتوح)</label>
              <Checkbox
                id="open-age"
                checked={!!openAge}
                onCheckedChange={(checked: boolean) => {
                  handleInputChange('open_age_preference', checked ? 'true' : 'false')
                  if (checked) {
                    // Clear min/max if enabling open age
                    handleInputChange('preferred_age_min', '')
                    handleInputChange('preferred_age_max', '')
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-300 block text-right mb-1">من عمر</Label>
                <Input
                  type="text"
                  value={minVal}
                  disabled={!!openAge}
                  onChange={(e) => {
                    const converted = convertArabicToEnglish(e.target.value).replace(/[^0-9]/g, '')
                    handleInputChange('preferred_age_min', converted)
                  }}
                  placeholder="مثلاً 24"
                  className="text-right border-2 border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 rounded-lg px-3 py-2 text-sm"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-300 block text-right mb-1">إلى عمر</Label>
                <Input
                  type="text"
                  value={maxVal}
                  disabled={!!openAge}
                  onChange={(e) => {
                    const converted = convertArabicToEnglish(e.target.value).replace(/[^0-9]/g, '')
                    handleInputChange('preferred_age_max', converted)
                  }}
                  placeholder="مثلاً 32"
                  className="text-right border-2 border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 rounded-lg px-3 py-2 text-sm"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
              </div>
            </div>
            {openAge && (
              <p className="mt-2 text-xs text-green-700 dark:text-green-300 text-right">لن يتم تطبيق أي حدود عمرية عليك أو على شريكك من جهتك — سيتم تجاهل المدى العمري.</p>
            )}
          </div>
        )

      case "number":
        return (
          <div className="mt-4">
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
        const isHobbies = question.id === 'vibe_2'
        
        // Name and phone don't have 50% minimum requirement
        if (isPhoneNumber || isName) {
          return (
            <div className="relative mt-4">
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
        
        // Vibe questions have 50% minimum requirement
        const minRequired = Math.ceil(maxLength * 0.5)
        const isBelowMinimum = currentLength < minRequired
        const remaining = minRequired - currentLength
        
        return (
          <div className="relative mt-4">
            {isHobbies && (
              <div className="flex items-center justify-end mb-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowHobbiesModal(true)}
                  className="inline-flex items-center gap-1"
                >
                  <ListPlus className="w-4 h-4" />
                  <span>اختيار من قائمة الهوايات</span>
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
              className={`min-h-[40px] text-right border-2 rounded-lg px-3 py-1.5 text-sm resize-none ${
                isOverLimit 
                  ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400'
                  : isBelowMinimum
                  ? 'border-yellow-300 dark:border-yellow-600 focus:border-yellow-500 dark:focus:border-yellow-400'
                  : 'border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
              } bg-white dark:bg-slate-700`}
            />
            
            {/* Character counter */}
            <div className="flex justify-between items-center mt-2 text-xs">
              <span className={`font-medium ${
                isOverLimit ? 'text-red-500 dark:text-red-400' : 
                isBelowMinimum ? 'text-yellow-600 dark:text-yellow-400' : 
                'text-green-600 dark:text-green-400'
              }`}>
                {currentLength}/{maxLength} حرف (الحد الأدنى: {minRequired})
              </span>
              {isOverLimit ? (
                <span className="text-red-500 dark:text-red-400 font-medium">
                  تجاوزت الحد المسموح
                </span>
              ) : isBelowMinimum ? (
                <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                  يحتاج {remaining} حرف إضافي
                </span>
              ) : (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  ✓ مكتمل
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
              <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
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
          <div className="space-y-4">
            {currentQuestions.map((question, index) => (
              <div key={question.id} className="group">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-3">
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
            <div className="flex flex-col items-end gap-3">
              {/* Terms and Conditions Link */}
              <div className="text-center w-full">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  بالضغط على "إرسال الاستبيان" فإنك توافق على{' '}
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium transition-colors duration-200"
                  >
                    الشروط والأحكام
                  </button>
                  {' '}وسياسة الخصوصية
                </p>
              </div>
              
              <Button
                onClick={() => {
                  // Validate last page questions before submitting
                  const startIndex = currentPage * questionsPerPage
                  const endIndex = Math.min(startIndex + questionsPerPage, surveyQuestions.length)
                  const incompleteQuestions: string[] = []
                  
                  for (let i = startIndex; i < endIndex; i++) {
                    const question = surveyQuestions[i]
                    const value = surveyData.answers[question.id]
                    
                    if (question.required) {
                      if (Array.isArray(value)) {
                        if (!value || value.length === 0) {
                          incompleteQuestions.push(`${question.question}: مطلوب`)
                        }
                      } else {
                        if (!value || value === "" || value.trim() === "") {
                          incompleteQuestions.push(`${question.question}: مطلوب`)
                        } else if (question.type === "text" && question.maxLength && 
                                   question.id !== 'name' && question.id !== 'phone_number') {
                          const minRequired = Math.ceil(question.maxLength * 0.5)
                          const currentLength = (value as string).length
                          
                          if (currentLength < minRequired) {
                            const remaining = minRequired - currentLength
                            incompleteQuestions.push(`${question.question}: يحتاج ${remaining} حرف إضافي (الحد الأدنى: ${minRequired})`)
                          }
                        }
                      }
                    }
                  }
                  
                  if (incompleteQuestions.length > 0) {
                    alert(`⚠️ يرجى إكمال الأسئلة التالية:\n\n${incompleteQuestions.join('\n\n')}`)
                    return
                  }
                  
                  // Auto-accept terms when submitting and call handleSubmit with updated data
                  const updatedData = { ...surveyData, termsAccepted: true, dataConsent: true };
                  setSurveyData(updatedData);
                  
                  // Call handleSubmit with the updated data directly to avoid race condition
                  handleSubmitWithData(updatedData);
                }}
                disabled={loading}
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
              disabled={!isPageValid(currentPage)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg shadow hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:transform-none text-sm"
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
          onApply={(selected) => {
            const current = getHobbiesArray(String(surveyData.answers['vibe_2'] || ''))
            const merged = Array.from(new Set([...current, ...selected]))
            handleInputChange('vibe_2', merged.join(', '))
            setShowHobbiesModal(false)
          }}
        />

        {/* Terms Modal */}
        {renderTermsModal()}
      </div>
    </div>
  )
})

export default SurveyComponent 