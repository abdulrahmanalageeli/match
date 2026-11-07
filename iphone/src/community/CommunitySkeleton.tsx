type Variant = 'profile' | 'directory' | 'conversations' | 'messages';

/** Decorative placeholders never announce imagined people, scores, or messages. */
export function CommunitySkeleton({ variant, label }: { variant: Variant; label: string }) {
  return <div className={`cm-skeleton cm-skeleton-${variant}`} role="status">
    <span className="mi-sr-only">{label}</span>
    <div className="cm-skeleton-shapes" aria-hidden="true">
      {variant === 'profile' ? <div className="cm-skeleton-profile-card">
        <div className="cm-skeleton-portrait"><span className="cm-skeleton-caption">{label}</span><i className="cm-skeleton-line"/><i className="cm-skeleton-line short"/></div>
        <div className="cm-skeleton-copy"><i className="cm-skeleton-line"/><i className="cm-skeleton-line"/><i className="cm-skeleton-line short"/></div>
        <div className="cm-skeleton-footer"><i className="cm-skeleton-line"/><i className="cm-skeleton-line short"/></div>
      </div> : variant === 'messages' ? <>
        <span className="cm-skeleton-caption">{label}</span>
        {[0, 1, 2, 3].map(index => <div key={index} className="cm-skeleton-bubble"><i className="cm-skeleton-line"/><i className="cm-skeleton-line short"/></div>)}
      </> : <>
        <span className="cm-skeleton-caption">{label}</span>
        {[0, 1, 2].map(index => <div key={index} className="cm-skeleton-row">
          <div className="cm-skeleton-row-main"><i className="cm-skeleton-avatar"/><div className="cm-skeleton-copy"><i className="cm-skeleton-line short"/><i className="cm-skeleton-line"/></div></div>
          {variant === 'directory' && <div className="cm-skeleton-row-actions"><i className="cm-skeleton-line"/><i className="cm-skeleton-line short"/></div>}
        </div>)}
      </>}
    </div>
  </div>;
}
