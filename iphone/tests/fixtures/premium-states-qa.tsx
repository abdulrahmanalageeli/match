import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CommunitySkeleton } from '../../src/community/CommunitySkeleton';
import { RoutePlaceholder } from '../../src/feedback/RoutePlaceholder';
import { Brand } from '../../src/Brand';
import '../../src/design.css';
import '../../src/screens.css';
import '../../src/motion.css';
import '../../src/community/community.css';

function Preview() {
  const [view, setView] = useState<'profile' | 'directory' | 'conversations' | 'messages' | 'form'>('profile');
  return <main className="app-screen" dir="rtl"><div className="screen-content" style={{ paddingTop: 24 }}><Brand/><p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>معاينة محلية لحالات التحميل · لا بيانات فعلية</p><label>حالة التحميل<select style={{ display: 'block', padding: 12, marginBlock: 12 }} value={view} onChange={event => setView(event.target.value as typeof view)}><option value="profile">ترشيحاتك</option><option value="directory">الدليل</option><option value="conversations">المحادثات</option><option value="messages">الرسائل</option><option value="form">إعداد الملف</option></select></label>{view === 'form' ? <RoutePlaceholder form/> : <CommunitySkeleton variant={view} label="جارٍ تجهيز مساحتك…"/>}</div></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
