import { LoaderCircle, RotateCcw, WifiOff } from 'lucide-react';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import type { ThreadConnectionState } from './useThread';
import './thread-connection.css';

export function ThreadConnection({ state, retry }: { state: ThreadConnectionState; retry: () => void }) {
  if (state === 'online') return null;
  const offline = state === 'offline';
  const retrying = state === 'reconnecting';
  return <MotionReveal className="cm-thread-connection" distance={4} duration={220}>
    <span aria-hidden="true">{retrying ? <LoaderCircle size={15} className="cm-spin"/> : <WifiOff size={15}/>}</span>
    <span role="status"><strong>{offline ? 'بانتظار الاتصال' : retrying ? 'نستعيد الاتصال…' : 'تعذّر تحديث المحادثة'}</strong><small>{offline ? 'مسودتك باقية هنا؛ نحدّث المحادثة عند عودة الشبكة.' : retrying ? 'نعيد المحاولة تلقائيًا. يمكنك متابعة كتابة مسودتك.' : 'أعد المحاولة عند تحسّن الاتصال.'}</small></span>
    {!offline && !retrying && <MotionPressButton type="button" onClick={retry} aria-label="إعادة الاتصال بالمحادثة"><RotateCcw size={15}/><span>إعادة المحاولة</span></MotionPressButton>}
  </MotionReveal>;
}
