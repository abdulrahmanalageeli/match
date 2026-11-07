/** Layout placeholders only: no identities, messages, or permission state. */
export function FamilyLoading({ view }: { view: 'hub' | 'chat' | 'portal' }) {
  const label = view === 'chat' ? 'جارٍ فتح المساحة…' : view === 'portal' ? 'جارٍ فتح بوابة الأهل…' : 'جارٍ فتح جسر الأهل…';
  return <div className={`fb-loading-state fb-loading-${view}`} role="status" aria-live="polite">
    <span className="fb-loading-label">{label}</span>
    <div aria-hidden="true">
      {view === 'chat' ? <><div className="fb-skeleton-message"><i className="fb-placeholder fb-placeholder-short"/><i className="fb-placeholder"/><i className="fb-placeholder fb-placeholder-medium"/></div><div className="fb-skeleton-message fb-skeleton-message-reply"><i className="fb-placeholder fb-placeholder-short"/><i className="fb-placeholder"/></div></> : view === 'portal' ? <div className="fg-card fb-skeleton-form"><div className="fb-placeholder fb-placeholder-tabs"/><i className="fb-placeholder fb-placeholder-medium"/><div className="fb-placeholder fb-placeholder-field"/><i className="fb-placeholder fb-placeholder-short"/><div className="fb-placeholder fb-placeholder-field"/><div className="fb-placeholder fb-placeholder-field"/></div> : <><div className="fb-skeleton-card"><i className="fb-placeholder fb-placeholder-short"/><i className="fb-placeholder fb-placeholder-medium"/><i className="fb-placeholder"/><i className="fb-placeholder fb-placeholder-medium"/></div><div className="fb-skeleton-card"><div className="fb-skeleton-person"><span className="fb-placeholder fb-placeholder-avatar"/><div><i className="fb-placeholder fb-placeholder-medium"/><i className="fb-placeholder fb-placeholder-short"/></div></div><i className="fb-placeholder"/><div className="fb-placeholder fb-placeholder-field"/></div></>}
    </div>
  </div>;
}
