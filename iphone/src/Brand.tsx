type BrandProps = { compact?: boolean };
export function Brand({ compact = false }: BrandProps) {
  return <span className={compact ? "nisfayn-brand nisfayn-brand-compact" : "nisfayn-brand"}>
    <img src={compact ? "/brand/wudayn-wordmark.png" : "/brand/wudayn-lockup-v2.png"}
      className={compact ? "nisfayn-brand-name" : "wudayn-brand-lockup"} alt="وُدَين · Wudayn AI" />
  </span>;
}
