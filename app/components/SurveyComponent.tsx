import React, { useState, useEffect, useMemo, useCallback } from "react"
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
}

const surveyQuestions = [
  {
    id: "gender",
    question: "الجنس: ما هو جنسك؟",
    type: "radio",
    options: [
      { value: "ذكر", label: "ذكر" },
      { value: "أنثى", label: "أنثى" }
    ],
    required: true
  },
  {
    id: "ageGroup",
    question: "الفئة العمرية: أي فئة عمرية تناسب عمرك؟",
    type: "radio",
    options: [
      { value: "أقل من 20 سنة", label: "أقل من 20 سنة" },
      { value: "20-30 سنة", label: "20-30 سنة" },
      { value: "31-40 سنة", label: "31-40 سنة" },
      { value: "41-50 سنة", label: "41-50 سنة" },
      { value: "أكبر من 50 سنة", label: "أكبر من 50 سنة" }
    ],
    required: true
  },
  {
    id: "participationGoal",
    question: "هدف المشاركة: ما الهدف الأساسي من مشاركتك في هذا اللقاء؟",
    type: "radio",
    options: [
      { value: "تكوين صداقات فقط", label: "تكوين صداقات فقط" },
      { value: "البحث عن علاقة رومانسية جادة", label: "البحث عن علاقة رومانسية جادة" },
      { value: "منفتح على الصداقة والعلاقة", label: "منفتح على الصداقة والعلاقة" }
    ],
    required: true
  },
  {
    id: "educationLevel",
    question: "المستوى التعليمي: ما هو أعلى مستوى تعليمي وصلت إليه؟",
    type: "radio",
    options: [
      { value: "ثانوي أو أقل", label: "ثانوي أو أقل" },
      { value: "بكالوريوس", label: "بكالوريوس" },
      { value: "ماجستير/دكتوراه أو أعلى", label: "ماجستير/دكتوراه أو أعلى" }
    ],
    required: true
  },
  {
    id: "coreValues",
    question: "القيم الجوهرية: ما هي أهم ثلاث قيم تمثّلك وتريد أن يشاركك الطرف الآخر بها؟",
    type: "checkbox",
    options: [
      { value: "الأمانة", label: "الأمانة" },
      { value: "الطموح", label: "الطموح" },
      { value: "الاستقلالية", label: "الاستقلالية" },
      { value: "حب العائلة", label: "حب العائلة" },
      { value: "الروحانية أو التدين", label: "الروحانية أو التدين" },
      { value: "الانفتاح وتقبل الآخر", label: "الانفتاح وتقبل الآخر" },
      { value: "الاستقرار العاطفي", label: "الاستقرار العاطفي" },
      { value: "الحس الفكاهي", label: "الحس الفكاهي" }
    ],
    maxSelections: 3,
    required: true
  },
  {
    id: "mentalOpenness",
    question: "مدى الانفتاح الذهني: أي العبارة الأقرب لك؟",
    type: "radio",
    options: [
      { value: "تقليدي وملتزم دينيًا", label: "تقليدي وملتزم دينيًا" },
      { value: "متوازن بين التقاليد والانفتاح", label: "متوازن بين التقاليد والانفتاح" },
      { value: "منفتح بالكامل", label: "منفتح بالكامل" }
    ],
    required: true
  },
  {
    id: "weekendStyle",
    question: "نمط عطلة نهاية الأسبوع المفضل:",
    type: "radio",
    options: [
      { value: "حضور فعاليات أو مقابلة أصدقاء", label: "حضور فعاليات أو مقابلة أصدقاء" },
      { value: "الجلوس في المنزل أو بجو هادئ", label: "الجلوس في المنزل أو بجو هادئ" }
    ],
    required: true
  },
  {
    id: "thinkingStyle",
    question: "طريقة التفكير واستقبال المعلومات:",
    type: "radio",
    options: [
      { value: "أركز على الواقع والتفاصيل", label: "أركز على الواقع والتفاصيل" },
      { value: "أُحب الخيال والرؤية المستقبلية", label: "أُحب الخيال والرؤية المستقبلية" }
    ],
    required: true
  },
  {
    id: "decisionMaking",
    question: "اتخاذ القرارات:",
    type: "radio",
    options: [
      { value: "أعتمد على المنطق والعقل", label: "أعتمد على المنطق والعقل" },
      { value: "أعتمد على المشاعر والجانب الإنساني", label: "أعتمد على المشاعر والجانب الإنساني" }
    ],
    required: true
  },
  {
    id: "organizationStyle",
    question: "التنظيم والعفوية:",
    type: "radio",
    options: [
      { value: "أحب الجداول والخطط", label: "أحب الجداول والخطط" },
      { value: "أحب العفوية والمرونة", label: "أحب العفوية والمرونة" }
    ],
    required: true
  },
  {
    id: "emotionalExpression",
    question: "أسلوب التعبير العاطفي:",
    type: "radio",
    options: [
      { value: "صريح ومباشر", label: "صريح ومباشر" },
      { value: "كتوم وأحتاج وقت", label: "كتوم وأحتاج وقت" }
    ],
    required: true
  },
  {
    id: "adventureVsStability",
    question: "المغامرة مقابل الاستقرار:",
    type: "radio",
    options: [
      { value: "أبحث عن التجربة والتجديد دائمًا", label: "أبحث عن التجربة والتجديد دائمًا" },
      { value: "أفضّل الراحة والاستقرار", label: "أفضّل الراحة والاستقرار" }
    ],
    required: true
  },
  {
    id: "dailyActivity",
    question: "النشاط اليومي:",
    type: "radio",
    options: [
      { value: "صباحي", label: "صباحي" },
      { value: "ليلي", label: "ليلي" }
    ],
    required: true
  },
  {
    id: "familyRelationship",
    question: "علاقتك بالعائلة:",
    type: "radio",
    options: [
      { value: "قوية جدًا وأتوقع نفس الشيء من الطرف الآخر", label: "قوية جدًا وأتوقع نفس الشيء من الطرف الآخر" },
      { value: "متوازنة", label: "متوازنة" },
      { value: "مستقلة ولا أتوقع مشاركة عائلية", label: "مستقلة ولا أتوقع مشاركة عائلية" }
    ],
    required: true
  },
  {
    id: "childrenDesire",
    question: "هل ترغب في إنجاب أطفال مستقبلًا؟",
    type: "radio",
    options: [
      { value: "نعم", label: "نعم" },
      { value: "ربما لاحقًا", label: "ربما لاحقًا" },
      { value: "لا", label: "لا" },
      { value: "غير متأكد", label: "غير متأكد" }
    ],
    required: true
  },
  {
    id: "conflictResolution",
    question: "كيف تتعامل مع الخلافات؟",
    type: "radio",
    options: [
      { value: "أواجه مباشرة وبهدوء", label: "أواجه مباشرة وبهدوء" },
      { value: "أحتاج بعض الوقت ثم أناقش", label: "أحتاج بعض الوقت ثم أناقش" },
      { value: "أتجنب المواجهة غالبًا", label: "أتجنب المواجهة غالبًا" }
    ],
    required: true
  },
  {
    id: "hobbies",
    question: "الهوايات: اختر 3 فقط من التالية:",
    type: "checkbox",
    options: [
      { value: "القراءة", label: "القراءة" },
      { value: "الأفلام والمسلسلات", label: "الأفلام والمسلسلات" },
      { value: "الرياضة", label: "الرياضة" },
      { value: "ألعاب الفيديو", label: "ألعاب الفيديو" },
      { value: "السفر", label: "السفر" },
      { value: "الطبيعة والكشتات", label: "الطبيعة والكشتات" },
      { value: "الطبخ", label: "الطبخ" },
      { value: "التطوع والخدمة", label: "التطوع والخدمة" },
      { value: "الموسيقى", label: "الموسيقى" }
    ],
    maxSelections: 3,
    required: true
  },
  {
    id: "energyPattern",
    question: "وصف نمط الطاقة:",
    type: "radio",
    options: [
      { value: "نشيط ومتحرك", label: "نشيط ومتحرك" },
      { value: "هادئ ومسترخٍ", label: "هادئ ومسترخٍ" }
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
      { value: "مهمة جدًا", label: "مهمة جدًا" },
      { value: "معتدلة", label: "معتدلة" },
      { value: "غير مهمة", label: "غير مهمة" }
    ],
    required: true
  },
  {
    id: "smokingAlcohol",
    question: "موقفك من التدخين:",
    type: "radio",
    options: [
      { value: "لا مشكلة", label: "لا مشكلة" },
      { value: "مقبول إذا كان خفيف", label: "مقبول إذا كان خفيف" },
      { value: "لا أقبل إطلاقًا", label: "لا أقبل إطلاقًا" }
    ],
    required: true
  },
  {
    id: "cleanlinessInterest",
    question: "مدى اهتمامك بالنظافة والتنظيم:",
    type: "radio",
    options: [
      { value: "أحب النظام والنظافة دائمًا", label: "أحب النظام والنظافة دائمًا" },
      { value: "مرن وبعض الفوضى لا تزعجني", label: "مرن وبعض الفوضى لا تزعجني" },
      { value: "لا أهتم كثيرًا", label: "لا أهتم كثيرًا" }
    ],
    required: true
  },
  {
    id: "petsOpinion",
    question: "رأيك في الحيوانات الأليفة:",
    type: "radio",
    options: [
      { value: "أحبها", label: "أحبها" },
      { value: "لا مانع", label: "لا مانع" },
      { value: "لا أحبها أو لدي حساسية", label: "لا أحبها أو لدي حساسية" }
    ],
    required: true
  },
  {
    id: "relationshipView",
    question: "ما الذي يمثّل نظرتك للعلاقة العاطفية الناجحة؟",
    type: "radio",
    options: [
      { value: "علاقة مستقرة وطويلة المدى مبنية على الالتزام والخصوصية", label: "علاقة مستقرة وطويلة المدى مبنية على الالتزام والخصوصية" },
      { value: "علاقة مرنة يمكن أن تتطوّر تدريجيًا حسب الظروف", label: "علاقة مرنة يمكن أن تتطوّر تدريجيًا حسب الظروف" },
      { value: "أؤمن بأن العلاقات تختلف من شخص لآخر ولا أضع نمطًا محددًا", label: "أؤمن بأن العلاقات تختلف من شخص لآخر ولا أضع نمطًا محددًا" }
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

const questionsPerPage = 5

export default React.memo(function SurveyComponent({ 
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

  // Memoize computed values
  const currentQuestions = useMemo(() => {
    if (currentPage === totalPages - 1) return []
    const startIndex = currentPage * questionsPerPage
    const endIndex = Math.min(startIndex + questionsPerPage, surveyQuestions.length)
    return surveyQuestions.slice(startIndex, endIndex)
  }, [currentPage, totalPages])

  const isPageValid = useCallback((page: number) => {
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
          if (!value || value === "") return false
        }
      }
    }
    return true
  }, [surveyData, totalPages])

  const nextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1)
    }
  }, [currentPage, totalPages])

  const prevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1)
    }
  }, [currentPage])

  const handleSubmit = useCallback(() => {
    console.log("🔍 SurveyComponent handleSubmit called")
    console.log("📊 Current surveyData:", surveyData)
    console.log("📝 Terms accepted:", surveyData.termsAccepted)
    console.log("📝 Data consent:", surveyData.dataConsent)
    
    // Validate all required questions
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
          if (!value || value === "") {
            console.log(`❌ Missing string answer for ${question.id}`)
            alert("يرجى استكمال جميع أسئلة الاستبيان المطلوبة");
            return;
          }
        }
      }
    }
    
    if (surveyData.termsAccepted && surveyData.dataConsent) {
      console.log("✅ All validations passed, calling onSubmit")
      onSubmit(surveyData);
    } else {
      console.log("❌ Terms not accepted")
      alert("يرجى الموافقة على الشروط والأحكام وسياسة الخصوصية");
    }
  }, [surveyData, onSubmit])

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
      if (question?.maxSelections && currentValues.length >= question.maxSelections) {
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

  const renderQuestion = (question: any) => {
    const value = surveyData.answers[question.id]

    switch (question.type) {
      case "radio":
        return (
          <RadioGroup
            value={value as string || ""}
            onValueChange={(val) => handleInputChange(question.id, val)}
            className="space-y-3"
          >
            {question.options.map((option: any) => (
              <div key={option.value} className="group">
                <div className="flex items-center space-x-3 space-x-reverse">
                  <RadioGroupItem 
                    value={option.value} 
                    id={`${question.id}-${option.value}`} 
                    className="w-3.5 h-3.5 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20"
                  />
                  <Label 
                    htmlFor={`${question.id}-${option.value}`} 
                    className="text-right cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1 leading-relaxed"
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
          <div className="space-y-3">
            {question.options.map((option: any) => (
              <div key={option.value} className="group">
                <div className="flex items-center space-x-3 space-x-reverse">
                  <Checkbox
                    id={`${question.id}-${option.value}`}
                    checked={(value as string[] || []).includes(option.value)}
                    onCheckedChange={(checked) => 
                      handleCheckboxChange(question.id, option.value, checked as boolean)
                    }
                    className="w-3.5 h-3.5 text-blue-500 border-2 border-gray-300 dark:border-slate-500 focus:ring-4 focus:ring-blue-500/20"
                  />
                  <Label 
                    htmlFor={`${question.id}-${option.value}`} 
                    className="text-right cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200 flex-1 leading-relaxed"
                  >
                    {option.label}
                  </Label>
                </div>
              </div>
            ))}
            {question.maxSelections && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-2 bg-white/50 dark:bg-slate-700/50 px-3 py-1.5 rounded-lg">
                اختر {question.maxSelections} فقط
              </p>
            )}
          </div>
        )

      case "text":
        return (
          <div className="relative">
            <Textarea
              value={value as string || ""}
              onChange={(e) => handleInputChange(question.id, e.target.value)}
              placeholder={question.placeholder}
              className="min-h-[40px] text-right border-2 border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm transition-all duration-300 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm resize-none"
            />
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none"></div>
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
          <div className="flex items-center space-x-3 space-x-reverse bg-white/80 dark:bg-slate-800/80 rounded-xl p-3 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-400 transition-all duration-300">
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
          <div className="flex items-center space-x-3 space-x-reverse bg-white/80 dark:bg-slate-800/80 rounded-xl p-3 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-400 transition-all duration-300">
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
                          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2 text-right leading-relaxed">
                            {question.question}
                          </h3>
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
})