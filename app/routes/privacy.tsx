const legalName = import.meta.env.VITE_LEGAL_ENTITY_NAME || "التوافق الأعمى (BlindMatch)"
const crNumber = import.meta.env.VITE_CR_NUMBER || "يظهر في الفاتورة والسجل التجاري"
const privacyEmail = import.meta.env.VITE_PRIVACY_EMAIL || "privacy@blindmatch.app"

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-black text-slate-900">{title}</h2>
    <div className="space-y-2 text-sm leading-7 text-slate-700">{children}</div>
  </section>
)

export default function PrivacyNotice() {
  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10 font-sans">
    <article className="mx-auto max-w-3xl space-y-5">
      <header className="rounded-3xl bg-slate-950 p-7 text-white">
        <p className="text-xs text-cyan-300">الإصدار 2026-08-06 · آخر تحديث 6 أغسطس 2026</p>
        <h1 className="mt-2 text-3xl font-black">إشعار الخصوصية وحماية البيانات</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">يوضح هذا الإشعار كيف نعالج بيانات المشاركين وفق نظام حماية البيانات الشخصية السعودي ولائحته التنفيذية.</p>
      </header>

      <Section title="1. جهة التحكم والتواصل">
        <p>جهة التحكم: <strong>{legalName}</strong>، رقم السجل التجاري: <strong>{crNumber}</strong>.</p>
        <p>طلبات الخصوصية: <a className="font-bold text-blue-700 underline" href={`mailto:${privacyEmail}`}>{privacyEmail}</a> أو <a className="font-bold text-blue-700 underline" href="/privacy-request">بوابة حقوق البيانات</a>.</p>
      </Section>

      <Section title="2. البيانات التي نعالجها">
        <p>بيانات التسجيل والتواصل؛ العمر والجنس والجنسية؛ تفضيلات الحضور والتوافق؛ إجابات الاستبيان والسمات المستنتجة؛ نتائج وترتيبات وتقييمات الجلسات؛ رسائل واتساب؛ حالة الدفع وإثباتاته؛ طلبات المساعدة؛ وسجلات الأمن، ومنها عنوان IP والجهاز والإجراء دون تسجيل محتوى الاستبيان في سجل الأمن.</p>
      </Section>

      <Section title="3. الأغراض والأساس النظامي">
        <p>نستخدم البيانات لتنظيم الفعالية، التحقق من التسجيل، إنشاء الترشيحات، إدارة الحضور والدفع، التواصل التشغيلي، السلامة ومنع الإساءة، والوفاء بالالتزامات النظامية. تعتمد معالجة الاستبيان والتحليل الآلي على موافقتك الصريحة. تعتمد سجلات الأمن ومنع الاحتيال والحظر على المصلحة المشروعة الموثقة وأمن الشبكات والمعلومات. الرسائل التسويقية اختيارية وبموافقة مستقلة.</p>
      </Section>

      <Section title="4. التحليل الآلي والذكاء الاصطناعي">
        <p>نستخدم خوارزميات وذكاءً اصطناعيًا لتحليل إجاباتك واقتراح توافقات. الترشيح مساعد تنظيمي وليس ضمانًا لعلاقة أو نتيجة، ويخضع لرقابة المنظم. يمكنك الاعتراض أو طلب مراجعة بشرية عبر بوابة الحقوق.</p>
      </Section>

      <Section title="5. المستلمون والنقل خارج المملكة">
        <p>نستخدم Supabase لاستضافة قاعدة البيانات في الاتحاد الأوروبي، وVercel للاستضافة، وTwilio لواتساب والتحقق، وOpenAI للتحليل النصي. ننقل الحد الأدنى اللازم فقط، ولا نرسل أرقام الهواتف أو الأسماء إلى OpenAI في طلبات التلخيص. تخضع التحويلات لاتفاقيات معالجة بيانات وضمانات تعاقدية وتقييم للمخاطر، ولا نبيع البيانات.</p>
      </Section>

      <Section title="6. مدد الاحتفاظ">
        <ul className="list-disc space-y-1 pr-5">
          <li>التسجيل غير المكتمل: 7 أيام.</li><li>سجلات الأمن: 90 يومًا ما لم تتطلب حادثة فترة أطول.</li>
          <li>محتوى واتساب وإثباتات الدفع: 180 يومًا بعد الفعالية، مع الاحتفاظ بالسجل المحاسبي الأدنى للمدة النظامية.</li>
          <li>ملف المشاركة ونتائج التوافق والتقييم: 12 شهرًا بعد آخر مشاركة، ثم الحذف أو إخفاء الهوية.</li>
          <li>معرّف الحظر: طوال سريان الحظر مع مراجعة سنوية وحق الاعتراض.</li>
        </ul>
      </Section>

      <Section title="7. حقوقك">
        <p>لك الحق في العلم والوصول والحصول على نسخة، والتصحيح، وطلب الإتلاف، وسحب الموافقة، والاعتراض على التسويق أو المصلحة المشروعة، وطلب مراجعة بشرية. سنتحقق من الهوية ونرد ضمن المدة النظامية. يمكنك كذلك تقديم شكوى إلى الجهة المختصة عبر منصة حوكمة البيانات الوطنية.</p>
      </Section>

      <Section title="8. الأمان والحوادث">
        <p>نطبق تقييد الصلاحيات، المصادقة، التشفير أثناء النقل والتخزين، السجلات الأمنية، إدارة الثغرات والنسخ الاحتياطية. إذا وقع تسرب قد يسبب ضررًا فسنبلغ الجهة المختصة وأصحاب البيانات وفق المتطلبات النظامية.</p>
      </Section>
      <p className="text-center text-xs text-slate-500"><a href="/terms" className="underline">الشروط والأحكام</a> · <a href="/" className="underline">العودة للرئيسية</a></p>
    </article>
  </main>
}
