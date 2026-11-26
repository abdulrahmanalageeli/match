import './route-placeholder.css';

export function BrandWait({label}:{label:string}) {
  return <div className="nf-brand-wait" role="status">
    <span className="nf-brand-wait-emblem" aria-hidden="true"/>
    <span>{label}</span>
  </div>;
}

export function RoutePlaceholder({ form = false, startup = false }: { form?: boolean; startup?: boolean }) {
  return <main className="app-screen nf-route-placeholder" dir="rtl">
    <BrandWait label={startup ? 'جارٍ فتح وُدَين…' : form ? 'جارٍ تجهيز ملفك…' : 'جارٍ تجهيز الصفحة…'}/>
  </main>;
}
