import { useState, useEffect } from "react";
import { 
  Clock, 
  Users, 
  Play, 
  Pause, 
  SkipForward, 
  ChevronRight, 
  ChevronLeft,
  Trophy,
  Star,
  Heart,
  Zap,
  Target,
  Smile,
  ThumbsUp,
  MessageSquare,
  Sparkles,
  Plus,
  Trash2,
  BookOpen,
  Lightbulb,
  Home,
  Timer,
  CheckCircle,
  XCircle
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Smartphone, Link as LinkIcon, Bell } from "lucide-react";
import PromptTopicsModal from "../components/PromptTopicsModal";
import logoPng from "../welcome/blindmatch.png";

// Logo Component for Groups Page - Removed (now integrated into header)

interface Game {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  duration: number; // in minutes
  icon: React.ReactNode;
  color: string;
}

const games: Game[] = [
  {
    id: "5-second-rule",
    name: "5-Second Rule",
    nameAr: "قاعدة الخمس ثواني",
    description: "Name 3 things in 5 seconds",
    descriptionAr: "سمّ 3 أشياء في 5 ثواني",
    duration: 10,
    icon: <Timer className="w-6 h-6" />,
    color: "from-orange-500 to-red-500"
  },
  {
    id: "discussion-questions",
    name: "Discussion Questions",
    nameAr: "أسئلة للنقاش",
    description: "Deep conversation starters",
    descriptionAr: "أسئلة عميقة لبدء المحادثات",
    duration: 10,
    icon: <Sparkles className="w-6 h-6" />,
    color: "from-purple-500 to-pink-500"
  },
  {
    id: "charades",
    name: "Wala Kelma",
    nameAr: "ولا كلمة",
    description: "Act out fun pop culture topics without speaking",
    descriptionAr: "مثلوا مواضيع ممتعة ومشهورة بدون كلام",
    duration: 10,
    icon: <ThumbsUp className="w-6 h-6" />,
    color: "from-green-500 to-teal-500"
  },
  {
    id: "never-have-i-ever",
    name: "Never Have I Ever",
    nameAr: "لم أفعل من قبل",
    description: "Share deep personal experiences",
    descriptionAr: "شاركوا تجاربكم الشخصية العميقة",
    duration: 10,
    icon: <Target className="w-6 h-6" />,
    color: "from-blue-500 to-cyan-500"
  },
  {
    id: "would-you-rather",
    name: "Would You Rather",
    nameAr: "ماذا تفضل",
    description: "Choose between meaningful life decisions",
    descriptionAr: "اختاروا بين قرارات حياتية مهمة",
    duration: 10,
    icon: <Heart className="w-6 h-6" />,
    color: "from-red-500 to-orange-500"
  }
];


const neverHaveIEverQuestions = [
  // Original 50 questions
  "لم أفعل من قبل: غيرت مساري المهني أو الدراسي بشكل جذري",
  "لم أفعل من قبل: سافرت لوحدي لبلد لا أعرف فيه أحد",
  "لم أفعل من قبل: اتخذت قراراً مهماً ضد رأي عائلتي وكان صحيحاً",
  "لم أفعل من قبل: تعلمت مهارة جديدة تماماً بعد سن الـ25",
  "لم أفعل من قبل: واجهت موقفاً خطيراً وتصرفت بشجاعة",
  "لم أفعل من قبل: قابلت شخصاً غريباً أثر في حياتي بشكل كبير",
  "لم أفعل من قبل: ضحيت بفرصة ذهبية من أجل شخص أحبه",
  "لم أفعل من قبل: اكتشفت موهبة عندي بالصدفة",
  "لم أفعل من قبل: عشت تجربة غيرت نظرتي للحياة تماماً",
  "لم أفعل من قبل: واجهت خوفاً كبيراً وتغلبت عليه",
  "لم أفعل من قبل: قطعت علاقة سامة رغم صعوبة القرار",
  "لم أفعل من قبل: ساعدت شخصاً غريباً في أزمة حقيقية",
  "لم أفعل من قبل: تجاهلت نصيحة الجميع واتبعت حدسي ونجحت",
  "لم أفعل من قبل: عشت لحظة شعرت فيها أني في المكان الصحيح تماماً",
  "لم أفعل من قبل: اكتشفت حقيقة مؤلمة عن شخص قريب مني",
  "لم أفعل من قبل: غيرت رأيي في قناعة كنت متمسكاً فيها لسنوات",
  "لم أفعل من قبل: عشت تجربة روحانية عميقة في الحج أو العمرة",
  "لم أفعل من قبل: تعرضت لموقف ظلم وقفت ضده رغم الثمن",
  "لم أفعل من قبل: اكتشفت شغفاً حقيقياً غير مجال عملي",
  "لم أفعل من قبل: عشت لحظة فخر حقيقي بإنجاز حققته بنفسي",
  "لم أفعل من قبل: كنت في موقف خطير وتصرفت بطريقة لم أتوقعها من نفسي",
  "لم أفعل من قبل: قابلت شخص مشهور أو مؤثر وكان الموقف غريباً أو مضحكاً",
  "لم أفعل من قبل: وقعت في موقف محرج جداً أمام مجموعة كبيرة من الناس",
  "لم أفعل من قبل: أنقذت شخصاً من موقف صعب أو خطير",
  "لم أفعل من قبل: تورطت في مشكلة كبيرة بسبب سوء فهم",
  "لم أفعل من قبل: ضعت في مكان غريب ولم أعرف كيف أرجع",
  "لم أفعل من قبل: شهدت حادثة غريبة جداً لا أحد يصدقها عندما أرويها",
  "لم أفعل من قبل: اكتشفت سراً كبيراً عن شخص قريب مني بالصدفة",
  "لم أفعل من قبل: تعرضت لموقف خارق للطبيعة أو غريب جداً لا أستطيع تفسيره",
  "لم أفعل من قبل: قمت بمغامرة جنونية ندمت عليها في منتصفها",
  "لم أفعل من قبل: واجهت شخصاً ظالماً أو متنمراً ووقفت في وجهه",
  "لم أفعل من قبل: عشت تجربة سفر كارثية تحولت لذكرى مضحكة",
  "لم أفعل من قبل: اكتشفت موهبة مخفية عندي في موقف غير متوقع",
  "لم أفعل من قبل: تسببت في موقف فوضوي كبير بدون قصد",
  "لم أفعل من قبل: نجوت من موقف كان ممكن ينتهي بشكل سيء جداً",
  "لم أفعل من قبل: قابلت شخصاً غيّر طريقة تفكيري في لقاء واحد فقط",
  "لم أفعل من قبل: عشت تجربة رعب حقيقية في مكان مهجور أو مخيف",
  "لم أفعل من قبل: اكتشفت خيانة أو كذبة كبيرة بطريقة درامية",
  "لم أفعل من قبل: قمت بشيء شجاع جداً رغم خوفي الشديد",
  "لم أفعل من قبل: تعرضت لموقف طريف جداً في مكان رسمي أو مهم",
  "لم أفعل من قبل: ساعدت شخصاً غريباً وتحول لصديق مقرب",
  "لم أفعل من قبل: عشت تجربة غريبة أو مرعبة في الطيران أو السفر",
  "لم أفعل من قبل: اتخذت قراراً متهوراً غيّر حياتي للأفضل",
  "لم أفعل من قبل: تعرضت لموقف سوء تفاهم كبير مع السلطات أو الشرطة",
  "لم أفعل من قبل: اكتشفت مكاناً سرياً أو مخفياً بالصدفة",
  "لم أفعل من قبل: عشت لحظة بطولية أنقذت فيها موقفاً صعباً",
  "لم أفعل من قبل: تعرضت لموقف كوميدي في أسوأ توقيت ممكن",
  "لم أفعل من قبل: واجهت مخاوفي وقمت بشيء كنت أخاف منه لسنوات",
  "لم أفعل من قبل: عشت تجربة غريبة أو خطيرة مع حيوان في الطبيعة",
  
  // NEW 50 engaging questions
  "لم أفعل من قبل: بكيت من السعادة في لحظة غير متوقعة أبداً",
  "لم أفعل من قبل: اكتشفت أن شخصاً كان يكذب علي لسنوات طويلة",
  "لم أفعل من قبل: قضيت ليلة كاملة في مكان عام بسبب ظرف طارئ",
  "لم أفعل من قبل: تظاهرت بأني شخص آخر في موقف اجتماعي",
  "لم أفعل من قبل: غيرت رأيي في شخص تماماً بعد موقف واحد فقط",
  "لم أفعل من قبل: اكتشفت أن لدي قريب أو أخ لم أكن أعرف بوجوده",
  "لم أفعل من قبل: عشت تجربة ديجافو قوية جداً غيرت قناعاتي",
  "لم أفعل من قبل: أنقذني شخص غريب من موقف خطير أو محرج",
  "لم أفعل من قبل: اكتشفت موهبة فنية عندي في سن متأخرة",
  "لم أفعل من قبل: تعرضت لموقف جعلني أعيد التفكير في كل شيء في حياتي",
  "لم أفعل من قبل: قابلت شخصاً في الواقع بعد صداقة طويلة على الإنترنت",
  "لم أفعل من قبل: شاركت في احتجاج أو مظاهرة لقضية أؤمن بها",
  "لم أفعل من قبل: عشت تجربة حب من طرف واحد استمرت لسنوات",
  "لم أفعل من قبل: اكتشفت أن صديقاً مقرباً كان يحسدني أو يغار مني",
  "لم أفعل من قبل: تعرضت لحادث سيارة أو موقف مروري خطير",
  "لم أفعل من قبل: فقدت شيئاً ثميناً جداً ولم أجده أبداً",
  "لم أفعل من قبل: قمت بعمل خيري غيّر حياة شخص بشكل جذري",
  "لم أفعل من قبل: تعلمت لغة جديدة بشكل ذاتي وأتقنتها",
  "لم أفعل من قبل: عشت في مدينة أو بلد مختلف لأكثر من 6 أشهر",
  "لم أفعل من قبل: اكتشفت أن لدي حساسية أو مرض لم أكن أعرفه",
  "لم أفعل من قبل: قطعت وعداً مهماً لنفسي ونفذته فعلاً",
  "لم أفعل من قبل: تعرضت لموقف تمييز أو عنصرية واضح",
  "لم أفعل من قبل: فزت بجائزة أو مسابقة مهمة في حياتي",
  "لم أفعل من قبل: قضيت أكثر من أسبوع بدون إنترنت أو هاتف",
  "لم أفعل من قبل: اكتشفت أن شخصاً كان يتحدث عني بالسوء خلف ظهري",
  "لم أفعل من قبل: عشت تجربة فقدان شخص عزيز غيرت نظرتي للحياة",
  "لم أفعل من قبل: قمت بشيء متهور في لحظة غضب وندمت عليه",
  "لم أفعل من قبل: تعرضت لموقف سرقة أو نصب واضح",
  "لم أفعل من قبل: اكتشفت شغفاً جديداً بعد سن الثلاثين",
  "لم أفعل من قبل: عشت تجربة صداقة انتهت بشكل مفاجئ ومؤلم",
  "لم أفعل من قبل: قمت بمواجهة شخص بحقيقة مؤلمة عنه",
  "لم أفعل من قبل: تعرضت لموقف طبي طارئ أنقذ حياتي",
  "لم أفعل من قبل: اكتشفت أن لدي قدرة أو مهارة نادرة",
  "لم أفعل من قبل: عشت تجربة حزن عميق جعلتني أقوى",
  "لم أفعل من قبل: قمت بتغيير جذري في مظهري أو أسلوبي",
  "لم أفعل من قبل: تعرضت لموقف جعلني أفقد الثقة في الناس لفترة",
  "لم أفعل من قبل: اكتشفت أن لدي خوف أو فوبيا لم أكن أعرفها",
  "لم أفعل من قبل: عشت تجربة نجاح كبير بعد فشل متكرر",
  "لم أفعل من قبل: قمت بقطع علاقة مع أحد أفراد العائلة",
  "لم أفعل من قبل: تعرضت لموقف جعلني أعيد تقييم أولوياتي بالكامل",
  "لم أفعل من قبل: اكتشفت أن شخصاً كان يحبني وأنا لم أكن أعلم",
  "لم أفعل من قبل: عشت تجربة وحدة عميقة علمتني الكثير عن نفسي",
  "لم أفعل من قبل: قمت بمغامرة مالية كبيرة ونجحت أو فشلت فيها",
  "لم أفعل من قبل: تعرضت لموقف جعلني أقدر نعمة الصحة",
  "لم أفعل من قبل: اكتشفت سر عائلي كبير غير نظرتي لأشياء كثيرة",
  "لم أفعل من قبل: عشت تجربة صدمة ثقافية في بلد أجنبي",
  "لم أفعل من قبل: قمت بمسامحة شخص أساء لي بشكل كبير",
  "لم أفعل من قبل: تعرضت لموقف جعلني أدرك قيمة الوقت",
  "لم أفعل من قبل: اكتشفت أن لدي قدرة على التأثير في الآخرين",
  "لم أفعل من قبل: عشت لحظة استسلام كامل ثم نهضت من جديد"
];

const wouldYouRatherQuestions = [
  {
    optionA: "أن تعمل في وظيفة تحبها براتب قليل",
    optionB: "أن تعمل في وظيفة تكرهها براتب ضخم"
  },
  {
    optionA: "أن تعيش في السعودية مع عائلتك",
    optionB: "أن تعيش في أوروبا مع فرص أفضل ولكن بعيداً عن الأهل"
  },
  {
    optionA: "أن تبدأ مشروعك الخاص بمخاطرة عالية",
    optionB: "أن تبقى في وظيفة مستقرة ولكن بدون نمو"
  },
  {
    optionA: "أن تتزوج شخصاً تحبه ولكن عائلتك ضده",
    optionB: "أن تتزوج شخصاً ترضى عنه العائلة ولكن لا تحبه"
  },
  {
    optionA: "أن تعرف الحقيقة المؤلمة",
    optionB: "أن تعيش في جهل مريح"
  },
  {
    optionA: "أن تسافر حول العالم لمدة سنة بدون عمل",
    optionB: "أن تعمل بجد لمدة سنة وتشتري بيت أحلامك"
  },
  {
    optionA: "أن تكون مشهوراً في مجالك ولكن بدون خصوصية",
    optionB: "أن تكون ناجحاً بصمت مع حياة خاصة هادئة"
  },
  {
    optionA: "أن تعيش 100 سنة بصحة متوسطة",
    optionB: "أن تعيش 60 سنة بصحة ممتازة"
  },
  {
    optionA: "أن تكون قادراً على قراءة الأفكار",
    optionB: "أن تكون قادراً على التحدث بكل اللغات"
  },
  {
    optionA: "أن تعيش في الرياض مع فرص عمل أكثر",
    optionB: "أن تعيش في جدة مع جودة حياة أفضل"
  },
  {
    optionA: "أن تكمل دراستك العليا في الخارج وحدك",
    optionB: "أن تعمل مباشرة وتبني خبرة عملية في السعودية"
  },
  {
    optionA: "أن تكون صادقاً دائماً حتى لو جرحت الآخرين",
    optionB: "أن تكذب أحياناً لحماية مشاعر الناس"
  },
  {
    optionA: "أن تملك وقتاً غير محدود ولكن بدون مال",
    optionB: "أن تملك مالاً غير محدود ولكن بدون وقت"
  },
  {
    optionA: "أن تعرف تاريخ نجاحك الكبير",
    optionB: "أن تعرف تاريخ أكبر فشل ستواجهه"
  },
  {
    optionA: "أن تعيش حياة مليئة بالمغامرات والمخاطر",
    optionB: "أن تعيش حياة آمنة ومستقرة ولكن روتينية"
  },
  {
    optionA: "أن تعيش تجربة حب عظيمة تنتهي بألم كبير",
    optionB: "أن لا تحب أبداً ولكن تعيش بدون ألم"
  },
  {
    optionA: "أن تكتشف أن حياتك كلها كانت كذبة",
    optionB: "أن تعيش في وهم سعيد لبقية حياتك"
  },
  {
    optionA: "أن تضحي بأحلامك من أجل شخص تحبه",
    optionB: "أن تضحي بشخص تحبه من أجل أحلامك"
  },
  {
    optionA: "أن تعرف كل أسرار الناس من حولك",
    optionB: "أن لا تعرف أي شيء عن حقيقة الناس"
  },
  {
    optionA: "أن تعيش تجربة خيانة من أقرب صديق",
    optionB: "أن لا يكون لك أصدقاء مقربين أبداً"
  },
  {
    optionA: "أن تكون محبوباً من الجميع ولكن وحيداً من الداخل",
    optionB: "أن تكون مكروهاً ولكن راضياً عن نفسك"
  },
  {
    optionA: "أن تعيش في عالم بدون موسيقى",
    optionB: "أن تعيش في عالم بدون ألوان"
  },
  {
    optionA: "أن تنسى كل ذكرياتك السعيدة",
    optionB: "أن تتذكر كل ذكرياتك المؤلمة بوضوح شديد"
  },
  {
    optionA: "أن تموت بطلاً شاباً",
    optionB: "أن تعيش طويلاً ولكن منسياً"
  },
  {
    optionA: "أن تكون قادراً على رؤية المستقبل ولكن لا تستطيع تغييره",
    optionB: "أن تكون قادراً على تغيير الماضي ولكن بعواقب غير متوقعة"
  },
  {
    optionA: "أن تعيش في عالم بدون كذب ولكن الحقيقة مؤلمة دائماً",
    optionB: "أن تعيش في عالم مليء بالأكاذيب ولكن الجميع سعداء"
  },
  {
    optionA: "أن تفقد ذاكرتك كل يوم وتبدأ من جديد",
    optionB: "أن تتذكر كل شيء بتفاصيل مؤلمة ولا تنسى أبداً"
  },
  {
    optionA: "أن تعيش حياة عادية في الواقع",
    optionB: "أن تعيش حياة مثالية في حلم لا ينتهي"
  },
  {
    optionA: "أن تكون آخر شخص على الأرض",
    optionB: "أن تعيش في عالم مزدحم ولكن لا أحد يراك"
  },
  {
    optionA: "أن تعرف تاريخ موتك بالضبط",
    optionB: "أن تعرف سبب موتك ولكن ليس التاريخ"
  },
  
  // NEW 30 engaging questions
  {
    optionA: "أن تعيش حياة مليئة بالندم على ما فعلت",
    optionB: "أن تعيش حياة مليئة بالندم على ما لم تفعل"
  },
  {
    optionA: "أن تكون قادراً على محو ذكرى واحدة من ماضيك",
    optionB: "أن تكون قادراً على استعادة ذكرى واحدة فقدتها"
  },
  {
    optionA: "أن تعرف كل لغات العالم ولكن تنسى لغتك الأم",
    optionB: "أن تتقن لغتك الأم فقط ولا تفهم أي لغة أخرى"
  },
  {
    optionA: "أن تعيش في عصر الماضي بدون تكنولوجيا",
    optionB: "أن تعيش في المستقبل البعيد بدون عائلة أو أصدقاء"
  },
  {
    optionA: "أن تكون ذكياً جداً ولكن وحيداً",
    optionB: "أن تكون متوسط الذكاء ولكن محاطاً بأحباء"
  },
  {
    optionA: "أن تخسر كل أموالك ولكن تحتفظ بذكرياتك",
    optionB: "أن تحتفظ بكل أموالك ولكن تفقد كل ذكرياتك"
  },
  {
    optionA: "أن تعيش حياة قصيرة مليئة بالإنجازات",
    optionB: "أن تعيش حياة طويلة بدون إنجازات تذكر"
  },
  {
    optionA: "أن تكون قادراً على رؤية 10 دقائق في المستقبل",
    optionB: "أن تكون قادراً على العودة 10 دقائق في الماضي"
  },
  {
    optionA: "أن تفقد حاسة البصر",
    optionB: "أن تفقد حاسة السمع"
  },
  {
    optionA: "أن تعيش في عالم بدون فن أو موسيقى",
    optionB: "أن تعيش في عالم بدون طعام لذيذ (طعام صحي فقط)"
  },
  {
    optionA: "أن تكون مشهوراً بعد موتك بـ100 سنة",
    optionB: "أن تكون مشهوراً الآن ولكن منسياً بعد موتك"
  },
  {
    optionA: "أن تعرف متى سيموت كل شخص تحبه",
    optionB: "أن لا تعرف أبداً متى سيموت أي شخص"
  },
  {
    optionA: "أن تعيش حياة مثالية ولكنها مكررة كل يوم",
    optionB: "أن تعيش حياة فوضوية ولكن مليئة بالمفاجآت"
  },
  {
    optionA: "أن تكون قادراً على الطيران ولكن بسرعة المشي فقط",
    optionB: "أن تكون قادراً على الجري بسرعة خارقة ولكن لا تطير"
  },
  {
    optionA: "أن تعيش في عالم بدون كتب",
    optionB: "أن تعيش في عالم بدون أفلام أو مسلسلات"
  },
  {
    optionA: "أن تكون قادراً على التحكم في النار",
    optionB: "أن تكون قادراً على التحكم في الماء"
  },
  {
    optionA: "أن تعيش حياة بدون نوم (لا تحتاج للنوم أبداً)",
    optionB: "أن تنام 12 ساعة يومياً ولكن بأحلام مذهلة"
  },
  {
    optionA: "أن تكون قادراً على شفاء الآخرين ولكن لا تستطيع شفاء نفسك",
    optionB: "أن تكون قادراً على شفاء نفسك فقط ولا تستطيع مساعدة الآخرين"
  },
  {
    optionA: "أن تعرف إجابة أي سؤال علمي",
    optionB: "أن تعرف إجابة أي سؤال فلسفي"
  },
  {
    optionA: "أن تعيش في عالم بدون حيوانات أليفة",
    optionB: "أن تعيش في عالم بدون نباتات أو أشجار"
  },
  {
    optionA: "أن تكون قادراً على تجميد الوقت لساعة واحدة يومياً",
    optionB: "أن تكون قادراً على تسريع الوقت لساعة واحدة يومياً"
  },
  {
    optionA: "أن تعيش حياة بدون ألم جسدي ولكن بألم نفسي مستمر",
    optionB: "أن تعيش حياة بدون ألم نفسي ولكن بألم جسدي مستمر"
  },
  {
    optionA: "أن تكون قادراً على فهم الحيوانات ولكن لا تستطيع التحدث معهم",
    optionB: "أن تكون قادراً على التحدث مع الحيوانات ولكن لا تفهمهم"
  },
  {
    optionA: "أن تعيش في عالم بدون مرايا (لا ترى نفسك أبداً)",
    optionB: "أن تعيش في عالم حيث الجميع يرى أفكارك"
  },
  {
    optionA: "أن تكون قادراً على تغيير شيء واحد في ماضيك",
    optionB: "أن تكون قادراً على معرفة شيء واحد عن مستقبلك"
  },
  {
    optionA: "أن تعيش حياة بدون عواطف (لا تشعر بأي شيء)",
    optionB: "أن تعيش حياة بعواطف مضاعفة (تشعر بكل شيء بقوة)"
  },
  {
    optionA: "أن تكون قادراً على العيش تحت الماء",
    optionB: "أن تكون قادراً على العيش في الفضاء"
  },
  {
    optionA: "أن تعرف كل أسرار الكون ولكن لا تستطيع مشاركتها",
    optionB: "أن تعيش في جهل سعيد بكل شيء"
  },
  {
    optionA: "أن تكون قادراً على تغيير مظهرك متى تشاء",
    optionB: "أن تكون قادراً على تغيير صوتك متى تشاء"
  },
  {
    optionA: "أن تعيش في عالم بدون موت (الجميع يعيش للأبد)",
    optionB: "أن تعيش في عالم حيث الحياة قصيرة جداً (50 سنة فقط)"
  }
];

// ولا كلمة topics - focused on 3 main categories with no duplicates
const charadesTopics = {
  "أفلام ومسلسلات": [
    "تايتانيك", "سبايدرمان", "باتمان", "فروزن", "شريك", "هاري بوتر", "أفاتار", 
    "الأسود يليق بك", "ولد الغلابة", "الكبير أوي", "مدرسة الحب", "فيلم هندي",
    "أفنجرز", "فاست آند فيوريوس", "جوراسيك بارك", "ستار وورز", "مهمة مستحيلة", "ماتريكس",
    "مسرحية مدرسة المشاغبين", "مسرحية العيال كبرت", "مسرحية تياترو مصر", "مسرحية الواد سيد الشغال", "مسرحية الزعيم",
    "مسرحية شاهد ماشفش حاجة", "مسرحية الملك لير", "مسرحية بودي جارد", "مسرحية ريا وسكينة", "مسرحية المتزوجون",
    "مسرحية الهمجي", "مسرحية انت حر", "مسرحية الكيت كات", "مسرحية ولا في الأحلام", "مسرحية مسافر ليل",
    "مسرحية الضحك في آخر الليل", "مسرحية الفرافير", "مسرحية أهلا يا دكتور", "مسرحية جعلتني مجرما", "مسرحية الراجل اللي جوز مراته"
  ],
  "مشاهير وشخصيات": [
    "كريستيانو رونالدو", "ميسي", "محمد صلاح", "نيمار", "كيليان مبابي",
    "إيلون ماسك", "بيل جيتس", "الملكة إليزابيث", "مايكل جاكسون",
    "جيم كاري", "ويل سميث", "توم كروز", "براد بيت", "ليوناردو دي كابريو", "جاكي شان",
    "مصطفى شعبان", "عادل إمام", "محمد هنيدي", "أحمد حلمي", "رامز جلال", "أحمد مكي", "محمد رمضان",
    "تامر حسني", "عمرو دياب", "فيروز", "أم كلثوم", "محمد عبده", "راشد الماجد", "نوال الكويتية", "أصالة",
    "كاظم الساهر", "نانسي عجرم", "إليسا", "حسين الجسمي", "ماجد المهندس", "أنغام"
  ],
  "تطبيقات ومواقع": [
    "واتساب", "سناب شات", "انستقرام", "تيك توك", "يوتيوب", "تويتر", "فيسبوك",
    "جوجل", "أمازون", "نتفليكس", "سبوتيفاي", "أوبر", "كريم", "طلبات", "هنقرستيشن",
    "زوم", "تيمز", "ديسكورد", "تيليجرام", "لينكد إن", "تندر", "بلايستيشن",
    "شاهد", "ستارزبلاي", "OSN", "MBC", "روتانا", "العربية", "الجزيرة"
  ]
};

// Flatten all topics for random selection
const allCharadesWords = Object.values(charadesTopics).flat();

// 5-Second Rule Categories (150+ categories)
const fiveSecondRuleCategories = [
  // Food & Drinks
  "أنواع من القهوة", "أنواع من الشاي", "أنواع من العصير", "حلويات سعودية", "مطاعم سريعة",
  "فواكه استوائية", "أنواع من الأجبان", "توابل تستخدم في الطبخ", "أنواع من الأرز", "مشروبات ساخنة",
  "حلويات عربية", "أنواع من المعجنات", "أطعمة تبدأ بحرف الميم", "صلصات شائعة", "أطعمة إيطالية",
  
  // Places & Cities
  "مدن سعودية", "عواصم عربية", "دول أوروبية", "مدن في أمريكا", "جزر سياحية",
  "معالم في الرياض", "مدن ساحلية", "دول آسيوية", "أماكن تاريخية", "مدن صحراوية",
  "دول أفريقية", "مدن في جدة", "دول تطل على البحر المتوسط", "جبال مشهورة", "أنهار معروفة",
  
  // Professions & Careers  
  "وظائف طبية", "وظائف هندسية", "وظائف تقنية", "وظائف فنية", "وظائف تعليمية",
  "مهن يدوية", "وظائف حكومية", "مهن إبداعية", "وظائف في المطارات", "وظائف في المستشفيات",
  
  // Animals & Nature
  "حيوانات أليفة", "حيوانات بحرية", "طيور", "حيوانات الصحراء", "حشرات",
  "حيوانات مفترسة", "حيوانات المزرعة", "زواحف", "حيوانات القطب الشمالي", "حيوانات الغابة",
  "أسماك", "حيوانات نادرة", "حيوانات تطير", "حيوانات ليلية", "حيوانات عاشبة",
  
  // Sports & Activities
  "رياضات جماعية", "رياضات فردية", "رياضات مائية", "رياضات شتوية", "رياضات قتالية",
  "رياضات أولمبية", "رياضات شعبية في السعودية", "تمارين رياضية", "رياضات خطرة", "رياضات ذهنية",
  
  // Entertainment & Media
  "أنواع من الأفلام", "مسلسلات سعودية", "مسلسلات تركية", "قنوات تلفزيونية", "برامج واقع",
  "ألعاب فيديو مشهورة", "منصات ترفيه", "أنواع من الموسيقى", "آلات موسيقية", "مواقع تواصل اجتماعي",
  "برامج طبخ", "أفلام كرتون", "مسلسلات كورية", "برامج مسابقات", "بودكاستات عربية",
  
  // Technology & Brands
  "شركات تقنية", "تطبيقات على الهاتف", "منصات تسوق إلكتروني", "شركات سيارات", "ماركات ملابس فاخرة",
  "شركات طيران", "أنواع من الهواتف", "ماركات ساعات", "شركات برمجيات", "ماركات رياضية",
  "منصات توصيل", "شركات شحن", "ماركات عطور", "أجهزة إلكترونية", "ماركات أحذية",
  
  // Education & Knowledge
  "تخصصات جامعية", "مواد دراسية", "لغات عالمية", "جامعات سعودية", "كتب مشهورة",
  "علماء مسلمين", "اختراعات حديثة", "نظريات علمية", "عجائب الدنيا", "كواكب المجموعة الشمسية",
  
  // Colors & Shapes
  "ألوان", "درجات من اللون الأزرق", "أشكال هندسية", "ألوان طيف قوس قزح", "ألوان دافئة",
  
  // Body & Health
  "أعضاء في الجسم", "عظام في الجسم", "حواس الإنسان", "فيتامينات", "تمارين إطالة",
  "أنواع من الأطباء", "أمراض شائعة", "أدوية منزلية", "أجهزة طبية", "طرق لتخفيف التوتر",
  
  // Fashion & Beauty
  "أنواع من القبعات", "إكسسوارات نسائية", "أنواع من الأحذية", "أنماط الموضة", "ماركات تجميل",
  "قصات شعر", "أنواع من الحقائب", "نظارات", "أنواع من الساعات", "ألوان مكياج",
  
  // Transportation
  "أنواع من السيارات", "وسائل نقل عام", "أنواع من الطائرات", "أنواع من الدراجات", "وسائل نقل قديمة",
  "قطارات", "سفن", "مركبات عسكرية", "سيارات رياضية", "حافلات",
  
  // Home & Furniture
  "أثاث المنزل", "غرف في المنزل", "أدوات مطبخ", "أجهزة كهربائية", "أنواع من الإضاءة",
  "ديكورات منزلية", "أدوات تنظيف", "أنواع من السجاد", "أدوات الحمام", "نباتات منزلية",
  
  // Weather & Seasons
  "فصول السنة", "ظواهر جوية", "أنواع من السحب", "كوارث طبيعية", "مصطلحات جوية",
  
  // Emotions & Feelings
  "مشاعر إيجابية", "مشاعر سلبية", "تعبيرات الوجه", "لغة الجسد", "طرق للتعبير عن السعادة",
  
  // Hobbies & Interests
  "هوايات داخلية", "هوايات خارجية", "حرف يدوية", "فنون", "مجموعات يمكن جمعها",
  "أنواع من الرسم", "أنواع من الرقص", "ألعاب ورقية", "ألعاب لوحية", "هوايات إبداعية",
  
  // Saudi Culture
  "أطباق سعودية", "أماكن سياحية في السعودية", "مناسبات سعودية", "ملابس تقليدية", "شعراء سعوديين",
  "مدن تراثية", "صحاري سعودية", "أسواق شعبية", "قهوة عربية وإضافات", "أكلات شعبية",
  
  // Random & Fun
  "أشياء حمراء", "أشياء دائرية", "أشياء لا يمكن العيش بدونها", "أشياء في الحقيبة", "أشياء في الثلاجة",
  "أسماء بنات", "أسماء أولاد", "ألقاب مشهورة", "كلمات تبدأ بحرف السين", "أشياء باردة",
  "أشياء ساخنة", "أشياء ثقيلة", "أشياء خفيفة", "أشياء شفافة", "أشياء يمكن أكلها نيئة"
];

export default function GroupsPage() {
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [gamePhase, setGamePhase] = useState<"intro" | "playing" | "completed">("intro");
  const [showPromptTopicsModal, setShowPromptTopicsModal] = useState(false);
  
  // Shuffled questions state
  const [shuffledNeverHaveIEver, setShuffledNeverHaveIEver] = useState<string[]>([]);
  const [shuffledWouldYouRather, setShuffledWouldYouRather] = useState<typeof wouldYouRatherQuestions>([]);
  
  // Charades game state
  const [currentCharadesWord, setCurrentCharadesWord] = useState<string>("");
  const [currentCharadesCategory, setCurrentCharadesCategory] = useState<string>("");
  const [charadesTimer, setCharadesTimer] = useState(90); // 90 seconds (1:30) per word
  const [charadesTimerActive, setCharadesTimerActive] = useState(false);
  const [charadesScore, setCharadesScore] = useState({ correct: 0, total: 0 });
  
  // 5-Second Rule game state
  const [currentCategory, setCurrentCategory] = useState<string>("");
  const [fiveSecondTimer, setFiveSecondTimer] = useState(5);
  const [fiveSecondTimerActive, setFiveSecondTimerActive] = useState(false);
  const [fiveSecondScore, setFiveSecondScore] = useState({ success: 0, total: 0 });
  const [shuffledCategories, setShuffledCategories] = useState<string[]>([]);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [roundCompleted, setRoundCompleted] = useState(false);
  
  // Participant data state
  const [participantName, setParticipantName] = useState<string>("");
  const [participantNumber, setParticipantNumber] = useState<number | null>(null);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(30 * 60); // 30 minutes in seconds
  const [timerActive, setTimerActive] = useState(false);
  const [showTimeUpModal, setShowTimeUpModal] = useState(false);
  const [showIndividualRoundsModal, setShowIndividualRoundsModal] = useState(false);
  
  // Group guide popup state
  const [showGroupGuide, setShowGroupGuide] = useState(false);

  const currentGame = games[currentGameIndex];

  // Shuffle array function
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Handle browser back button intelligently based on current state
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      event.preventDefault();
      
      // If currently in a game session, go back to main groups page
      if (gameStarted) {
        setGameStarted(false);
        setCurrentGameIndex(0);
        setGamePhase("intro");
        setTimeRemaining(30 * 60); // Reset timer
        setTimerActive(false);
        setShowTimeUpModal(false);
        setShowIndividualRoundsModal(false);
        setCharadesTimerActive(false);
        setCharadesTimer(90);
      } else {
        // If on main groups page, go to welcome page
        window.location.href = "/welcome";
      }
    };

    // Add event listener for browser back button
    window.addEventListener('popstate', handlePopState);

    // Push current state to history so back button is intercepted
    window.history.pushState(null, '', window.location.pathname);

    // Cleanup event listener on component unmount
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [gameStarted]); // Add gameStarted as dependency

  // Debug: Log tableNumber changes
  useEffect(() => {
    console.log('🔍 tableNumber state changed:', tableNumber);
  }, [tableNumber]);

  // Show group guide on first load
  useEffect(() => {
    const hasSeenGroupGuide = localStorage.getItem('blindmatch_group_guide_seen');
    if (!hasSeenGroupGuide) {
      setShowGroupGuide(true);
      localStorage.setItem('blindmatch_group_guide_seen', 'true');
    }
  }, []);

  // Load participant data and group assignment on component mount
  useEffect(() => {
    const loadParticipantData = async () => {
      try {
        // Get saved token from localStorage
        const savedToken = localStorage.getItem('blindmatch_result_token') || 
                          localStorage.getItem('blindmatch_returning_token');
        
        if (!savedToken) {
          console.log('No saved token found');
          setDataLoaded(true);
          return;
        }

        // Resolve participant data
        const participantRes = await fetch("/api/participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "resolve-token", 
            secure_token: savedToken 
          }),
        });

        if (!participantRes.ok) {
          console.error('Failed to resolve participant token');
          setDataLoaded(true);
          return;
        }

        const participantData = await participantRes.json();
        
        if (participantData.success && participantData.assigned_number) {
          const name = participantData.name || participantData.survey_data?.name || `المشارك #${participantData.assigned_number}`;
          setParticipantName(name);
          setParticipantNumber(participantData.assigned_number);

          // Try to fetch group assignment (fallback gracefully if fails)
          try {
            // First, get the current active event
            const eventStateRes = await fetch("/api/admin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "get-current-event-id"
              })
            });

            let currentEventId = 1; // Default fallback
            if (eventStateRes.ok) {
              const eventState = await eventStateRes.json();
              currentEventId = eventState.current_event_id || 1;
              console.log(`📅 Current active event: ${currentEventId}`);
            } else {
              console.log('⚠️ Could not fetch current event ID, using default: 1');
            }

            // Fetch group matches for the current active event
            const groupRes = await fetch("/api/admin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "get-group-matches",
                event_id: currentEventId
              }),
            });

            if (groupRes.ok) {
              const groupData = await groupRes.json();
              
              // Find the group that contains this participant
              // Note: participant_numbers can be stored as strings or numbers, so check both
              const userGroup = groupData.groups?.find((group: any) => {
                const participantNumbers = group.participant_numbers || [];
                return participantNumbers.includes(participantData.assigned_number) || 
                       participantNumbers.includes(String(participantData.assigned_number)) ||
                       participantNumbers.map(String).includes(String(participantData.assigned_number));
              });

              if (userGroup) {
                console.log(`✅ Found group assignment:`, userGroup);
                console.log(`Setting table number to: ${userGroup.table_number}`);
                setTableNumber(userGroup.table_number);
                setGroupMembers(userGroup.participant_names || []);
                console.log(`✅ Table number set - Table #${userGroup.table_number} (Event ${currentEventId})`);
              } else {
                console.log(`⚠️ No group assignment found for participant #${participantData.assigned_number} in event ${currentEventId}`);
                console.log('Participant assigned_number type:', typeof participantData.assigned_number, participantData.assigned_number);
                console.log('Available groups:', groupData.groups?.map((g: any) => ({ 
                  table: g.table_number, 
                  participants: g.participant_numbers,
                  participantTypes: g.participant_numbers?.map((p: any) => typeof p)
                })));
              }
            }
          } catch (groupError) {
            console.log('Could not fetch group assignment, continuing without table info');
            // Continue without group info - don't set error state
          }
        }
      } catch (error) {
        console.error('Error loading participant data:', error);
      } finally {
        setDataLoaded(true);
      }
    };

    loadParticipantData();
  }, []);

  // Timer useEffect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (timerActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setTimerActive(false);
            setShowTimeUpModal(true);
            setShowIndividualRoundsModal(true); // Show individual rounds modal when timer ends
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive, timeRemaining]);

  // Charades timer useEffect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (charadesTimerActive && charadesTimer > 0) {
      interval = setInterval(() => {
        setCharadesTimer(prev => {
          if (prev <= 1) {
            setCharadesTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [charadesTimerActive, charadesTimer]);

  // 5-Second Rule timer useEffect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (fiveSecondTimerActive && fiveSecondTimer > 0) {
      interval = setInterval(() => {
        setFiveSecondTimer(prev => {
          if (prev <= 1) {
            setFiveSecondTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fiveSecondTimerActive, fiveSecondTimer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startSession = () => {
    setGameStarted(true);
    setTimerActive(true);
  };


  const startGame = (gameId: string) => {
    setSelectedGameId(gameId);
    setGamePhase("playing");
    setCurrentPromptIndex(0);
    
    // Shuffle questions when starting the game
    if (gameId === "never-have-i-ever") {
      setShuffledNeverHaveIEver(shuffleArray(neverHaveIEverQuestions));
    } else if (gameId === "would-you-rather") {
      setShuffledWouldYouRather(shuffleArray(wouldYouRatherQuestions));
    } else if (gameId === "5-second-rule") {
      setShuffledCategories(shuffleArray(fiveSecondRuleCategories));
      setCategoryIndex(0);
    }
  };

  const nextGame = () => {
    if (currentGameIndex < games.length - 1) {
      setCurrentGameIndex(prev => prev + 1);
      setGamePhase("intro");
    } else {
      // All games completed
      setGamePhase("completed");
    }
  };

  // Charades helper functions
  const getRandomCharadesWord = () => {
    const randomWord = allCharadesWords[Math.floor(Math.random() * allCharadesWords.length)];
    
    // Find which category this word belongs to
    const category = Object.entries(charadesTopics).find(([_, words]) => 
      words.includes(randomWord)
    )?.[0] || "عام";
    
    setCurrentCharadesWord(randomWord);
    setCurrentCharadesCategory(category);
    setCharadesTimer(90); // 90 seconds (1:30)
    setCharadesTimerActive(false);
  };

  const startCharadesRound = () => {
    getRandomCharadesWord();
    setCharadesTimerActive(true);
  };

  const charadesCorrect = () => {
    setCharadesScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }));
    setCharadesTimerActive(false);
    getRandomCharadesWord();
  };

  const charadesSkip = () => {
    setCharadesScore(prev => ({ correct: prev.correct, total: prev.total + 1 }));
    setCharadesTimerActive(false);
    getRandomCharadesWord();
  };

  // 5-Second Rule helper functions
  const startFiveSecondRound = () => {
    const category = shuffledCategories[categoryIndex] || fiveSecondRuleCategories[0];
    setCurrentCategory(category);
    setFiveSecondTimer(5);
    setFiveSecondTimerActive(true);
    setRoundCompleted(false);
  };

  const fiveSecondSuccess = () => {
    setFiveSecondScore(prev => ({ success: prev.success + 1, total: prev.total + 1 }));
    setFiveSecondTimerActive(false);
    setCategoryIndex(prev => (prev + 1) % shuffledCategories.length);
    setRoundCompleted(true);
  };

  const fiveSecondFail = () => {
    setFiveSecondScore(prev => ({ success: prev.success, total: prev.total + 1 }));
    setFiveSecondTimerActive(false);
    setCategoryIndex(prev => (prev + 1) % shuffledCategories.length);
    setRoundCompleted(true);
  };

  const nextPrompt = () => {
    setCurrentPromptIndex(prev => (prev + 1) % wouldYouRatherQuestions.length);
  };

  const renderGameSelection = () => {
    return (
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">اختر لعبة للبدء</h2>
          <p className="text-slate-400 text-sm">انقر على اللعبة المفضلة لديك</p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {games.map((game) => (
            <div 
              key={game.id} 
              className="group bg-slate-700/40 backdrop-blur-sm rounded-2xl p-4 border border-slate-600/50 hover:border-cyan-400/60 hover:bg-slate-700/60 transition-all duration-300 cursor-pointer transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl" 
              onClick={() => startGame(game.id)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${game.color} flex items-center justify-center text-white shadow-lg group-hover:shadow-xl transition-all duration-300`}>
                  {game.icon}
                </div>
                <div className="flex-1 text-right">
                  <h3 className="text-lg font-bold text-white mb-1 group-hover:text-cyan-300 transition-colors">{game.nameAr}</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-2">{game.descriptionAr}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{game.duration} دقائق</span>
                    <div className="text-cyan-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1">
                      <span>ابدأ</span>
                      <ChevronLeft className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGameContent = () => {
    if (!selectedGameId) {
      return renderGameSelection();
    }

    const currentGame = games.find(g => g.id === selectedGameId);
    if (!currentGame) return null;

    if (gamePhase === "completed") {
      return (
        <div className="text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center text-white">
            <Trophy className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">انتهت اللعبة!</h2>
            <p className="text-slate-300 text-lg">أحسنتم! وقت للعبة التالية</p>
          </div>
          {currentGameIndex < games.length - 1 ? (
            <Button 
              onClick={nextGame}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-8 py-3 text-lg"
            >
              <ChevronRight className="w-5 h-5 mr-2" />
              اللعبة التالية
            </Button>
          ) : (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-white">🎉 انتهت جميع الألعاب! 🎉</h3>
              <p className="text-slate-300">شكراً لكم على المشاركة الرائعة!</p>
            </div>
          )}
        </div>
      );
    }

    // Playing phase
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center space-x-4 mb-4">
          </div>
        </div>

        {currentGame.id === "discussion-questions" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-4">
                  أسئلة للنقاش العميق
                </h3>
                <p className="text-slate-300 mb-4">
                  اختر موضوعاً وليجب كل مشارك على السؤال بالدور
                </p>
              </div>
              
              {/* Game Instructions */}
              <div className="bg-slate-700/30 rounded-lg p-4 mb-6">
                <h4 className="text-white font-semibold mb-3 flex items-center">
                  <Lightbulb className="w-4 h-4 ml-2" />
                  كيفية اللعب:
                </h4>
                <ol className="text-slate-300 text-sm space-y-2 list-decimal list-inside">
                  <li>اختاروا موضوعاً من القائمة أدناه</li>
                  <li>اقرؤوا السؤال بصوت عالٍ</li>
                  <li>يجيب كل شخص بالدور (2-3 دقائق لكل شخص)</li>
                  <li>استمعوا باهتمام ولا تقاطعوا المتحدث</li>
                  <li>يمكنكم طرح أسئلة متابعة بعد انتهاء الجميع</li>
                </ol>
              </div>

              <div className="text-center">
                <Button 
                  onClick={() => setShowPromptTopicsModal(true)}
                  className="bg-gradient-to-r from-cyan-700 to-blue-700 hover:from-cyan-800 hover:to-blue-800 text-white px-6 py-3 rounded-2xl shadow-lg font-bold text-lg transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 border-2 border-cyan-400/30"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  اختر أسئلة للنقاش
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentGame.id === "never-have-i-ever" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-4">لم أفعل من قبل</h3>
              </div>

              {/* Enhanced Game Instructions */}
              <div className="bg-gradient-to-r from-slate-700/40 to-slate-600/40 rounded-xl p-6 mb-8 border border-slate-600/50">
                <h4 className="text-white font-bold text-lg mb-4 flex items-center">
                  <Lightbulb className="w-5 h-5 ml-3 text-yellow-400" />
                  كيفية اللعب:
                </h4>
                <ol className="text-slate-200 space-y-3 list-decimal list-inside">
                  <li className="flex items-start">
                    <span className="font-medium">اقرؤوا العبارة بصوت عالٍ</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">إذا فعلت هذا الشيء من قبل، ارفع يدك وشارك تجربتك (دقيقة واحدة)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">إذا لم تفعله من قبل، ابق صامتاً</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">لا تجبروا أحداً على المشاركة إذا لم يرد</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">احترموا خصوصية بعضكم البعض</span>
                  </li>
                </ol>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4 mb-6 text-center">
                <p className="text-white text-lg font-semibold">
                  {shuffledNeverHaveIEver.length > 0 
                    ? shuffledNeverHaveIEver[currentPromptIndex % shuffledNeverHaveIEver.length]
                    : neverHaveIEverQuestions[currentPromptIndex % neverHaveIEverQuestions.length]
                  }
                </p>
              </div>

              <div className="flex justify-center space-x-3 mt-8">
                <Button 
                  onClick={() => setCurrentPromptIndex(prev => (prev + 1) % (shuffledNeverHaveIEver.length || neverHaveIEverQuestions.length))} 
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                >
                  <ChevronRight className="w-5 h-5 mr-2" />
                  السؤال التالي
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentGame.id === "two-truths-lie" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <div className="space-y-4 text-slate-300">
                <p>قل ثلاث عبارات عن نفسك:</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>حقيقة أولى</li>
                  <li>حقيقة ثانية</li>
                  <li>كذبة واحدة</li>
                </ul>
                <p className="text-sm">على الآخرين تخمين أي عبارة كاذبة!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {currentGame.id === "5-second-rule" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-4">قاعدة الخمس ثواني</h3>
                <p className="text-slate-400">سمّ 3 أشياء قبل انتهاء الوقت!</p>
              </div>

              {/* Game Instructions */}
              <div className="bg-gradient-to-r from-orange-700/40 to-red-700/40 rounded-xl p-6 mb-8 border border-orange-600/50">
                <h4 className="text-white font-bold text-lg mb-4 flex items-center">
                  <Lightbulb className="w-5 h-5 ml-3 text-orange-400" />
                  كيفية اللعب:
                </h4>
                <ol className="text-slate-200 space-y-3 list-decimal list-inside">
                  <li className="flex items-start">
                    <span className="font-medium">شخص واحد يضغط "ابدأ" ويقرأ الفئة بصوت عالٍ</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">عليه تسمية 3 أشياء من الفئة خلال 5 ثوان فقط!</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">إذا نجح: اضغطوا "نجح ✓" - إذا فشل: اضغطوا "فشل ✗"</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">تناوبوا بين أعضاء المجموعة - الجميع يلعب</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">لا يمكن تكرار نفس الإجابة مرتين!</span>
                  </li>
                </ol>
              </div>

              {/* Score Display */}
              <div className="flex justify-center mb-6">
                <div className="bg-gradient-to-r from-orange-700/50 to-red-700/50 rounded-xl px-6 py-3 border border-orange-500/30">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-300">
                      {fiveSecondScore.success}/{fiveSecondScore.total}
                    </div>
                    <div className="text-orange-200 text-sm font-medium">نجاحات</div>
                  </div>
                </div>
              </div>

              {/* Current Category Display */}
              {currentCategory && (
                <div className="mb-8">
                  <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border-2 border-orange-500/40 rounded-2xl p-8 text-center shadow-2xl">
                    {/* Category Title */}
                    <div className="mb-6">
                      <div className="inline-block bg-orange-500/30 px-4 py-2 rounded-full mb-3">
                        <span className="text-orange-300 text-sm font-bold">الفئة</span>
                      </div>
                      <h4 className="text-4xl font-bold text-white mb-2">
                        {currentCategory}
                      </h4>
                      <p className="text-orange-200 text-lg">سمّ 3 أشياء!</p>
                    </div>
                    
                    {/* Timer Display */}
                    <div className="mb-6">
                      <div className={`text-8xl font-black transition-all duration-300 ${
                        fiveSecondTimer <= 2 ? 'text-red-400 animate-pulse scale-110' : 
                        fiveSecondTimer <= 3 ? 'text-orange-400' : 'text-green-400'
                      }`}>
                        {fiveSecondTimer}
                      </div>
                      <Progress 
                        value={(fiveSecondTimer / 5) * 100} 
                        className="w-full mt-4 h-3"
                      />
                    </div>

                    {/* Action Buttons - Only show when timer is stopped */}
                    {!fiveSecondTimerActive && fiveSecondTimer === 0 && (
                      <div className="flex justify-center gap-3 mt-6">
                        <Button 
                          onClick={fiveSecondSuccess}
                          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 py-2 text-base font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                        >
                          <CheckCircle className="w-4 h-4 mr-1.5" />
                          نجح
                        </Button>
                        <Button 
                          onClick={fiveSecondFail}
                          className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white px-4 py-2 text-base font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                        >
                          <XCircle className="w-4 h-4 mr-1.5" />
                          فشل
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Start Round Button */}
              {!currentCategory || (!fiveSecondTimerActive && fiveSecondTimer === 0 && roundCompleted) ? (
                <div className="text-center">
                  <Button 
                    onClick={startFiveSecondRound}
                    className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white px-10 py-5 text-2xl font-black rounded-2xl shadow-2xl hover:shadow-orange-500/25 transition-all duration-300 transform hover:scale-110 animate-pulse"
                  >
                    <Timer className="w-8 h-8 mr-3" />
                    {currentCategory ? 'الفئة التالية' : 'ابدأ اللعبة!'}
                  </Button>
                  
                  {/* Category Progress */}
                  {shuffledCategories.length > 0 && (
                    <div className="mt-4 text-slate-400 text-sm">
                      الفئة {categoryIndex + 1} من {shuffledCategories.length}
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {currentGame.id === "would-you-rather" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-4">ماذا تفضل؟</h3>
              </div>

              {/* Game Instructions */}
              <div className="bg-slate-700/30 rounded-lg p-4 mb-6">
                <h4 className="text-white font-semibold mb-3 flex items-center">
                  <Lightbulb className="w-4 h-4 ml-2" />
                  كيفية اللعب:
                </h4>
                <ol className="text-slate-300 text-sm space-y-2 list-decimal list-inside">
                  <li>اقرؤوا الخيارين بصوت عالٍ</li>
                  <li>كل شخص يختار أحد الخيارين</li>
                  <li>اشرحوا سبب اختياركم (دقيقة لكل شخص)</li>
                  <li>ناقشوا الاختلافات في وجهات النظر</li>
                  <li>لا يوجد إجابة صحيحة أو خاطئة</li>
                </ol>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-center">
                  <div className="text-red-400 font-bold mb-2">الخيار أ</div>
                  <p className="text-white font-semibold">
                    {(shuffledWouldYouRather.length > 0 
                      ? shuffledWouldYouRather[currentPromptIndex]
                      : wouldYouRatherQuestions[currentPromptIndex]
                    )?.optionA}
                  </p>
                </div>
                <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 text-center">
                  <div className="text-blue-400 font-bold mb-2">الخيار ب</div>
                  <p className="text-white font-semibold">
                    {(shuffledWouldYouRather.length > 0 
                      ? shuffledWouldYouRather[currentPromptIndex]
                      : wouldYouRatherQuestions[currentPromptIndex]
                    )?.optionB}
                  </p>
                </div>
              </div>

              <div className="text-center">
                <Button 
                  onClick={nextPrompt} 
                  className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-6 py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                >
                  <ChevronRight className="w-5 h-5 mr-2" />
                  السؤال التالي
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentGame.id === "charades" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-4">ولا كلمة</h3>
              </div>

              {/* Game Instructions */}
              <div className="bg-gradient-to-r from-slate-700/40 to-slate-600/40 rounded-xl p-6 mb-8 border border-slate-600/50">
                <h4 className="text-white font-bold text-lg mb-4 flex items-center">
                  <Lightbulb className="w-5 h-5 ml-3 text-yellow-400" />
                  كيفية اللعب:
                </h4>
                <ol className="text-slate-200 space-y-3 list-decimal list-inside">
                  <li className="flex items-start">
                    <span className="font-medium">شخص واحد يقرأ الكلمة سراً (لا يقولها بصوت عالٍ)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">يمثل الكلمة بالحركات فقط - ممنوع الكلام أو الأصوات</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">الباقي يحاولون تخمين الكلمة خلال دقيقة ونصف</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">إذا خمنوا صح: اضغطوا "صحيح" - إذا لم يخمنوا: اضغطوا "تخطي"</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium">تناوبوا الأدوار - كل شخص يمثل كلمة</span>
                  </li>
                </ol>
              </div>

              {/* Score Display */}
              <div className="flex justify-center mb-6">
                <div className="bg-slate-700/50 rounded-lg px-6 py-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">
                      {charadesScore.correct}/{charadesScore.total}
                    </div>
                    <div className="text-slate-300 text-sm">نقاط صحيحة</div>
                  </div>
                </div>
              </div>

              {/* Current Word Display */}
              {currentCharadesWord && (
                <div className="mb-8">
                  <div className="bg-gradient-to-r from-green-500/20 to-teal-500/20 border border-green-500/30 rounded-xl p-6 text-center">
                    <div className="mb-2">
                      <span className="text-green-400 text-sm font-medium bg-green-500/20 px-3 py-1 rounded-full">
                        {currentCharadesCategory}
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-white mb-4">
                      {currentCharadesWord}
                    </div>
                    
                    {/* Timer */}
                    <div className="mb-4">
                      <div className={`text-2xl font-bold ${
                        charadesTimer <= 15 ? 'text-red-400 animate-pulse' : 
                        charadesTimer <= 45 ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {Math.floor(charadesTimer / 60)}:{(charadesTimer % 60).toString().padStart(2, '0')}
                      </div>
                      <Progress 
                        value={(charadesTimer / 90) * 100} 
                        className="w-full mt-2"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-center gap-4">
                      <Button 
                        onClick={charadesCorrect}
                        disabled={charadesTimer === 0}
                        className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-6 py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                      >
                        <ThumbsUp className="w-5 h-5 mr-2" />
                        صحيح!
                      </Button>
                      <Button 
                        onClick={charadesSkip}
                        disabled={charadesTimer === 0}
                        className="bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white px-6 py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                      >
                        <SkipForward className="w-5 h-5 mr-2" />
                        تخطي
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Start/Next Round Button */}
              {!currentCharadesWord && (
                <div className="text-center">
                  <Button 
                    onClick={startCharadesRound}
                    className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white px-8 py-4 text-xl font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  >
                    <Play className="w-6 h-6 mr-3" />
                    ابدأ الجولة
                  </Button>
                </div>
              )}

              {/* Next Round Button (when timer ends) */}
              {currentCharadesWord && charadesTimer === 0 && (
                <div className="text-center mt-6">
                  <Button 
                    onClick={startCharadesRound}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  >
                    <ChevronRight className="w-5 h-5 mr-2" />
                    الكلمة التالية
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}


      </div>
    );
  };

  if (!gameStarted) {
    return (
      <>
        {/* Prompt Topics Modal */}
      <PromptTopicsModal
        open={showPromptTopicsModal}
        onClose={() => setShowPromptTopicsModal(false)}
      />

      {/* Group Guide Popup - Render FIRST to ensure it's on top */}
        {showGroupGuide && (
          <div 
            className="fixed z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', zIndex: 9999 }}
            dir="rtl"
          >
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 relative overflow-hidden p-6 animate-in zoom-in-95 duration-300">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  مرحباً بك في الأنشطة الجماعية! 🎉
                </h2>
                <p className="text-slate-300 text-sm">
                  استعد لتجربة ممتعة مع مجموعتك
                </p>
              </div>

              {/* Instructions */}
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3 p-4 bg-purple-500/10 border border-purple-400/30 rounded-xl">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-300 font-bold">1</span>
                  </div>
                  <div>
                    <p className="text-purple-100 font-semibold mb-1">
                      اذهب إلى طاولتك
                    </p>
                    <p className="text-slate-300 text-sm">
                      {tableNumber ? `طاولة رقم ${tableNumber}` : 'ستظهر لك طاولتك عند تخصيص المجموعات'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-400/30 rounded-xl">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-300 font-bold">2</span>
                  </div>
                  <div>
                    <p className="text-blue-100 font-semibold mb-1">
                      تعرف على مجموعتك
                    </p>
                    <p className="text-slate-300 text-sm">
                      ستكون مع 3-5 أشخاص آخرين - رحب بهم وابدأ بالتعارف
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-400/30 rounded-xl">
                  <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-green-300 font-bold">3</span>
                  </div>
                  <div>
                    <p className="text-green-100 font-semibold mb-1">
                      اختر نشاطاً وابدأ
                    </p>
                    <p className="text-slate-300 text-sm">
                      اختاروا من الأنشطة المتاحة واستمتعوا بوقتكم معاً
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-400/30 rounded-xl">
                  <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-orange-300" />
                  </div>
                  <div>
                    <p className="text-orange-100 font-semibold mb-1">
                      استمتع وكن منفتحاً
                    </p>
                    <p className="text-slate-300 text-sm">
                      هذه فرصة رائعة لتكوين صداقات جديدة وتبادل الأفكار
                    </p>
                  </div>
                </div>
              </div>

              {/* Action button */}
              <button
                onClick={() => setShowGroupGuide(false)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-700 hover:from-purple-700 hover:to-pink-800 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
              >
                فهمت، لنبدأ! 🚀
              </button>
            </div>
          </div>
        )}

        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" dir="rtl">
        <div className="max-w-md mx-auto px-4 py-6">
          {/* Mobile-First Header */}
          <div className="text-center mb-6">
            <div className="relative inline-block mb-4">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600 flex items-center justify-center shadow-2xl">
                <Users className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 leading-tight">ألعاب جماعية</h1>
            <p className="text-slate-400 text-base">30 دقيقة من المرح والتفاعل</p>
          </div>

          {/* Navigation Bar - Similar to main page */}
          {dataLoaded && participantName && participantNumber && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-slate-800/40 to-slate-700/40 rounded-full px-4 py-3 border border-slate-600/50 shadow-md backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  {/* Logo */}
                  <div 
                    onClick={() => window.location.href = "/welcome"}
                    className="cursor-pointer transition-all duration-200 hover:opacity-80"
                  >
                    <img 
                      src={logoPng} 
                      alt="BlindMatch" 
                      className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 object-contain" 
                    />
                  </div>

                  {/* Participant Info */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent font-bold text-sm">
                        #{participantNumber}
                      </div>
                      <span className="text-white/90 text-sm font-medium">
                        {participantName}
                      </span>
                    </div>

                    {/* Table Number */}
                    {(tableNumber !== null && tableNumber !== undefined) && (
                      <>
                        <div className="w-px h-4 bg-slate-600"></div>
                        <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30 rounded-full px-3 py-1.5 text-xs font-medium text-green-300 flex items-center gap-1.5">
                          <Target className="w-3 h-3" />
                          <span>طاولة {tableNumber}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mobile-First Instructions */}
          <div className="mb-6">
            <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-600/50 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 p-4 border-b border-slate-600/50">
                <h2 className="text-lg font-bold text-white flex items-center justify-center">
                  <BookOpen className="w-5 h-5 ml-2" />
                  كيف نلعب؟
                </h2>
              </div>
              <div className="p-4 space-y-3">
                {/* Compact Steps */}
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center gap-3 bg-slate-700/30 rounded-xl p-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold text-xs">1</div>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">اجلسوا في دائرة واختاروا من يبدأ</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-700/30 rounded-xl p-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center text-white font-bold text-xs">2</div>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">اتبعوا قواعد كل لعبة واستمتعوا</p>
                    </div>
                  </div>
                </div>

                {/* Timer Info */}
                <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 rounded-xl p-3 mt-4">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-300" />
                    <span className="text-cyan-200 font-medium text-sm">30 دقيقة → ثم الجولات الفردية</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Games Preview */}
          <div className="mb-6">
            <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-600/50 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 p-4 border-b border-slate-600/50">
                <h2 className="text-lg font-bold text-white flex items-center justify-center">
                  <Sparkles className="w-5 h-5 ml-2" />
                  الألعاب المتاحة
                </h2>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                {games.map((game, index) => (
                  <div key={game.id} className="bg-slate-700/40 rounded-xl p-3 text-center">
                    <div className={`w-10 h-10 mx-auto mb-2 rounded-xl bg-gradient-to-r ${game.color} flex items-center justify-center text-white shadow-lg`}>
                      {game.icon}
                    </div>
                    <h3 className="text-white font-medium text-sm mb-1">{game.nameAr}</h3>
                    <p className="text-slate-400 text-xs">{game.duration} دقائق</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile Action Buttons */}
          <div className="space-y-3 mt-6">
            <Button 
              onClick={startSession}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white py-4 text-lg font-bold rounded-2xl shadow-xl hover:shadow-cyan-500/25 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-6 h-6 ml-2" />
              ابدأ الجلسة الآن
            </Button>
            
            <Button 
              onClick={() => window.location.href = "/welcome"}
              variant="outline"
              className="w-full bg-slate-700/30 border-slate-500 text-white hover:bg-slate-600/50 hover:border-slate-400 py-3 rounded-xl transition-all duration-300"
            >
              <Home className="w-4 h-4 ml-2" />
              العودة للشاشة الرئيسية
            </Button>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      {/* Prompt Topics Modal - Available in both pre-game and during-game */}
      <PromptTopicsModal
        open={showPromptTopicsModal}
        onClose={() => setShowPromptTopicsModal(false)}
      />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" dir="rtl">
      <div className="max-w-md mx-auto px-4 py-4">
        {/* Mobile-Optimized Header */}
        <div className="bg-slate-800/60 backdrop-blur-xl rounded-2xl p-4 mb-4 border border-slate-600/50 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            {/* Logo */}
            <div 
              onClick={() => window.location.href = "/"}
              className="cursor-pointer transition-all duration-200 hover:opacity-80"
            >
              <img 
                src={logoPng} 
                alt="BlindMatch" 
                className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 object-contain" 
              />
            </div>

            {/* Back Button */}
            {selectedGameId && (
              <button
                onClick={() => {
                  setSelectedGameId(null);
                  setGamePhase('intro');
                }}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-700/50 border border-slate-600/50 hover:border-cyan-400/50 hover:bg-cyan-400/10 transition-all duration-200 text-slate-300 hover:text-cyan-300 text-sm font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                عودة
              </button>
            )}
          </div>

          {/* Timer & Game Info - Stacked */}
          <div className="space-y-2">
            {/* Timer */}
            <div className="flex items-center justify-center gap-2 bg-slate-700/40 rounded-xl p-3">
              <Clock className={`w-5 h-5 ${timeRemaining <= 300 ? 'text-red-400' : timeRemaining <= 600 ? 'text-yellow-400' : 'text-green-400'}`} />
              <span className={`text-xl font-bold ${timeRemaining <= 300 ? 'text-red-400 animate-pulse' : timeRemaining <= 600 ? 'text-yellow-400' : 'text-green-400'}`}>
                {formatTime(timeRemaining)}
              </span>
            </div>

            {/* Current Game */}
            <div className="flex items-center justify-center gap-2 bg-slate-700/40 rounded-xl p-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-cyan-400">
                {selectedGameId ? games.find(g => g.id === selectedGameId)?.nameAr : 'اختر لعبة'}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Game Content */}
        <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-600/50 rounded-2xl p-4 shadow-xl">
          {renderGameContent()}
        </div>

      </div>

      {/* Time Up Modal */}
      {showTimeUpModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center">
              <Clock className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">انتهى الوقت!</h2>
            <p className="text-xl text-slate-300 mb-6">حان وقت الجولة الأولى</p>
            <p className="text-slate-400 mb-8">شكراً لكم على المشاركة الرائعة في الألعاب الجماعية</p>
            <Button 
              onClick={() => {
                setShowTimeUpModal(false);
                // You can add navigation to round 1 here
                window.location.href = "/";
              }}
              className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white px-8 py-3 text-lg w-full"
            >
              انتقل للجولة الأولى
            </Button>
          </div>
        </div>
      )}

      {/* Individual Rounds Preparation Modal */}
      {showIndividualRoundsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-400/50 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center animate-pulse">
                <Smartphone className="w-10 h-10 text-white" />
              </div>
            </div>

            {/* Title */}
            <h3 className="text-2xl font-bold text-center mb-4 text-white">
              استعد للجولات الفردية
            </h3>

            {/* Instructions */}
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3 p-4 bg-cyan-500/10 border border-cyan-400/30 rounded-xl">
                <LinkIcon className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-cyan-100 font-semibold mb-1">
                    افتح رابط الواتساب
                  </p>
                  <p className="text-slate-300 text-sm">
                    افتح الرابط الذي أرسلناه لك عبر الواتساب للدخول إلى الجولات الفردية
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-400/30 rounded-xl">
                <Smartphone className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-blue-100 font-semibold mb-1">
                    ابقِ هاتفك مفتوحاً
                  </p>
                  <p className="text-slate-300 text-sm">
                    احتفظ بهاتفك مفتوحاً ومشحوناً للحصول على التحديثات الفورية
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-purple-500/10 border border-purple-400/30 rounded-xl">
                <Bell className="w-6 h-6 text-purple-400 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-purple-100 font-semibold mb-1">
                    كن جاهزاً للمطابقة
                  </p>
                  <p className="text-slate-300 text-sm">
                    ستبدأ الجولات الفردية قريباً - تأكد من جاهزيتك!
                  </p>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <Button
              onClick={() => setShowIndividualRoundsModal(false)}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold py-3 text-lg"
            >
              فهمت
            </Button>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
