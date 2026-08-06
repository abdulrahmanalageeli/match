const legalName = import.meta.env.VITE_LEGAL_ENTITY_NAME || "التوافق الأعمى (BlindMatch)"
const crNumber = import.meta.env.VITE_CR_NUMBER || "يظهر في الفاتورة والسجل التجاري"
const contactEmail = import.meta.env.VITE_PRIVACY_EMAIL || "privacy@blindmatch.app"

export default function Terms() {
  const sections = [
    ["الأهلية", "المشاركة لمن بلغ 18 عامًا فأكثر، ويجب تقديم معلومات صحيحة وعدم استخدام هوية أو رقم شخص آخر."],
    ["طبيعة الخدمة", "الفعالية تجربة اجتماعية منظمة تستخدم الترشيح القائم على التوافق. لا نضمن قبولًا أو توافقًا أو علاقة أو نتيجة محددة، ولا تعد الخدمة استشارة نفسية أو زوجية."],
    ["السلوك والخصوصية", "يلتزم المشارك بالاحترام وعدم المضايقة أو التصوير أو التسجيل أو نشر بيانات المشاركين دون موافقتهم. يجوز للمنظم إيقاف المشاركة أو فرض حظر مبرر لحماية السلامة، مع إتاحة الاعتراض والمراجعة."],
    ["الدفع والإلغاء", "تظهر الرسوم وسياسة الاسترداد قبل التأكيد. لا يعد المقعد نهائيًا حتى اعتماد الدفع أو الإعفاء. عند إلغاء اللقاء من طرف المنظم يطبق خيار الاسترداد أو الرصيد المعلن للمشارك."],
    ["التواصل", "الرسائل التشغيلية اللازمة للحضور والدفع لا تعد موافقة على التسويق. التسويق للفعاليات القادمة اختياري ويمكن إيقافه في أي وقت."],
    ["المسؤولية", "نبذل عناية معقولة في التنظيم والأمن، لكن يبقى المشاركون مسؤولين عن قراراتهم وتواصلهم. لا تحد هذه الشروط من الحقوق النظامية أو المسؤولية التي لا يجوز استبعادها نظامًا."],
    ["التعديلات والنظام", "تسري أنظمة المملكة العربية السعودية. سنعرض أي تعديل جوهري قبل جمع موافقة جديدة عند الحاجة."],
  ]
  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
    <article className="mx-auto max-w-3xl space-y-4">
      <header className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-xs text-cyan-300">الإصدار 2026-08-06</p><h1 className="mt-2 text-3xl font-black">الشروط والأحكام</h1><p className="mt-3 text-sm text-slate-300">مقدم الخدمة: {legalName} · السجل التجاري: {crNumber}</p></header>
      {sections.map(([title, body]) => <section key={title} className="rounded-2xl border bg-white p-5"><h2 className="font-black text-slate-900">{title}</h2><p className="mt-2 text-sm leading-7 text-slate-700">{body}</p></section>)}
      <section className="rounded-2xl border bg-white p-5 text-sm leading-7 text-slate-700">للاستفسار أو الشكوى: <a href={`mailto:${contactEmail}`} className="font-bold text-blue-700 underline">{contactEmail}</a>. راجع كذلك <a href="/privacy" className="font-bold text-blue-700 underline">إشعار الخصوصية</a>.</section>
    </article>
  </main>
}
