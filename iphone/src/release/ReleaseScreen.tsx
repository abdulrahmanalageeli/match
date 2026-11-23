import { useEffect, useId, useRef } from 'react';
import { BrandWordmark } from '../Brand';
import { ArrowLeft } from '../BrandIcons';
import './release-screen.css';

export type ReleaseScreenState = 'checking' | 'unavailable' | 'required' | 'maintenance' | 'recommended';

type Props = {
  state: ReleaseScreenState;
  platform: 'ios' | 'web';
  storeUrl: string | null;
  maintenanceUntil: string | null;
  busy: boolean;
  resumeHint?: string;
  actionError?: string;
  onUpdate: () => void;
  onRetry: () => void;
  onLater: () => void;
};

const riyadhTime = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
});

export function ReleaseScreen({ state, platform, storeUrl, maintenanceUntil, busy, resumeHint, actionError, onUpdate, onRetry, onLater }: Props) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const isWeb = platform === 'web';
  const canUpdate = isWeb || Boolean(storeUrl);
  const actionText = isWeb ? 'تحديث الصفحة' : 'فتح App Store';
  const retryText = busy ? 'جارٍ التحقق…' : 'إعادة التحقق';

  useEffect(() => {
    if (state !== 'checking' && state !== 'recommended') heading.current?.focus({ preventScroll: true });
  }, [state]);

  if (state === 'recommended') {
    return <aside className="wd-release-banner" dir="rtl" aria-labelledby={titleId}>
      <div className="wd-release-banner-inner">
        <div className="wd-release-banner-copy">
          <strong id={titleId}>يتوفر تحديث لوُدَين</strong>
          {resumeHint && <small>{resumeHint}</small>}
        </div>
        <button type="button" className="wd-release-banner-update" onClick={onUpdate} disabled={!canUpdate}>
          {isWeb ? 'حدّث الصفحة' : 'تحديث'}
        </button>
        <button type="button" className="wd-release-later" onClick={onLater}>لاحقًا</button>
        {actionError && <p className="wd-release-error" role="alert">{actionError}</p>}
      </div>
    </aside>;
  }
  if (state === 'checking') {
    return <main className="wd-release-screen wd-release-check" dir="rtl" aria-label="وُدَين">
      <div role="status"><BrandWordmark/><p>جارٍ التحقق من الإصدار…</p></div>
    </main>;
  }

  const maintenance = state === 'maintenance';
  const required = state === 'required';
  const end = maintenanceUntil ? new Date(maintenanceUntil) : null;
  const showTime = maintenance && end && Number.isFinite(end.getTime());
  const title = required ? 'تحديث مطلوب للمتابعة' : maintenance ? 'نعود بعد الصيانة' : 'تعذّر التحقق من الإصدار';
  const message = required
    ? (isWeb ? 'حدّث الصفحة لفتح الإصدار الجديد من وُدَين.' : 'حدّث وُدَين من المتجر، ثم ارجع إلى التطبيق للمتابعة.')
    : maintenance ? 'نتوقف مؤقتًا لصيانة الخدمة.' : 'تحقّق من اتصالك بالإنترنت، ثم حاول مرة أخرى.';

  return <main className="wd-release-screen" dir="rtl" aria-labelledby={titleId}>
    <div className="wd-release-layout">
      <div className="wd-release-content">
        <div className="wd-release-brand">
          <img src="/brand/wudayn-icon-v2.png" alt="" width="64" height="64" />
          <BrandWordmark/>
        </div>
        <h1 ref={heading} id={titleId} tabIndex={-1}>{title}</h1>
        <p className="wd-release-description">{message}</p>
        {showTime && <div className="wd-release-time">
          <span>العودة المتوقعة بتوقيت الرياض</span>
          <time dateTime={end.toISOString()}>{riyadhTime.format(end)}</time>
        </div>}
        {required && resumeHint && <p className="wd-release-hint">{resumeHint}</p>}
      </div>
      <div className="wd-release-actions">
        {actionError && <p className="wd-release-error" role="alert">{actionError}</p>}
        {required && canUpdate && <button type="button" className="f-primary wd-release-primary" onClick={onUpdate}>
          <span>{actionText}</span><ArrowLeft size={19}/>
        </button>}
        <button type="button" className={required && canUpdate ? 'wd-release-retry' : 'f-primary wd-release-primary'}
          onClick={onRetry} disabled={busy}>
          {state === 'unavailable' && !busy ? 'حاول مرة أخرى' : retryText}
        </button>
      </div>
    </div>
  </main>;
}
