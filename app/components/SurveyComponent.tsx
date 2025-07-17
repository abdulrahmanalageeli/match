import React, { useState, useEffect } from "react"
import { Button } from "../../components/ui/button"
import { Checkbox } from "../../components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Label } from "../../components/ui/label"
import { Textarea } from "../../components/ui/textarea"
import { Input } from "../../components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Progress } from "../../components/ui/progress"
import { ChevronLeft, ChevronRight, Shield, AlertTriangle, CheckCircle, Loader2 } from "lucide-react"

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
}

const surveyQuestions = [
  // MBTI Questions 1-12
  {
    id: "mbti_1",
    question: "السؤال 1",
    description: "أحب التفاعل مع الناس وأشعر بالطاقة بعد اللقاءات",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أحب التفاعل مع الناس وأشعر بالطاقة بعد اللقاءات" },
      { value: "ب", label: "ب. أحب الجلوس مع نفسي، وأشعر بالإرهاق بعد التجمعات الطويلة" }
    ],
    required: true,
    category: "EI"
  },
  {
    id: "mbti_2",
    question: "السؤال 2",
    description: "تفضيل نوع اللقاءات",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أرتاح في اللقاءات الجماعية أو المناسبات الكبيرة" },
      { value: "ب", label: "ب. أُفضل الجلسات الهادئة مع شخص أو اثنين" }
    ],
    required: true,
    category: "EI"
  },
  {
    id: "mbti_3",
    question: "السؤال 3",
    description: "الحاجة للوحدة أو التفاعل",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أشعر بالملل إذا بقيت وحيدًا وقتًا طويلًا" },
      { value: "ب", label: "ب. أحتاج وقتًا لوحدي بعد أي تواصل اجتماعي" }
    ],
    required: true,
    category: "EI"
  },
  {
    id: "mbti_4",
    question: "السؤال 4",
    description: "التركيز على الواقع أم المستقبل",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أُركّز على الواقع وما يمكنني ملاحظته أو قياسه" },
      { value: "ب", label: "ب. أُفكر كثيرًا بما قد يحدث في المستقبل" }
    ],
    required: true,
    category: "SN"
  },
  {
    id: "mbti_5",
    question: "السؤال 5",
    description: "الاعتماد على التجربة أم الحدس",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أعتمد على التجربة والخبرة المباشرة" },
      { value: "ب", label: "ب. أثق بحدسي وتصوراتي" }
    ],
    required: true,
    category: "SN"
  },
  {
    id: "mbti_6",
    question: "السؤال 6",
    description: "التفاصيل أم الصورة الكاملة",
    type: "radio",
    options: [
      { value: "أ", label: "أ. ألاحظ التفاصيل الصغيرة التي يغفل عنها الآخرون" },
      { value: "ب", label: "ب. أُفكر في الصورة الكاملة والهدف العام" }
    ],
    required: true,
    category: "SN"
  },
  {
    id: "mbti_7",
    question: "السؤال 7",
    description: "أساس اتخاذ القرارات",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أتخذ قراراتي بناءً على المنطق والتحليل" },
      { value: "ب", label: "ب. أتخذ قراراتي بناءً على ما يشعر به الناس حولي" }
    ],
    required: true,
    category: "TF"
  },
  {
    id: "mbti_8",
    question: "السؤال 8",
    description: "قول الحقيقة أم مراعاة المشاعر",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أُفضل قول الحقيقة حتى لو كانت جارحة" },
      { value: "ب", label: "ب. أُفضل مراعاة مشاعر الآخرين عند الحديث" }
    ],
    required: true,
    category: "TF"
  },
  {
    id: "mbti_9",
    question: "السؤال 9",
    description: "الأولوية للعدالة أم المشاعر",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أضع العدالة والموضوعية فوق أي شيء" },
      { value: "ب", label: "ب. أضع مشاعر الآخرين في الحسبان حتى لو تعارضت مع المنطق" }
    ],
    required: true,
    category: "TF"
  },
  {
    id: "mbti_10",
    question: "السؤال 10",
    description: "التخطيط أم المرونة",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أُحب التخطيط المسبق وأشعر بالراحة عندما يكون كل شيء واضحًا" },
      { value: "ب", label: "ب. أُحب ترك الخيارات مفتوحة وأتكيف مع ما يحدث" }
    ],
    required: true,
    category: "JP"
  },
  {
    id: "mbti_11",
    question: "السؤال 11",
    description: "التعامل مع تغيير الخطط",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أشعر بالقلق إذا تغيرت الخطط فجأة" },
      { value: "ب", label: "ب. لا مشكلة لدي في التغيير المفاجئ، بل أراه ممتعًا أحيانًا" }
    ],
    required: true,
    category: "JP"
  },
  {
    id: "mbti_12",
    question: "السؤال 12",
    description: "إدارة المهام",
    type: "radio",
    options: [
      { value: "أ", label: "أ. أضع لنفسي قائمة مهام وأحاول الالتزام بها" },
      { value: "ب", label: "ب. أترك المهام تمشي مع الوقت دون ضغط" }
    ],
    required: true,
    category: "JP"
  },
  // Attachment Style Questions 13-17
  {
    id: "attachment_1",
    question: "السؤال 13",
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
    question: "السؤال 14",
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
    question: "السؤال 15",
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
    question: "السؤال 16",
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
    question: "السؤال 17",
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
  // Lifestyle Questions 23-27
  {
    id: "lifestyle_1",
    question: "السؤال 23",
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
    question: "السؤال 24",
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
    question: "السؤال 25",
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
    question: "السؤال 26",
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
    question: "السؤال 27",
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
  // Core Values Questions 28-32
  {
    id: "core_values_1",
    question: "السؤال 28",
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
    question: "السؤال 29",
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
    question: "السؤال 30",
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
    question: "السؤال 31",
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
    question: "السؤال 32",
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

  // Communication Style Questions 35-39
  {
    id: "communication_1",
    question: "السؤال 35",
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
    question: "السؤال 36",
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
    question: "السؤال 37",
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
    question: "السؤال 38",
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
    question: "السؤال 39",
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
  // Vibe and Compatibility Questions 40-45 (moved to end)
  {
    id: "vibe_1",
    question: "السؤال 40",
    description: "كيف توصف الويكند المثالي بالنسبه لك؟",
    type: "text",
    placeholder: "مثال: أحب النوم كثيراً، أخرج مع الأصدقاء، أشاهد الأفلام في البيت، أقرأ كتاب...",
    required: true,
    category: "vibe",
    maxLength: 75
  },
  {
    id: "vibe_2",
    question: "السؤال 41",
    description: "عدد خمس هوايات تستمتع فيها؟",
    type: "text",
    placeholder: "مثال: القراءة، السفر، الطبخ، الرسم، الرياضة...",
    required: true,
    category: "vibe",
    maxLength: 50
  },
  {
    id: "vibe_3",
    question: "السؤال 42",
    description: "لو بتروح حفل موسيقي، مين الفنان اللي تختار؟",
    type: "text",
    placeholder: "مثال: عبد المجيد عبد الله، أم كلثوم، Ed Sheeran، أو أي فنان تفضله...",
    required: true,
    category: "vibe",
    maxLength: 50
  },
  {
    id: "vibe_4",
    question: "السؤال 43",
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
    question: "السؤال 44",
    description: "كيف يوصفونك اصدقائك بالعادة؟",
    type: "text",
    placeholder: "مثال: مضحك، هادئ، مستمع جيد، طموح، مساعد...",
    required: true,
    category: "vibe",
    maxLength: 100
  },
  {
    id: "vibe_6",
    question: "السؤال 45",
    description: "كيف تصف اصدقائك؟",
    type: "text",
    placeholder: "مثال: مخلصين، مضحكين، داعمين، أذكياء، متفهمين...",
    required: true,
    category: "vibe",
    maxLength: 100
  }
]

const questionsPerPage = 5

// Function to calculate MBTI personality type
const calculateMBTIType = (answers: Record<string, string | string[]>): string => {
  const categories = {
    EI: { أ: 0, ب: 0 },
    SN: { أ: 0, ب: 0 },
    TF: { أ: 0, ب: 0 },
    JP: { أ: 0, ب: 0 }
  }

  // Count answers for each MBTI category
  for (let i = 1; i <= 12; i++) {
    const questionId = `mbti_${i}`
    const answer = answers[questionId] as string
    
    if (answer) {
      if (i <= 3) {
        // E/I questions
        categories.EI[answer as 'أ' | 'ب']++
      } else if (i <= 6) {
        // S/N questions
        categories.SN[answer as 'أ' | 'ب']++
      } else if (i <= 9) {
        // T/F questions
        categories.TF[answer as 'أ' | 'ب']++
      } else if (i <= 12) {
        // J/P questions
        categories.JP[answer as 'أ' | 'ب']++
      }
    }
  }

  // Determine personality type
  const type = [
    categories.EI.أ >= categories.EI.ب ? 'E' : 'I',
    categories.SN.أ >= categories.SN.ب ? 'S' : 'N',
    categories.TF.أ >= categories.TF.ب ? 'T' : 'F',
    categories.JP.أ >= categories.JP.ب ? 'J' : 'P'
  ].join('')

  return type
}

// Function to calculate attachment style
const calculateAttachmentStyle = (answers: Record<string, string | string[]>): string => {
  const counts = {
    أ: 0, // Secure
    ب: 0, // Anxious
    ج: 0, // Avoidant
    د: 0  // Fearful/Disorganized
  }

  // Count answers for attachment style questions
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

  // Count answers for communication style questions
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
  
  // Process each lifestyle question
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
  
  // Process each core values question
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

// Function to extract and merge vibe description from all 6 questions
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
  loading = false
}: { 
  onSubmit: (data: SurveyData) => void
  surveyData: SurveyData
  setSurveyData: (data: SurveyData) => void
  loading?: boolean
}) {
  console.log("🚀 SurveyComponent mounted")
  
  useEffect(() => {
    return () => {
      console.log("🚨 SurveyComponent unmounted!")
    };
  }, []);
  
  const [currentPage, setCurrentPage] = useState(0)

  const totalPages = Math.ceil(surveyQuestions.length / questionsPerPage) + 1 // +1 for terms page
  const progress = ((currentPage + 1) / totalPages) * 100

  const handleInputChange = (questionId: string, value: string | string[]) => {
    console.log(`📝 Input change for ${questionId}:`, value)
    const newData = {
      ...surveyData,
      answers: {
        ...surveyData.answers,
        [questionId]: value
      }
    }
    console.log(`📊 Updated surveyData:`, newData)
    setSurveyData(newData)
  }

  const handleCheckboxChange = (questionId: string, value: string, checked: boolean) => {
    const currentValues = (surveyData.answers[questionId] as string[]) || []
    if (checked) {
      const question = surveyQuestions.find(q => q.id === questionId)
      if (question && 'maxSelections' in question && typeof question.maxSelections === 'number' && currentValues.length >= question.maxSelections) {
        return // Don't add if max reached
      }
      const newData = {
        ...surveyData,
        answers: {
          ...surveyData.answers,
          [questionId]: [...currentValues, value]
        }
      }
      setSurveyData(newData)
    } else {
      const newData = {
        ...surveyData,
        answers: {
          ...surveyData.answers,
          [questionId]: currentValues.filter(v => v !== value)
        }
      }
      setSurveyData(newData)
    }
  }

  const isPageValid = (page: number) => {
    if (page === totalPages - 1) {
      return surveyData.termsAccepted && surveyData.dataConsent
    }
    
    const startIndex = page * questionsPerPage
    const endIndex = Math.min(startIndex + questionsPerPage, surveyQuestions.length)
    
    for (let i = startIndex; i < endIndex; i++) {
      const question = surveyQuestions[i]
      const value = surveyData.answers[question.id]
      
      if (question.required) {
        if (Array.isArray(value)) {
          if (!value || value.length === 0) return false
        } else {
          if (!value || value === "" || value.trim() === "") return false
          
          // Check character limit for text questions
          if (question.type === "text" && question.maxLength && value.length > question.maxLength) {
            return false
          }
        }
      }
    }
    return true
  }

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

  const handleSubmit = () => {
    console.log("🔍 SurveyComponent handleSubmit called")
    console.log("📊 Current surveyData:", surveyData)
    console.log("📝 Terms accepted:", surveyData.termsAccepted)
    console.log("📝 Data consent:", surveyData.dataConsent)
    
    // Validate all required questions (including all 6 new vibe questions)
    for (const question of surveyQuestions) {
      if (question.required) {
        const value = surveyData.answers[question.id];
        console.log(`❓ Question ${question.id}:`, value)
        
        if (Array.isArray(value)) {
          if (!value || value.length === 0) {
            console.log(`❌ Missing array answer for ${question.id}`)
            alert("يرجى استكمال جميع أسئلة الاستبيان المطلوبة");
            return;
          }
        } else {
          if (!value || value === "" || value.trim() === "") {
            console.log(`❌ Missing string answer for ${question.id}`)
            alert("يرجى استكمال جميع أسئلة الاستبيان المطلوبة");
            return;
          }
          
          // Check character limit for text questions
          if (question.type === "text" && question.maxLength && value.length > question.maxLength) {
            console.log(`❌ Text too long for ${question.id}: ${value.length} > ${question.maxLength}`)
            alert(`يرجى تقصير النص في السؤال ${question.question} (الحد الأقصى: ${question.maxLength} حرف)`);
            return;
          }
        }
      }
    }
    
    if (surveyData.termsAccepted && surveyData.dataConsent) {
      console.log("✅ All validations passed, calculating personality types")
      
      // Calculate MBTI personality type
      const mbtiType = calculateMBTIType(surveyData.answers)
      console.log("🧠 Calculated MBTI Type:", mbtiType)
      
      // Calculate attachment style
      const attachmentStyle = calculateAttachmentStyle(surveyData.answers)
      console.log("🔒 Calculated Attachment Style:", attachmentStyle)
      
      // Calculate communication style
      const communicationStyle = calculateCommunicationStyle(surveyData.answers)
      console.log("💬 Calculated Communication Style:", communicationStyle)
      
      // Calculate lifestyle preferences
      const lifestylePreferences = calculateLifestylePreferences(surveyData.answers)
      console.log("⏰ Calculated Lifestyle Preferences:", lifestylePreferences)
      
      // Calculate core values
      const coreValues = calculateCoreValues(surveyData.answers)
      console.log("⚖️ Calculated Core Values:", coreValues)
      
      // Extract vibe descriptions (now includes all 6 vibe questions combined)
      const vibeDescription = extractVibeDescription(surveyData.answers)
      const idealPersonDescription = extractIdealPersonDescription(surveyData.answers)
      console.log("👤 Combined Vibe Profile:", vibeDescription)
      console.log("💭 Ideal Person Description (deprecated):", idealPersonDescription)
      
      // Add all personality types to survey data
      const finalData = {
        ...surveyData,
        mbtiType,
        attachmentStyle,
        communicationStyle,
        lifestylePreferences,
        coreValues,
        vibeDescription,
        idealPersonDescription
      }
      
      console.log("📋 Final survey data with personality types:", finalData)
      onSubmit(finalData);
    } else {
      console.log("❌ Terms not accepted")
      alert("يرجى الموافقة على الشروط والأحكام وسياسة الخصوصية");
    }
  }

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
          <div className="space-y-4 mt-4">
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

      case "text":
        const currentLength = (value as string || "").length
        const maxLength = question.maxLength || 1000
        const isOverLimit = currentLength > maxLength
        
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
              className={`min-h-[40px] text-right border-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-300 focus:ring-4 backdrop-blur-sm resize-none ${
                isOverLimit 
                  ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500/20 dark:focus:ring-red-400/20' 
                  : 'border-gray-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500/20 dark:focus:ring-blue-400/20'
              } bg-white/50 dark:bg-slate-700/50`}
            />
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none"></div>
            
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
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-ping"></div>
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
              onCheckedChange={(checked) => 
                setSurveyData({ ...surveyData, termsAccepted: checked as boolean })
              }
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
              onCheckedChange={(checked) => 
                setSurveyData({ ...surveyData, dataConsent: checked as boolean })
              }
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-white/20 dark:border-slate-700/50 max-w-sm mx-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-ping"></div>
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
                اكتشف توأم روحك
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

        {/* Survey Content */}
        <div className="space-y-4">
          {currentPage === totalPages - 1 ? (
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-slate-700/50 p-4">
              {renderTermsPage()}
            </div>
          ) : (
            <div className="space-y-4">
                              {surveyQuestions
                  .slice(currentPage * questionsPerPage, (currentPage + 1) * questionsPerPage)
                  .map((question, index) => (
                    <div key={question.id} className="group animate-slide-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
                      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-slate-700/50 p-3 transition-all duration-300 hover:shadow-2xl hover:scale-[1.01] hover:bg-white/90 dark:hover:bg-slate-800/90 hover:animate-glow">
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
                console.log("🔘 إرسال الاستبيان button clicked")
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