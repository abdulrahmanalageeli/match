import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chat } from '../../src/community/Community';
import { demoCommunity, demoProfile, type Connection } from '../../src/community/data';
import { MembershipAccess } from '../../src/membership/access';
import { deepSnapshot, deepSections, type DeepStatus } from '../../src/community/deepCompatibilityModel';
import '../../src/design.css';
import '../../src/flows.css';
import '../../src/screens.css';
import '../../src/motion.css';
import '../../src/community/arrivalDiscovery.css';
import '../../src/community/arrivalChat.css';
import '../../src/arrivalSurfaces.css';
import '../../src/typography.css';

// Fictional local fixture only. No RPC, session, model, or purchase call is made.
const params = new URLSearchParams(location.search);
const tier = params.get('tier') === 'free' ? 'free' : 'seriousness';
let status = (params.get('state') ?? 'none') as DeepStatus;
let mine = params.get('mine') === 'true';
let approved: Record<string, boolean> | undefined;
const source = demoCommunity(() => ({ ...demoProfile, gender: 'man' }));
const texts = [
  'تشيران إلى أهمية القرب العاطفي، مع اختلاف في مقدار التواصل اليومي. قد يساعدكما الاتفاق على وقت واضح للحديث، مع احترام مساحة كل طرف.',
  'تتقاطع إجاباتكما في الرغبة باستقرار الأسرة والتخطيط المشترك. يمكن أن يكون هذا أساسًا لاتفاقات عملية حول الأولويات اليومية.',
  'يميل الطرف أ إلى وقت مستقل بعد العمل، بينما يفضّل الطرف ب التواصل للاطمئنان. هذا اختلاف قابل للنقاش وليس حكمًا بعدم التوافق.',
  'تلتقي حاجتكما للقرب مع طريقتين مختلفتين للشعور به: المساحة الهادئة لدى أحدكما، والحديث المنتظم لدى الآخر. توضيح المعنى خلف السلوك قد يقلّل سوء الفهم.',
  'تظهر الإجابات اهتمامًا متبادلًا بالطموح المهني، لكن لا توضّح مقدار المرونة في أوقات العمل. من المفيد مناقشة كيف سيبدو الأسبوع المعتاد لكليكما.',
  'قد يُفهم التأخر في الرد على أنه ابتعاد، مع أنه وقت لاستعادة الطاقة. اتفقا على طريقة بسيطة للتطمين دون تحويل التواصل إلى التزام مرهق.',
  'عندما تحتاج إلى وقت لنفسك بعد يوم طويل، ما العبارة التي تطمئن شريكك؟ وما الوقت المناسب للعودة إلى الحديث؟',
  'لديكما نقاط مشتركة تستحق البناء عليها، واختلافات تحتاج إلى اتفاقات واضحة. هذه قراءة لإجابات محدودة، ولا تتنبأ بنجاح الزواج أو تحل محل معرفتكما ببعض.',
];
const findings = Object.keys(deepSections).map((section, index) => ({ id: `f${index + 1}`, section, kind: index === 4 || index === 7 ? 'uncertain' : index === 1 ? 'strength' : 'manageable', text: texts[index] }));
const view = () => deepSnapshot({ id: 'fixture-analysis', status, canRequest: tier === 'seriousness' && ['none', 'cancelled', 'declined', 'stale'].includes(status), requestedByMe: mine,
  canGenerate: status === 'ready' || status === 'failed', myReviewed: false, peerReviewed: true,
  review: findings.map(item => ({ id: item.id, section: item.section, ownInterpretation:'تحتاج إلى مساحة هادئة لاستعادة طاقتك، مع اهتمام بالقرب العاطفي. قد تساعدك مشاركة معنى هذه المساحة حتى لا تُفهم على أنها ابتعاد.', ownEvidence: [{key:'personality:space',label:'المساحة الشخصية',value:'أحتاج إلى وقت هادئ لنفسي'}, {key:'preference:closeness',label:'القرب العاطفي',value:'مهم جدًا لي'}] })),
  findings: findings.filter(item => !approved || approved[item.id]),
});
source.deepAnalysis = {
  async request(_id, action, decisions) {
    if (action === 'request') { status = 'requested'; mine = true; }
    if (action === 'accept') status = 'ready';
    if (action === 'decline') status = 'declined';
    if (action === 'cancel') status = 'cancelled';
    if (action === 'review') { approved = decisions; status = 'shared'; }
    if (params.get('error') === 'true') throw Error('تعذّر الاتصال الآن. حاول مجددًا.');
    return view();
  },
  async generate() { status = 'review'; },
};
function Fixture() {
  const [connection, setConnection] = useState<Connection>();
  useEffect(() => { void source.inbox().then(rows => setConnection(rows.find(row => row.status === 'accepted'))); }, []);
  return <div className="phone-app"><div className="cm-shell">{connection ? <Chat source={source} connection={connection} back={() => {}} close={() => {}} backLabel="العودة"/> : <p>جارٍ إعداد المعاينة المحلية…</p>}</div></div>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<MembershipAccess.Provider value={{premium:tier !== 'free',tier,upgrade:()=>location.href='/tests/fixtures/membership-qa.html'}}><Fixture/></MembershipAccess.Provider>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
