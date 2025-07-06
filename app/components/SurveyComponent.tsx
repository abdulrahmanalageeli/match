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
            className="space-y-3"
          >
            {question.options.map((option: any) => (
              <div key={option.value} className="flex items-center space-x-3 space-x-reverse">
                <RadioGroupItem value={option.value} id={`${question.id}-${option.value}`} />
                <Label htmlFor={`${question.id}-${option.value}`} className="text-right cursor-pointer">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )

      case "checkbox":
        return (
          <div className="space-y-3">
            {question.options.map((option: any) => (
              <div key={option.value} className="flex items-center space-x-3 space-x-reverse">
                <Checkbox
                  id={`${question.id}-${option.value}`}
                  checked={(value as string[]).includes(option.value)}
                  onCheckedChange={(checked) => 
                    handleCheckboxChange(question.id, option.value, checked as boolean)
                  }
                />
                <Label htmlFor={`${question.id}-${option.value}`} className="text-right cursor-pointer">
                  {option.label}
                </Label>
              </div>
            ))}
            {question.maxSelections && (
              <p className="text-sm text-gray-500 text-right">
                اختر {question.maxSelections} فقط
              </p>
            )}
          </div>
        )

      case "text":
        return (
          <Textarea
            value={value as string}
            onChange={(e) => handleInputChange(question.id, e.target.value)}
            placeholder={question.placeholder}
            className="min-h-[100px] text-right"
          />
        )

      default:
        return null
    }
  }

  const renderTermsPage = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <Shield className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800">الشروط والأحكام</h2>
        <p className="text-gray-600">يرجى قراءة والموافقة على الشروط التالية</p>
      </div>

      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-blue-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            شروط الخصوصية وحماية البيانات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-right">
          <div className="space-y-3 text-sm">
            <p className="text-gray-700">
              <strong>1. جمع البيانات:</strong> نقوم بجمع بياناتك الشخصية لغرض التوافق والمطابقة فقط.
            </p>
            <p className="text-gray-700">
              <strong>2. استخدام البيانات:</strong> تستخدم البيانات حصرياً لتحليل التوافق وتقديم خدمات المطابقة.
            </p>
            <p className="text-gray-700">
              <strong>3. حماية البيانات:</strong> نلتزم بمعايير حماية البيانات السعودية (PDPL) ونحافظ على سرية معلوماتك.
            </p>
            <p className="text-gray-700">
              <strong>4. الذكاء الاصطناعي:</strong> نستخدم تقنيات الذكاء الاصطناعي المطابقة للوائح السعودية.
            </p>
            <p className="text-gray-700">
              <strong>5. حقوقك:</strong> يمكنك طلب حذف بياناتك أو تعديلها في أي وقت.
            </p>
            <p className="text-gray-700">
              <strong>6. الأمان:</strong> نستخدم تقنيات تشفير متقدمة لحماية بياناتك.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center space-x-3 space-x-reverse">
          <Checkbox
            id="terms"
            checked={surveyData.termsAccepted}
            onCheckedChange={(checked) => 
              setSurveyData(prev => ({ ...prev, termsAccepted: checked as boolean }))
            }
          />
          <Label htmlFor="terms" className="text-right cursor-pointer">
            أوافق على الشروط والأحكام
          </Label>
        </div>

        <div className="flex items-center space-x-3 space-x-reverse">
          <Checkbox
            id="dataConsent"
            checked={surveyData.dataConsent}
            onCheckedChange={(checked) => 
              setSurveyData(prev => ({ ...prev, dataConsent: checked as boolean }))
            }
          />
          <Label htmlFor="dataConsent" className="text-right cursor-pointer">
            أوافق على معالجة بياناتي الشخصية وفقاً لسياسة الخصوصية
          </Label>
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">التقدم</span>
          <span className="text-sm text-gray-600">{currentPage + 1} من {totalPages}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Survey Content */}
      <Card className="shadow-lg">
        <CardContent className="p-6">
          {currentPage === totalPages - 1 ? (
            renderTermsPage()
          ) : (
            <div className="space-y-6">
              {surveyQuestions
                .slice(currentPage * questionsPerPage, (currentPage + 1) * questionsPerPage)
                .map((question, index) => (
                  <div key={question.id} className="space-y-4 p-4 border rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                        {currentPage * questionsPerPage + index + 1}
                      </span>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3 text-right">
                          {question.question}
                        </h3>
                        {renderQuestion(question)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center mt-8">
        <Button
          onClick={prevPage}
          disabled={currentPage === 0}
          variant="outline"
          className="flex items-center gap-2"
        >
          <ChevronRight className="w-4 h-4" />
          السابق
        </Button>

        {currentPage === totalPages - 1 ? (
          <Button
            onClick={handleSubmit}
            disabled={!surveyData.termsAccepted || !surveyData.dataConsent}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="w-4 h-4" />
            إرسال الاستبيان
          </Button>
        ) : (
          <Button
            onClick={nextPage}
            disabled={!isPageValid(currentPage)}
            className="flex items-center gap-2"
          >
            التالي
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  )
} 