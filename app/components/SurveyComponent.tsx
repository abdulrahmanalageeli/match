import React, { useState } from "react"
import { Button } from "../../components/ui/button"
import { Checkbox } from "../../components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Label } from "../../components/ui/label"
import { Textarea } from "../../components/ui/textarea"
import { Input } from "../../components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Progress } from "../../components/ui/progress"
import { ChevronLeft, ChevronRight, Shield, AlertTriangle, CheckCircle } from "lucide-react"

interface SurveyData {
  gender: string
  ageGroup: string
  participationGoal: string
  educationLevel: string
  coreValues: string[]
  mentalOpenness: string
  weekendStyle: string
  thinkingStyle: string
  decisionMaking: string
  organizationStyle: string
  emotionalExpression: string
  adventureVsStability: string
  dailyActivity: string
  familyRelationship: string
  childrenDesire: string
  conflictResolution: string
  hobbies: string[]
  energyPattern: string
  dietaryPreferences: string
  healthImportance: string
  smokingAlcohol: string
  cleanlinessInterest: string
  petsOpinion: string
  relationshipView: string
  redLines: string[]
  termsAccepted: boolean
  dataConsent: boolean
}

const surveyQuestions = [
  {
    id: "gender",
    question: "الجنس: ما هو جنسك؟",
    type: "radio",
    options: [
      { value: "male", label: "ذكر" },
      { value: "female", label: "أنثى" }
    ],
    required: true
  },
  {
    id: "ageGroup",
    question: "الفئة العمرية: أي فئة عمرية تناسب عمرك؟",
    type: "radio",
    options: [
      { value: "under20", label: "أقل من 20 سنة" },
      { value: "20-30", label: "20-30 سنة" },
      { value: "31-40", label: "31-40 سنة" },
      { value: "41-50", label: "41-50 سنة" },
      { value: "over50", label: "أكبر من 50 سنة" }
    ],
    required: true
  },
  {
    id: "participationGoal",
    question: "هدف المشاركة: ما الهدف الأساسي من مشاركتك في هذا اللقاء؟",
    type: "radio",
    options: [
      { value: "friendship", label: "تكوين صداقات فقط" },
      { value: "romantic", label: "البحث عن علاقة رومانسية جادة" },
      { value: "open", label: "منفتح على الصداقة والعلاقة" }
    ],
    required: true
  },
  {
    id: "educationLevel",
    question: "المستوى التعليمي: ما هو أعلى مستوى تعليمي وصلت إليه؟",
    type: "radio",
    options: [
      { value: "highschool", label: "ثانوي أو أقل" },
      { value: "bachelor", label: "بكالوريوس" },
      { value: "masters", label: "ماجستير/دكتوراه أو أعلى" }
    ],
    required: true
  },
  {
    id: "coreValues",
    question: "القيم الجوهرية: ما هي أهم ثلاث قيم تمثّلك وتريد أن يشاركك الطرف الآخر بها؟",
    type: "checkbox",
    options: [
      { value: "honesty", label: "الأمانة" },
      { value: "ambition", label: "الطموح" },
      { value: "independence", label: "الاستقلالية" },
      { value: "familyLove", label: "حب العائلة" },
      { value: "spirituality", label: "الروحانية أو التدين" },
      { value: "openness", label: "الانفتاح وتقبل الآخر" },
      { value: "emotionalStability", label: "الاستقرار العاطفي" },
      { value: "humor", label: "الحس الفكاهي" }
    ],
    maxSelections: 3,
    required: true
  },
  {
    id: "mentalOpenness",
    question: "مدى الانفتاح الذهني: أي العبارة الأقرب لك؟",
    type: "radio",
    options: [
      { value: "traditional", label: "تقليدي وملتزم دينيًا" },
      { value: "balanced", label: "متوازن بين التقاليد والانفتاح" },
      { value: "fullyOpen", label: "منفتح بالكامل" }
    ],
    required: true
  },
  {
    id: "weekendStyle",
    question: "نمط عطلة نهاية الأسبوع المفضل:",
    type: "radio",
    options: [
      { value: "social", label: "حضور فعاليات أو مقابلة أصدقاء" },
      { value: "quiet", label: "الجلوس في المنزل أو بجو هادئ" }
    ],
    required: true
  },
  {
    id: "thinkingStyle",
    question: "طريقة التفكير واستقبال المعلومات:",
    type: "radio",
    options: [
      { value: "practical", label: "أركز على الواقع والتفاصيل" },
      { value: "imaginative", label: "أُحب الخيال والرؤية المستقبلية" }
    ],
    required: true
  },
  {
    id: "decisionMaking",
    question: "اتخاذ القرارات:",
    type: "radio",
    options: [
      { value: "logical", label: "أعتمد على المنطق والعقل" },
      { value: "emotional", label: "أعتمد على المشاعر والجانب الإنساني" }
    ],
    required: true
  },
  {
    id: "organizationStyle",
    question: "التنظيم والعفوية:",
    type: "radio",
    options: [
      { value: "organized", label: "أحب الجداول والخطط" },
      { value: "spontaneous", label: "أحب العفوية والمرونة" }
    ],
    required: true
  },
  {
    id: "emotionalExpression",
    question: "أسلوب التعبير العاطفي:",
    type: "radio",
    options: [
      { value: "direct", label: "صريح ومباشر" },
      { value: "reserved", label: "كتوم وأحتاج وقت" }
    ],
    required: true
  },
  {
    id: "adventureVsStability",
    question: "المغامرة مقابل الاستقرار:",
    type: "radio",
    options: [
      { value: "adventure", label: "أبحث عن التجربة والتجديد دائمًا" },
      { value: "stability", label: "أفضّل الراحة والاستقرار" }
    ],
    required: true
  },
  {
    id: "dailyActivity",
    question: "النشاط اليومي:",
    type: "radio",
    options: [
      { value: "morning", label: "صباحي" },
      { value: "night", label: "ليلي" }
    ],
    required: true
  },
  {
    id: "familyRelationship",
    question: "علاقتك بالعائلة:",
    type: "radio",
    options: [
      { value: "strong", label: "قوية جدًا وأتوقع نفس الشيء من الطرف الآخر" },
      { value: "balanced", label: "متوازنة" },
      { value: "independent", label: "مستقلة ولا أتوقع مشاركة عائلية" }
    ],
    required: true
  },
  {
    id: "childrenDesire",
    question: "هل ترغب في إنجاب أطفال مستقبلًا؟",
    type: "radio",
    options: [
      { value: "yes", label: "نعم" },
      { value: "maybe", label: "ربما لاحقًا" },
      { value: "no", label: "لا" },
      { value: "unsure", label: "غير متأكد" }
    ],
    required: true
  },
  {
    id: "conflictResolution",
    question: "كيف تتعامل مع الخلافات؟",
    type: "radio",
    options: [
      { value: "direct", label: "أواجه مباشرة وبهدوء" },
      { value: "time", label: "أحتاج بعض الوقت ثم أناقش" },
      { value: "avoid", label: "أتجنب المواجهة غالبًا" }
    ],
    required: true
  },
  {
    id: "hobbies",
    question: "الهوايات: اختر 3 فقط من التالية:",
    type: "checkbox",
    options: [
      { value: "reading", label: "القراءة" },
      { value: "movies", label: "الأفلام والمسلسلات" },
      { value: "sports", label: "الرياضة" },
      { value: "gaming", label: "ألعاب الفيديو" },
      { value: "travel", label: "السفر" },
      { value: "nature", label: "الطبيعة والكشتات" },
      { value: "cooking", label: "الطبخ" },
      { value: "volunteering", label: "التطوع والخدمة" },
      { value: "music", label: "الموسيقى" }
    ],
    maxSelections: 3,
    required: true
  },
  {
    id: "energyPattern",
    question: "وصف نمط الطاقة:",
    type: "radio",
    options: [
      { value: "energetic", label: "نشيط ومتحرك" },
      { value: "calm", label: "هادئ ومسترخٍ" }
    ],
    required: true
  },
  {
    id: "dietaryPreferences",
    question: "النظام الغذائي أو تفضيلات الطعام:",
    type: "text",
    placeholder: "مثال: آكل كل شيء – نباتي – لا أحب المأكولات البحرية – حمية خاصة...",
    required: true
  },
  {
    id: "healthImportance",
    question: "مدى أهمية الصحة والرياضة:",
    type: "radio",
    options: [
      { value: "veryImportant", label: "مهمة جدًا" },
      { value: "moderate", label: "معتدلة" },
      { value: "notImportant", label: "غير مهمة" }
    ],
    required: true
  },
  {
    id: "smokingAlcohol",
    question: "موقفك من التدخين/الكحول:",
    type: "radio",
    options: [
      { value: "noProblem", label: "لا مشكلة" },
      { value: "lightAcceptable", label: "مقبول إذا كان خفيف" },
      { value: "notAcceptable", label: "لا أقبل إطلاقًا" }
    ],
    required: true
  },
  {
    id: "cleanlinessInterest",
    question: "مدى اهتمامك بالنظافة والتنظيم:",
    type: "radio",
    options: [
      { value: "veryImportant", label: "أحب النظام والنظافة دائمًا" },
      { value: "flexible", label: "مرن وبعض الفوضى لا تزعجني" },
      { value: "notImportant", label: "لا أهتم كثيرًا" }
    ],
    required: true
  },
  {
    id: "petsOpinion",
    question: "رأيك في الحيوانات الأليفة:",
    type: "radio",
    options: [
      { value: "love", label: "أحبها" },
      { value: "okay", label: "لا مانع" },
      { value: "dislike", label: "لا أحبها أو لدي حساسية" }
    ],
    required: true
  },
  {
    id: "relationshipView",
    question: "ما الذي يمثّل نظرتك للعلاقة العاطفية الناجحة؟",
    type: "radio",
    options: [
      { value: "stable", label: "علاقة مستقرة وطويلة المدى مبنية على الالتزام والخصوصية" },
      { value: "flexible", label: "علاقة مرنة يمكن أن تتطوّر تدريجيًا حسب الظروف" },
      { value: "individual", label: "أؤمن بأن العلاقات تختلف من شخص لآخر ولا أضع نمطًا محددًا" }
    ],
    required: true
  },
  {
    id: "redLines",
    question: "الخطوط الحمراء: ما هي أهم 3 صفات أو تصرفات تعتبرها غير قابلة للتسامح في علاقة (عاطفية أو صداقة)؟",
    type: "text",
    placeholder: "مثال: الكذب، التدخين، عدم النظافة",
    required: true
  }
]

const questionsPerPage = 3

export default function SurveyComponent({ onSubmit }: { onSubmit: (data: SurveyData) => void }) {
  const [currentPage, setCurrentPage] = useState(0)
  const [surveyData, setSurveyData] = useState<SurveyData>({
    gender: "",
    ageGroup: "",
    participationGoal: "",
    educationLevel: "",
    coreValues: [],
    mentalOpenness: "",
    weekendStyle: "",
    thinkingStyle: "",
    decisionMaking: "",
    organizationStyle: "",
    emotionalExpression: "",
    adventureVsStability: "",
    dailyActivity: "",
    familyRelationship: "",
    childrenDesire: "",
    conflictResolution: "",
    hobbies: [],
    energyPattern: "",
    dietaryPreferences: "",
    healthImportance: "",
    smokingAlcohol: "",
    cleanlinessInterest: "",
    petsOpinion: "",
    relationshipView: "",
    redLines: [],
    termsAccepted: false,
    dataConsent: false
  })

  const totalPages = Math.ceil(surveyQuestions.length / questionsPerPage) + 1 // +1 for terms page
  const progress = ((currentPage + 1) / totalPages) * 100

  const handleInputChange = (questionId: string, value: string | string[]) => {
    setSurveyData(prev => ({
      ...prev,
      [questionId]: value
    }))
  }

  const handleCheckboxChange = (questionId: string, value: string, checked: boolean) => {
    setSurveyData(prev => {
      const currentValues = (prev as any)[questionId] as string[]
      if (checked) {
        const question = surveyQuestions.find(q => q.id === questionId)
        if (question?.maxSelections && currentValues.length >= question.maxSelections) {
          return prev // Don't add if max reached
        }
        return {
          ...prev,
          [questionId]: [...currentValues, value]
        }
      } else {
        return {
          ...prev,
          [questionId]: currentValues.filter(v => v !== value)
        }
      }
    })
  }

  const isPageValid = (page: number) => {
    if (page === totalPages - 1) {
      return surveyData.termsAccepted && surveyData.dataConsent
    }
    
    const startIndex = page * questionsPerPage
    const endIndex = Math.min(startIndex + questionsPerPage, surveyQuestions.length)
    
    for (let i = startIndex; i < endIndex; i++) {
      const question = surveyQuestions[i]
      const value = surveyData[question.id as keyof SurveyData]
      
      if (question.required) {
        if (Array.isArray(value)) {
          if (value.length === 0) return false
        } else {
          if (!value || value === "") return false
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
    if (surveyData.termsAccepted && surveyData.dataConsent) {
      onSubmit(surveyData)
    }
  }

  const renderQuestion = (question: any) => {
    const value = surveyData[question.id as keyof SurveyData]

    switch (question.type) {
      case "radio":
        return (
          <RadioGroup
            value={value as string}
            onValueChange={(val) => handleInputChange(question.id, val)}
            className="space-y-4"
          >
            {question.options.map((option: any) => (
              <div key={option.value} className="group">
                <div className="flex items-center space-x-4 space-x-reverse">
                  <RadioGroupItem 
                    value={option.value} 
                    id={`${question.id}-${option.value}`} 
                    className="w-5 h-5 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20"
                  />
                  <Label 
                    htmlFor={`${question.id}-${option.value}`} 
                    className="text-right cursor-pointer text-lg font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1 leading-relaxed"
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
          <div className="space-y-4">
            {question.options.map((option: any) => (
              <div key={option.value} className="group">
                <div className="flex items-center space-x-4 space-x-reverse">
                  <Checkbox
                    id={`${question.id}-${option.value}`}
                    checked={(value as string[]).includes(option.value)}
                    onCheckedChange={(checked) => 
                      handleCheckboxChange(question.id, option.value, checked as boolean)
                    }
                    className="w-5 h-5 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20"
                  />
                  <Label 
                    htmlFor={`${question.id}-${option.value}`} 
                    className="text-right cursor-pointer text-lg font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1 leading-relaxed"
                  >
                    {option.label}
                  </Label>
                </div>
              </div>
            ))}
            {question.maxSelections && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-right mt-3 bg-white/50 dark:bg-slate-700/50 px-4 py-2 rounded-xl">
                اختر {question.maxSelections} فقط
              </p>
            )}
          </div>
        )

      case "text":
        return (
          <div className="relative">
            <Textarea
              value={value as string}
              onChange={(e) => handleInputChange(question.id, e.target.value)}
              placeholder={question.placeholder}
              className="min-h-[120px] text-right border-2 border-gray-200 dark:border-slate-600 rounded-2xl px-6 py-4 text-lg transition-all duration-300 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm resize-none"
            />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none"></div>
          </div>
        )

      default:
        return null
    }
  }

  const renderTermsPage = () => (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <div className="relative inline-block mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-ping"></div>
        </div>
        <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3">الشروط والأحكام</h2>
        <p className="text-lg text-gray-600 dark:text-gray-400">يرجى قراءة والموافقة على الشروط التالية</p>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-800 dark:to-slate-700 rounded-3xl p-8 border-2 border-blue-200 dark:border-blue-700 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-xl font-bold text-blue-800 dark:text-blue-200">
            شروط الخصوصية وحماية البيانات
          </h3>
        </div>
        <div className="space-y-4 text-right">
          <div className="space-y-4 text-base">
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200">
                <strong className="text-blue-600 dark:text-blue-400">1. جمع البيانات:</strong> نقوم بجمع بياناتك الشخصية لغرض التوافق والمطابقة فقط.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200">
                <strong className="text-blue-600 dark:text-blue-400">2. استخدام البيانات:</strong> تستخدم البيانات حصرياً لتحليل التوافق وتقديم خدمات المطابقة.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200">
                <strong className="text-blue-600 dark:text-blue-400">3. حماية البيانات:</strong> نلتزم بمعايير حماية البيانات السعودية (PDPL) ونحافظ على سرية معلوماتك.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200">
                <strong className="text-blue-600 dark:text-blue-400">4. الذكاء الاصطناعي:</strong> نستخدم تقنيات الذكاء الاصطناعي المطابقة للوائح السعودية.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200">
                <strong className="text-blue-600 dark:text-blue-400">5. حقوقك:</strong> يمكنك طلب حذف بياناتك أو تعديلها في أي وقت.
              </p>
            </div>
            <div className="bg-white/70 dark:bg-slate-700/70 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-gray-700 dark:text-gray-200">
                <strong className="text-blue-600 dark:text-blue-400">6. الأمان:</strong> نستخدم تقنيات تشفير متقدمة لحماية بياناتك.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="group">
          <div className="flex items-center space-x-4 space-x-reverse bg-white/80 dark:bg-slate-800/80 rounded-2xl p-6 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-400 transition-all duration-300">
            <Checkbox
              id="terms"
              checked={surveyData.termsAccepted}
              onCheckedChange={(checked) => 
                setSurveyData(prev => ({ ...prev, termsAccepted: checked as boolean }))
              }
              className="w-6 h-6 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20"
            />
            <Label htmlFor="terms" className="text-right cursor-pointer text-lg font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1">
              أوافق على الشروط والأحكام
            </Label>
          </div>
        </div>

        <div className="group">
          <div className="flex items-center space-x-4 space-x-reverse bg-white/80 dark:bg-slate-800/80 rounded-2xl p-6 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-400 transition-all duration-300">
            <Checkbox
              id="dataConsent"
              checked={surveyData.dataConsent}
              onCheckedChange={(checked) => 
                setSurveyData(prev => ({ ...prev, dataConsent: checked as boolean }))
              }
              className="w-6 h-6 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20"
            />
            <Label htmlFor="dataConsent" className="text-right cursor-pointer text-lg font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1">
              أوافق على معالجة بياناتي الشخصية وفقاً لسياسة الخصوصية
            </Label>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header with Progress */}
        <div className="mb-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-full px-6 py-3 shadow-lg">
              <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                اكتشف توأم روحك
              </span>
            </div>
          </div>
          
          {/* Enhanced Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">التقدم</span>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{currentPage + 1} من {totalPages}</span>
            </div>
            <div className="relative">
              <div className="h-3 bg-white/50 dark:bg-slate-800/50 rounded-full overflow-hidden backdrop-blur-sm">
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
        <div className="space-y-6">
          {currentPage === totalPages - 1 ? (
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-700/50 p-8">
              {renderTermsPage()}
            </div>
          ) : (
            <div className="space-y-6">
                              {surveyQuestions
                  .slice(currentPage * questionsPerPage, (currentPage + 1) * questionsPerPage)
                  .map((question, index) => (
                    <div key={question.id} className="group animate-slide-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
                      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-700/50 p-8 transition-all duration-300 hover:shadow-3xl hover:scale-[1.02] hover:bg-white/90 dark:hover:bg-slate-800/90 hover:animate-glow">
                      <div className="flex items-start gap-4">
                        <div className="relative">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg">
                            {currentPage * questionsPerPage + index + 1}
                          </div>
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-ping"></div>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6 text-right leading-relaxed">
                            {question.question}
                          </h3>
                          <div className="space-y-4">
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
        <div className="flex justify-between items-center mt-12">
          <Button
            onClick={prevPage}
            disabled={currentPage === 0}
            variant="outline"
            className="flex items-center gap-3 px-6 py-3 rounded-2xl border-2 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-400 transition-all duration-300 hover:shadow-lg disabled:opacity-50"
          >
            <ChevronRight className="w-5 h-5" />
            <span className="font-medium">السابق</span>
          </Button>

          {currentPage === totalPages - 1 ? (
            <Button
              onClick={handleSubmit}
              disabled={!surveyData.termsAccepted || !surveyData.dataConsent}
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:transform-none"
            >
              <CheckCircle className="w-5 h-5" />
              <span>إرسال الاستبيان</span>
            </Button>
          ) : (
            <Button
              onClick={nextPage}
              disabled={!isPageValid(currentPage)}
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:transform-none"
            >
              <span>التالي</span>
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
} 