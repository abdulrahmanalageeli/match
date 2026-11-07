import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SupportContact, SupportProvider } from '../../src/help/SupportContact';
import type { SupportSource, SupportTicket } from '../../src/help/support';
import '../../src/design.css';
import '../../src/screens.css';

// Synthetic session-memory only. No Supabase client, account, or network call.
type Actor = 'member' | 'guardian';
const names: Record<Actor, string> = { member: 'العضو التجريبي', guardian: 'فرد الأسرة التجريبي' };
const tickets: Record<Actor, SupportTicket[]> = { member: [], guardian: [] };
const ids: Record<Actor, Map<string, string>> = { member: new Map(), guardian: new Map() };
const attempts: Record<Actor, number> = { member: 0, guardian: 0 };
let slowList = false, loseNextResponse = false;
const changed = () => window.dispatchEvent(new Event('support-qa-change'));
function sourceFor(actor: Actor): SupportSource {
  return {
    async list() {
      const items = structuredClone(tickets[actor]);
      if (slowList) await new Promise(resolve => setTimeout(resolve, 5000));
      return { items, nextCursor: null };
    },
    async create(input) {
      attempts[actor]++; changed();
      const existingId = ids[actor].get(input.clientId), existing = tickets[actor].find(ticket => ticket.id === existingId);
      if (existing) return structuredClone(existing);
      const now = new Date().toISOString();
      const ticket: SupportTicket = { id: `${actor}-receipt-${tickets[actor].length + 1}`, category: input.category, subject: input.subject, body: input.body, status: 'open', response: null, createdAt: now, updatedAt: now, revision: 1 };
      tickets[actor].unshift(ticket); ids[actor].set(input.clientId, ticket.id); changed();
      if (loseNextResponse) { loseNextResponse = false; throw Error('اختبار محلي: حُفظ الطلب وضاع الرد. أعد المحاولة بنفس التفاصيل.'); }
      return structuredClone(ticket);
    },
  };
}
const sources = { member: sourceFor('member'), guardian: sourceFor('guardian') };

function Fixture() {
  const [actor, setActor] = useState<Actor | 'signed-out'>('member'), [revision, setRevision] = useState(0), [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { const refresh = () => setRevision(value => value + 1); window.addEventListener('support-qa-change', refresh); return () => { window.removeEventListener('support-qa-change', refresh); if (timer.current) clearTimeout(timer.current); }; }, []);
  function schedule(work: () => void, label: string) {
    if (timer.current) clearTimeout(timer.current);
    setNotice(label + ' خلال ثانيتين؛ افتح المساعدة الآن.');
    timer.current = setTimeout(() => { work(); setNotice(label + ' — تم محليًا.'); }, 2000);
  }
  function staffReply(target: Actor) {
    const ticket = tickets[target][0];
    if (!ticket) { setNotice('أنشئ طلبًا لهذا الحساب التجريبي أولًا.'); return; }
    ticket.status = 'resolved'; ticket.response = `رد تجريبي خاص بـ${names[target]} على ${ticket.id}.`; ticket.updatedAt = new Date().toISOString(); ticket.revision++; changed();
    setNotice('أُضيف الرد التجريبي؛ افتح المساعدة واضغط تحديث.');
  }
  return <main dir="rtl" style={{ maxWidth: 520, margin: 'auto', padding: 18 }}>
    <h1 style={{ fontSize: 22 }}>اختبار المساعدة محليًا</h1>
    <p>بيانات وهمية في الذاكرة فقط. إعادة تحميل الصفحة تمسحها. لا اتصال بخادم ولا إرسال حقيقي.</p>
    <nav aria-label="الحساب التجريبي" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button onClick={() => setActor('member')}>العضو</button><button onClick={() => setActor('guardian')}>فرد الأسرة</button><button onClick={() => setActor('signed-out')}>خروج تجريبي</button>
    </nav>
    <p role="status">الحساب الحالي: {actor === 'signed-out' ? 'دون حساب' : names[actor]}</p>
    <fieldset style={{ display: 'grid', gap: 12, marginBlock: 16 }}><legend>تحكم الاختبار فقط</legend>
      <label><input type="checkbox" checked={slowList} onChange={event => { slowList = event.target.checked; changed(); }}/> تأخير رد القائمة ٥ ثوانٍ لاختبار تبدّل الحساب</label>
      <label><input type="checkbox" checked={loseNextResponse} onChange={event => { loseNextResponse = event.target.checked; changed(); }}/> فقدان الرد مرة بعد حفظ الطلب لاختبار إعادة المحاولة</label>
      <button onClick={() => schedule(() => setActor(current => current === 'member' ? 'guardian' : 'member'), 'تبديل الحساب')}>تبديل الحساب بعد ثانيتين</button>
      {actor !== 'signed-out' && <><button onClick={() => staffReply(actor)}>رد موظف تجريبي على أحدث طلب</button><button onClick={() => schedule(() => staffReply(actor), 'إضافة رد الموظف')}>رد تجريبي بعد ثانيتين</button></>}
    </fieldset>
    <p role="status">{notice}</p>
    <output aria-label="عدادات الطلبات التجريبية" data-revision={revision}>العضو: {tickets.member.length} طلب، {attempts.member} محاولة إرسال · الأهل: {tickets.guardian.length} طلب، {attempts.guardian} محاولة إرسال</output>
    <SupportProvider source={actor === 'signed-out' ? null : sources[actor]}><SupportContact subject="طلب مساعدة تجريبي"/></SupportProvider>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
