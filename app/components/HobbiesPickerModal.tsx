import React, { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Button } from "../../components/ui/button"
import { X } from "lucide-react"

interface HobbiesPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSelected?: string[]
  onApply: (selected: string[]) => void
}

const HOBBY_CATEGORIES: { key: string; title: string; items: string[] }[] = [
  {
    key: "sports",
    title: "الرياضة والأنشطة",
    items: [
      "كرة القدم", "كرة السلة", "السباحة", "ركوب الدراجات", "الجري", "اليوغا", "البيلاتس", "المشي", "رفع الأثقال", "التنس",
      "تسلق الجبال", "الغطس", "ركوب الخيل", "الملاكمة", "الفنون القتالية", "ركوب الأمواج", "التزلج", "البادل"
    ]
  },
  {
    key: "arts",
    title: "الفنون والإبداع",
    items: [
      "الرسم", "التصوير", "الخط العربي", "التلوين", "التصميم الجرافيكي", "الفوتوغراف", "النحت", "الخزف", "النجارة",
      "صناعة الشموع", "صناعة الصابون", "التطريز", "الكروشية", "الحياكة", "الخياطة", "الميك أب الفني", "صناعة المجوهرات"
    ]
  },
  {
    key: "music",
    title: "الموسيقى والأداء",
    items: [
      "العزف على العود", "العزف على البيانو", "الجيتار", "الكمان", "الغناء", "التوزيع الموسيقي", "الدي جي", "الكورال"
    ]
  },
  {
    key: "outdoors",
    title: "الهواء الطلق",
    items: [
      "التخييم", "الكشتات", "الهايكنج", "الرحلات البرية", "المراقبة الفلكية", "التصوير الليلي", "البستنة", "البونساي",
      "الصيد", "المشي في الطبيعة", "الرحلات البحرية"
    ]
  },
  {
    key: "tech",
    title: "التقنية والابتكار",
    items: [
      "البرمجة", "الذكاء الاصطناعي", "تحرير الفيديو", "المونتاج", "الطباعة ثلاثية الأبعاد", "الروبوت", "الأمن السيبراني",
      "إدارة الأنظمة", "تحرير الصور", "تحليل البيانات"
    ]
  },
  {
    key: "gaming",
    title: "الألعاب والهوايات الذهنية",
    items: [
      "الألعاب الإلكترونية", "البورد جيمز", "الشطرنج", "حل المكعب السحري", "الألغاز", "الكلمات المتقاطعة", "القراءة",
      "الكتابة الإبداعية", "الشعر"
    ]
  },
  {
    key: "food",
    title: "الطعام والمطبخ",
    items: [
      "الطبخ", "الخبز", "الحلويات", "القهوة المختصة", "الشاي", "التخمير", "صناعة الجبن", "التذوق", "التغذية الصحية"
    ]
  },
  {
    key: "travel",
    title: "السفر والثقافة",
    items: [
      "السفر", "استكشاف المدن", "التخطيط للرحلات", "اللغات", "التاريخ", "المتاحف", "التطوع", "الفعاليات الثقافية"
    ]
  },
  {
    key: "niche",
    title: "هوايات نيش واهتمامات خاصة",
    items: [
      "استكشاف المدن المهجورة", "الجيُوكاشينج", "LARP", "الباركور", "سباقات الدرون", "التصوير الفلكي", "تربية الأحواض",
      "تربية الطيور", "صناعة العطور", "العناية بالنباتات", "صناعة الجلد", "صناعة السكاكين", "النجارة الدقيقة",
      "الترميم", "جمع الطوابع", "جمع العملات", "المقتنيات النادرة"
    ]
  }
]

function normalize(text: string) {
  return text.trim()
}

export default function HobbiesPickerModal({ open, onOpenChange, initialSelected = [], onApply }: HobbiesPickerModalProps) {
  const [query, setQuery] = useState("")
  const [custom, setCustom] = useState("")
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setSelected([...new Set(initialSelected.map(normalize).filter(Boolean))])
      setQuery("")
      setCustom("")
    }
  }, [open, initialSelected])

  const flatList = useMemo(() => {
    const all: { category: string; item: string }[] = []
    for (const cat of HOBBY_CATEGORIES) {
      for (const it of cat.items) all.push({ category: cat.title, item: it })
    }
    return all
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return flatList
    return flatList.filter(({ item, category }) =>
      item.toLowerCase().includes(q) || category.toLowerCase().includes(q)
    )
  }, [flatList, query])

  const toggle = (item: string) => {
    const val = normalize(item)
    setSelected(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])
  }

  const addCustom = () => {
    const val = normalize(custom)
    if (!val) return
    setSelected(prev => prev.includes(val) ? prev : [...prev, val])
    setCustom("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl w-[92vw] max-w-[92vw] sm:max-h-[85vh] max-h-dvh h-auto overflow-hidden p-0 rounded-xl sm:rounded-2xl bg-white/55 dark:bg-slate-900/50 backdrop-blur-xl border border-white/30 dark:border-slate-800/60 shadow-2xl" dir="rtl">
        <div className="flex max-h-dvh sm:max-h-[85vh] h-full flex-col min-w-0">
        <div className="sticky top-0 z-10 px-4 sm:px-5 py-3.5 sm:py-4 border-b bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl flex items-center justify-between">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold">اختر هواياتك بسهولة</DialogTitle>
          </DialogHeader>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-w-0 custom-scrollbar sleek-scrollbar">
          <div className="flex items-center gap-2 min-w-0">
            <Input
              placeholder="ابحث عن هواية..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="text-right h-11 text-base"
            />
            <div className="flex-1"></div>
          </div>

          {/* Selected list */}
          <div className="flex flex-wrap gap-2 min-w-0">
            {selected.map(s => (
              <button
                key={s}
                onClick={() => toggle(s)}
                className="px-3 py-1.5 rounded-full text-xs sm:text-sm bg-linear-to-r from-violet-500/10 to-indigo-500/10 border border-violet-400/30 text-violet-700 dark:text-violet-300 hover:from-violet-500/15 hover:to-indigo-500/15 transition"
                title="إزالة"
              >
                {s}
              </button>
            ))}
            {selected.length === 0 && (
              <span className="text-xs text-slate-500">لا يوجد عناصر محددة بعد</span>
            )}
          </div>

          {/* Categories */}
          <div className="space-y-6 min-w-0">
            {HOBBY_CATEGORIES.map(cat => (
              <div key={cat.key}>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{cat.title}</div>
                <div className="flex flex-wrap gap-2">
                  {cat.items
                    .filter(it => !query || it.toLowerCase().includes(query.trim().toLowerCase()))
                    .map(it => {
                      const active = selected.includes(it)
                      return (
                        <button
                          key={it}
                          onClick={() => toggle(it)}
                          className={`px-3 py-1.5 rounded-full text-xs sm:text-sm border transition focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${
                            active
                              ? 'bg-linear-to-r from-violet-500/20 to-indigo-500/20 border-violet-400/50 text-violet-700 dark:text-violet-300'
                              : 'bg-white/60 dark:bg-slate-800/60 border-slate-300/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-700/60'
                          }`}
                        >
                          {it}
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>

          {/* Custom add */}
          <div className="pt-2 border-t mt-2">
            <div className="text-sm font-semibold text-slate-700 mb-2">أضف هواية مخصصة</div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="مثال: رسم رقمي، تحليل بيانات، فن الخزف..."
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                className="text-right h-11 text-base"
              />
              <Button onClick={addCustom} variant="secondary" className="h-11 px-4 text-sm">إضافة</Button>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 px-4 sm:px-5 py-3.5 sm:py-4 border-t bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs sm:text-sm text-slate-500">تلميح: يمكنك الضغط على أي عنصر لإضافته أو إزالته</span>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-11 px-4">إلغاء</Button>
              <Button onClick={() => onApply(selected)} className="h-11 px-5">اعتماد ({selected.length})</Button>
            </div>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
