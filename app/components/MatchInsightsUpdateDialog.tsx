import { useEffect, useMemo, useState } from "react"
import { Check, Loader2, Sparkles, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Checkbox } from "../../components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Textarea } from "../../components/ui/textarea"
import {
  getMissingSurveyUpdateIds,
  isProfileDataCollectionId,
  type SurveyUpdateAnswers as Answers,
  type SurveyUpdateId as InsightId,
} from "../lib/survey-update-questions.js"

export {
  MATCH_INSIGHT_IDS,
  PROFILE_DATA_COLLECTION_IDS,
  SURVEY_UPDATE_IDS,
  getMissingSurveyUpdateIds,
} from "../lib/survey-update-questions.js"

// Keep the existing public name for callers while the helper now covers every
// question added after the original survey, including the later profile trio.
export const getMissingMatchInsightIds = getMissingSurveyUpdateIds

const questions: Array<{
  id: InsightId
  title: string
  type: 'radio' | 'text' | 'checkbox'
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  supportingText?: string
}> = [
  {
    id: 'age_flex_one_year',
    title: 'إذا ما لقينا لك تطابق مناسب داخل المدى العمري اللي اخترته، هل تقبل نوسّعه سنة واحدة فقط من كل جهة؟',
    type: 'radio',
    options: [
      { value: 'accept', label: 'نعم، عادي يكون أصغر أو أكبر بسنة' },
      { value: 'decline', label: 'لا، التزموا بالمدى اللي اخترته' },
    ],
  },
  {
    id: 'match_disagreement_style',
    title: 'اختلفت مع شخص في موضوع واضح إن رأيكم فيه ما راح يتغير. وش تفضّل يصير بعدها؟',
    type: 'radio',
    options: [
      { value: 'A', label: 'نكمل النقاش ونختبر حجج بعض' },
      { value: 'B', label: 'نفهم التجارب والأسباب اللي كوّنت رأي كل واحد' },
      { value: 'C', label: 'نخففها بمزح وننتقل لموضوع جديد' },
      { value: 'D', label: 'نوقف النقاش ونفتح موضوعًا نقدر نبني عليه معًا' },
    ],
  },
  {
    id: 'match_similarity_preference',
    title: 'لو كان مستوى الراحة متساويًا مع شخصين، أي تركيبة غالبًا تشدك أكثر؟',
    type: 'radio',
    options: [
      { value: 'A', label: 'شخص يشبهني في الاهتمامات وطريقة الحياة' },
      { value: 'B', label: 'شخص اهتماماته وتجاربه مختلفة ويدخلني عالمًا جديدًا' },
      { value: 'C', label: 'شخص يشبهني في القيم الأساسية لكن تختلف تفاصيل حياتنا' },
      { value: 'D', label: 'مقدار التشابه ما يرجّح اختياري؛ إيقاع الحوار هو اللي يفرق معي' },
    ],
  },
  {
    id: 'match_current_curiosity',
    title: 'وش الموضوع اللي شادك هالفترة وتقدر تسولف عنه بدون تحضير؟',
    type: 'text',
    placeholder: 'ممكن يكون فكرة، مجال، حدث، هواية، أو حتى شيء غريب دخلت فيه من باب الفضول...',
  },
  {
    id: 'match_current_focus',
    title: 'هالفترة، وش أكثر شيئين ماخذين من وقتك أو تفكيرك؟ اختر اثنين فقط.',
    type: 'checkbox',
    options: [
      { value: 'study', label: 'الدراسة والتعلّم' },
      { value: 'career', label: 'الوظيفة والمسار المهني' },
      { value: 'business', label: 'مشروع أو بزنس' },
      { value: 'family_social', label: 'العائلة والعلاقات الاجتماعية' },
      { value: 'health_fitness', label: 'الرياضة والصحة' },
      { value: 'creative', label: 'الفن أو المحتوى أو الإبداع' },
      { value: 'travel_experiences', label: 'السفر والتجارب الجديدة' },
      { value: 'self_growth', label: 'تطوير الذات أو تغيير شخصي' },
      { value: 'other', label: 'شيء آخر' },
    ],
  },
  {
    id: 'conversation_initiative_preference',
    title: 'في أول عشر دقائق مع شخص جديد، وش يصير غالبًا بدون ما تتعمد؟',
    type: 'radio',
    options: [
      { value: 'A', label: 'أفضل إنه يفتح أغلب المواضيع، وأنا أتفاعل وأطوّرها' },
      { value: 'B', label: 'عادة كل واحد فينا يفتح مواضيع بقدر قريب من الثاني' },
      { value: 'C', label: 'غالبًا أنا اللي أبدأ المواضيع وأحرّك الحوار' },
      { value: 'D', label: 'أبدأ منتظرًا، لكن إذا طال الهدوء أتحول أنا للمبادر' },
    ],
  },
  {
    id: 'expression_language',
    title: 'بأي لغة تقدر تعبّر عن نفسك بأفضل شكل؟',
    supportingText: 'نقصد اللغة اللي تقدر فيها تكون على طبيعتك وتوصل أفكارك ومشاعرك بدقة.',
    type: 'radio',
    options: [
      { value: '1', label: 'العربية فقط أو تقريبًا — الإنجليزية ما تكفيني لسالفة كاملة.' },
      { value: '2', label: 'العربية أفضل — أقدر أسولف بالإنجليزية، لكن تعبيري بالعربية أوضح.' },
      { value: '3', label: 'اللغتان بنفس الراحة — أعبّر عن نفسي بالعربية والإنجليزية بنفس المستوى.' },
      { value: '4', label: 'الإنجليزية أفضل — أقدر أسولف بالعربية، لكن تعبيري بالإنجليزية أوضح.' },
      { value: '5', label: 'الإنجليزية فقط أو تقريبًا — العربية ما تكفيني للتعبير عن نفسي براحة.' },
    ],
  },
  {
    id: 'minimum_partner_religious_commitment',
    title: 'إلى أي حد يهمك \"الجانب الديني\" في الشخص اللي تقضي وقتك وتنسجم معه؟',
    type: 'radio',
    options: [
      { value: '1', label: 'يهمني جداً؛ أرتاح وأنسجم أكثر مع الشخص المحافظ والحريص على جانبه الديني بوضوح؛ يؤدي الفروض، ونمط حياته يعكس هالشيء.' },
      { value: '2', label: 'يهمني الاعتدال؛ يكفيني يحافظ على واجباته وأساسيات دينه بشكل عام، ويكون إنسان وسطي ومرن في أسلوب حياته بدون تعقيد.' },
      { value: '3', label: 'أشوفه شيء يخصه؛ أميل للشخص المنفتح اللي يشوف إن الدين علاقة شخصية، وما يتدخل أو يدقق في تدين اللي حوله.' },
      { value: '4', label: 'مو معيار بالنسبة لي أبدًا؛ اللي يهمني فعلًا هو التوافق الفكري، وطريقة التفكير، والانسجام وبس.' },
    ],
  },
  {
    id: 'social_relationship_style',
    title: 'أي وصف أقرب لأسلوبك في العلاقات والتجمعات الاجتماعية؟',
    supportingText: 'اختر الوصف الأقرب لك بشكل عام — مو لازم كل مثال ينطبق عليك 100٪.',
    type: 'radio',
    options: [
      { value: '1', label: 'محافظ بوضوح — أفضل أن تكون العلاقة بين الرجل والمرأة رسمية ومحدودة غالبًا، وأرتاح أكثر في التجمعات غير المختلطة أو الأجواء الهادئة ذات الحدود الواضحة.' },
      { value: '2', label: 'محافظ نسبيًا — أتقبل التعامل الطبيعي والتجمعات المختلطة إذا كانت ضمن سياق واضح، لكن لا أفضّل الصداقات القريبة بين الرجل والمرأة، وأميل لاختيار الأجواء الاجتماعية الأكثر هدوءًا وانضباطًا.' },
      { value: '3', label: 'منفتح نسبيًا — الصداقة بين الرجل والمرأة والتجمعات المختلطة مقبولة عندي غالبًا إذا كان فيها احترام ووضوح حدود، وأقيّم الأجواء الاجتماعية حسب الأشخاص والمكان.' },
      { value: '4', label: 'منفتح بوضوح — الصداقة، الاختلاط، والأجواء الاجتماعية المفتوحة جزء طبيعي من أسلوب حياتي، ونادرًا ما تكون الحدود الاجتماعية التقليدية عاملًا مؤثرًا في اختياراتي أو ارتياحي.' },
    ],
  },
]

interface Props {
  open: boolean
  missingIds: InsightId[]
  secureToken: string
  onOpenChange: (open: boolean) => void
  onSaved: (surveyData: Record<string, unknown>) => void
}

export function MatchInsightsUpdateDialog({ open, missingIds, secureToken, onOpenChange, onSaved }: Props) {
  const [answers, setAnswers] = useState<Answers>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const visibleQuestions = useMemo(() => questions.filter((question) => missingIds.includes(question.id)), [missingIds])
  const newProfileQuestionCount = useMemo(() => missingIds.filter(isProfileDataCollectionId).length, [missingIds])
  const onlyNewProfileQuestions = newProfileQuestionCount === missingIds.length

  useEffect(() => {
    if (open) {
      setAnswers({})
      setError('')
    }
  }, [open, missingIds])

  const toggleFocus = (value: string, checked: boolean) => {
    setAnswers((current) => {
      const selected = Array.isArray(current.match_current_focus) ? current.match_current_focus : []
      if (!checked) return { ...current, match_current_focus: selected.filter((item) => item !== value) }
      if (selected.length >= 2) return current
      return { ...current, match_current_focus: [...selected, value] }
    })
  }

  const submit = async () => {
    const payload = Object.fromEntries(missingIds.map((id) => [id, answers[id]])) as Answers
    const missingChoice = missingIds.some((id) => {
      if (id === 'match_current_curiosity' || id === 'match_current_focus') return false
      if (id === 'age_flex_one_year') return !['accept', 'decline'].includes(String(payload[id] || '').toLowerCase())
      if (id === 'expression_language') return !['1', '2', '3', '4', '5'].includes(String(payload[id] || ''))
      if (id === 'minimum_partner_religious_commitment' || id === 'social_relationship_style') {
        return !['1', '2', '3', '4'].includes(String(payload[id] || ''))
      }
      return !['A', 'B', 'C', 'D'].includes(String(payload[id] || ''))
    })
    const curiosityInvalid = missingIds.includes('match_current_curiosity') && String(payload.match_current_curiosity || '').trim().length < 20
    const focusInvalid = missingIds.includes('match_current_focus') && (!Array.isArray(payload.match_current_focus) || payload.match_current_focus.length !== 2)
    if (missingChoice || curiosityInvalid || focusInvalid) {
      setError('كمّل كل الإجابات المطلوبة قبل الحفظ. وإذا ظهر سؤال الاهتمامات فاختر خيارين بالضبط، واكتب 20 حرفًا على الأقل في الإجابة المفتوحة.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-match-insights', secure_token: secureToken, answers: payload }),
      })
      const data = await response.json()
      if (!response.ok || !data?.success) throw new Error(data?.error || 'save_failed')
      onSaved(data.survey_data)
      onOpenChange(false)
    } catch {
      setError('ما قدرنا نحفظ الآن. جرّب مرة ثانية—إجاباتك ما راح تضيع من النافذة.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent dir="rtl" className="flex h-[92dvh] max-h-[54rem] w-[calc(100%-1.25rem)] max-w-2xl flex-col gap-0 overflow-hidden border-white/50 bg-white/95 p-0 shadow-2xl backdrop-blur-2xl [&>button:last-child]:hidden dark:border-white/10 dark:bg-slate-950/95">
        <div className="relative shrink-0 overflow-hidden border-b border-slate-200/80 bg-gradient-to-br from-cyan-50 via-white to-amber-50 px-5 pb-5 pt-6 dark:border-white/10 dark:from-cyan-400/10 dark:via-slate-950 dark:to-amber-400/10 sm:px-7">
          <div aria-hidden className="absolute -left-16 -top-20 h-52 w-52 rounded-full bg-cyan-300/20 blur-3xl" />
          <DialogHeader className="relative text-right">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3 py-1 text-[11px] font-extrabold text-white dark:bg-white dark:text-slate-950">
                <Sparkles className="h-3.5 w-3.5" />
                تحديث سريع
              </span>
              <button type="button" onClick={() => onOpenChange(false)} disabled={saving} aria-label="إغلاق" className="rounded-full p-2 text-slate-500 transition hover:bg-white/80 hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <DialogTitle className="text-right text-xl font-black leading-8 text-slate-950 dark:text-white sm:text-2xl">
              {onlyNewProfileQuestions ? 'أضفنا أسئلة جديدة' : 'خلّنا نعرفك أكثر'}
            </DialogTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {onlyNewProfileQuestions
                ? `حتى لو جاوبت التحديث السابق، أضفنا ${newProfileQuestionCount === 1 ? 'سؤالًا واحدًا' : `${newProfileQuestionCount} أسئلة`} عن لغة التعبير والجانب الديني والأسلوب الاجتماعي. جاوبها هنا بدون ما ترجع للاستبيان كامل.`
                : `عندنا ${missingIds.length === 1 ? 'سؤال واحد جديد' : `${missingIds.length} أسئلة جديدة`} تساعدنا نفهمك بشكل أدق. جاوبها هنا بدون ما ترجع للاستبيان كامل.`}
            </p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-7">
          {visibleQuestions.map((question, index) => (
            <section key={question.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
              <div className="mb-3 flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-black text-white">{index + 1}</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold leading-6 text-slate-900 dark:text-white sm:text-[15px]">{question.title}</h3>
                    {isProfileDataCollectionId(question.id) && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">جديد</span>
                    )}
                  </div>
                  {question.supportingText && <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{question.supportingText}</p>}
                </div>
              </div>
              {question.type === 'radio' && (
                <RadioGroup value={String(answers[question.id] || '')} onValueChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} className="grid gap-2">
                  {question.options?.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm leading-5 transition hover:border-cyan-400 hover:bg-cyan-50/60 has-[[data-state=checked]]:border-cyan-500 has-[[data-state=checked]]:bg-cyan-50 dark:border-white/10 dark:hover:bg-cyan-400/5 dark:has-[[data-state=checked]]:bg-cyan-400/10">
                      <RadioGroupItem value={option.value} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </RadioGroup>
              )}
              {question.type === 'text' && (
                <div>
                  <Textarea value={String(answers[question.id] || '')} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value.slice(0, 150) }))} maxLength={150} placeholder={question.placeholder} className="min-h-24 resize-none rounded-xl text-right leading-6" />
                  <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>20 حرفًا على الأقل</span><span>{String(answers[question.id] || '').trim().length}/150</span></div>
                </div>
              )}
              {question.type === 'checkbox' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {question.options?.map((option) => {
                    const selected = Array.isArray(answers.match_current_focus) ? answers.match_current_focus : []
                    const checked = selected.includes(option.value)
                    return (
                      <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm transition hover:border-cyan-400 has-[[data-state=checked]]:border-cyan-500 has-[[data-state=checked]]:bg-cyan-50 dark:border-white/10 dark:has-[[data-state=checked]]:bg-cyan-400/10">
                        <Checkbox checked={checked} disabled={!checked && selected.length >= 2} onCheckedChange={(value) => toggleFocus(option.value, value === true)} />
                        <span>{option.label}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white/90 px-4 py-4 dark:border-white/10 dark:bg-slate-950/90 sm:px-7">
          <button type="button" onClick={submit} disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-cyan-500 to-blue-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'جاري الحفظ...' : 'حفظ الإجابات'}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">لن نطلب منك إعادة الاستبيان أو تغيير إجاباتك السابقة.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
