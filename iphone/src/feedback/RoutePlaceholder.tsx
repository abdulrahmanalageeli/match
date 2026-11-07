import './route-placeholder.css';

/** Keeps the destination's structure visible while its code loads, without fake data. */
export function RoutePlaceholder({ form = false }: { form?: boolean }) {
  return <main className="app-screen nf-route-placeholder" aria-busy="true">
    <p role="status">{form ? 'جارٍ تجهيز ملفك…' : 'جارٍ تجهيز الصفحة…'}</p>
    <div aria-hidden="true" className="nf-route-placeholder-content">
      <span className="nf-route-placeholder-heading"/>
      <span className="nf-route-placeholder-description"/>
      {[0, 1, 2].map(index => <div key={index} className={form ? 'nf-route-placeholder-field' : 'nf-route-placeholder-row'}>
        {!form && <i/>}<div><span/><span/></div>
      </div>)}
      {form && <span className="nf-route-placeholder-action"/>}
    </div>
  </main>;
}
