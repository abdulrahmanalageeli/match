import { X } from '../BrandIcons';
import './noticeSheet.css';

const dateFormat = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh',
});

type Props = { sender: string; issuedAt?: string; onClose: () => void; busy?: boolean };

export function NoticeHeader({ sender, issuedAt, onClose, busy }: Props) {
  const date = issuedAt && new Date(issuedAt);
  return <header className="wd-notice-header">
    <img src="/brand/wudayn-emblem-v2.png" width="42" height="42" alt="" />
    <div className="wd-notice-byline">
      <span>{sender}</span>
      {date && Number.isFinite(date.getTime()) && <time dateTime={issuedAt}>{dateFormat.format(date)}</time>}
    </div>
    <button type="button" className="wd-notice-close" onClick={onClose} disabled={busy} aria-label="إغلاق"><X size={17} /></button>
  </header>;
}
