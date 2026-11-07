type BrandProps = {
  compact?: boolean;
};

export function Brand({ compact = false }: BrandProps) {
  return (
    <span className={compact ? "nisfayn-brand nisfayn-brand-compact" : "nisfayn-brand"}>
      {!compact && (
        <img className="nisfayn-brand-symbol" src="/brand/nisfayn-emblem.png" alt="" width="34" height="40" />
      )}
      <img className="nisfayn-brand-name" src="/brand/nisfayn-wordmark.png" alt="نصفين" width="65" height="25" />
    </span>
  );
}
