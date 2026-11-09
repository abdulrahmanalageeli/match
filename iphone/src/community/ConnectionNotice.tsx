import { useEffect, useState } from 'react';
import { WifiOff } from "../BrandIcons";
import { MotionReveal, MotionPressButton } from '../motion/Reanimated';
import { retryReadsEvent } from './readRecovery';
import './everyday.css';

export function ConnectionNotice() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  if (!offline) return null;
  return <MotionReveal className="nf-connection-notice" dir="rtl" role="status" distance={4} duration={220}>
    <WifiOff size={18} aria-hidden="true"/><span><strong>اتصالك غير متاح الآن</strong><small>نحدّث البيانات عند عودة الاتصال. تبقى مسودة حديثك محفوظة في هذه الجلسة.</small></span>
    <MotionPressButton onClick={() => { setOffline(!navigator.onLine); window.dispatchEvent(new CustomEvent(retryReadsEvent)); }}>إعادة المحاولة</MotionPressButton>
  </MotionReveal>;
}
