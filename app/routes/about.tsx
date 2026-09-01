import { ArrowLeft, CheckCircle2, Compass, MessageCircle, ShieldCheck, Sparkles, UsersRound } from "lucide-react"
import { Link } from "react-router"

const FORMAT_CARDS = [
  {
    icon: Sparkles,
    title: "شريك محدد",
    description: "يرتب المنظم لقاءً أو أكثر وفق آلية التوافق المعلنة، مع بقاء النتيجة والتواصل اللاحق خيارًا شخصيًا بالكامل.",
  },
  {
    icon: Compass,
    title: "اختيار فقط",
    description: "تتيح الفعالية مساحة للاختيار المتبادل دون تعيين شريك أو ضمان أن يختار شخصان بعضهما.",
  },
]

const EXPECTATIONS = [
  "لقاءات قصيرة وأنشطة اجتماعية منظمة ضمن وقت ومكان محددين.",
  "استخدام إجابات الاستبيان كأداة مساعدة لترتيب التفاعلات، لا كحكم نهائي.",
  "قواعد واضحة للاحترام والخصوصية والسلامة داخل الفعالية.",
]

export default function AboutEvent() {
  return (
    <main dir="rtl" className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <section className="relative px-4 py-16 sm:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,_rgba(34,211,238,.18),_transparent_28%),radial-gradient(circle_at_85%_65%,_rgba(59,130,246,.16),_transparent_30%)]" />
        <div className="relative mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200"><UsersRound className="h-4 w-4" /> تجربة اجتماعية منظمة</span>
            <h1 className="mt-6 text-4xl font-black leading-tight sm:text-6xl">مساحة أفضل للحوار،<br /><span className="bg-gradient-to-l from-cyan-300 to-blue-400 bg-clip-text text-transparent">من دون وعود مصطنعة.</span></h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">BlindMatch فعالية اجتماعية حضورية تساعد أشخاصًا بالغين على خوض حوارات قصيرة ومنظمة، والتعرف إلى وجهات نظر وشخصيات مختلفة في بيئة محترمة.</p>
          </div>

          <section className="mx-auto mt-12 max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-9">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-cyan-300/10 p-3 text-cyan-300"><ShieldCheck className="h-6 w-6" /></div>
              <div>
                <h2 className="text-xl font-black">ما هي الفعالية — وما ليست عليه</h2>
                <p className="mt-3 text-sm leading-8 text-slate-300">هي تجربة اجتماعية منظمة للتعارف العام وتبادل الحوار. ليست تطبيق مواعدة، ولا خدمة خطبة أو وساطة زواج، ولا استشارة نفسية أو زوجية. لا نَعِد بعلاقة أو صداقة أو توافق، ولا نتخذ قرارات شخصية نيابة عن المشاركين.</p>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {FORMAT_CARDS.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-7 transition hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-white/[0.06]">
                <Icon className="h-7 w-7 text-cyan-300" />
                <h2 className="mt-5 text-xl font-black">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">{description}</p>
              </article>
            ))}
          </div>

          <section className="mt-6 grid gap-7 rounded-[2rem] border border-white/10 bg-gradient-to-l from-cyan-400/10 to-blue-500/5 p-7 sm:grid-cols-[.8fr_1.2fr] sm:p-9">
            <div>
              <MessageCircle className="h-7 w-7 text-cyan-300" />
              <h2 className="mt-4 text-2xl font-black">ما الذي نقدمه؟</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">تنظيم واضح، مساحة محترمة، وأدوات تساعد على بدء حوار جيد.</p>
            </div>
            <ul className="space-y-4">
              {EXPECTATIONS.map(item => <li key={item} className="flex gap-3 text-sm leading-7 text-slate-200"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />{item}</li>)}
            </ul>
          </section>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/terms" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200">اقرأ الشروط <ArrowLeft className="h-4 w-4" /></Link>
            <Link to="/privacy" className="inline-flex min-h-12 items-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-black text-white transition hover:bg-white/10">إشعار الخصوصية</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
