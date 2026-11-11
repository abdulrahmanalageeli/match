export function BrandWordmark({ className = "" }: { className?: string }) {
  return <span className={`wudayn-wordmark ${className}`} aria-label="وُدَين · Wudayn AI">
    <span className="wudayn-wordmark-ar" lang="ar" dir="rtl">وُدَين</span>
    <span className="wudayn-wordmark-en" lang="en" dir="ltr" aria-hidden="true">WUDAYN AI</span>
  </span>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "nisfayn-brand nisfayn-brand-compact" : "nisfayn-brand"}>
    {!compact && <img className="nisfayn-brand-symbol" src="/brand/wudayn-emblem-v2.png" alt="" width="34" height="40" />}
    <BrandWordmark />
  </span>;
}
