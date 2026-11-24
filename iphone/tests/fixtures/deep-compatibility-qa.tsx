import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chat } from '../../src/community/Community';
import { demoCommunity, demoProfile, type Connection } from '../../src/community/data';
import { MembershipAccess } from '../../src/membership/access';
import { deepSnapshot, type DeepStatus } from '../../src/community/deepCompatibilityModel';
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
// Browser-only inset simulation; production values come from the native bridge.
for (const [query, property] of [['safeTop','--nf-native-safe-top'],['safeBottom','--nf-native-safe-bottom']]) {
  const value = Number(params.get(query) ?? 0);
  if (Number.isFinite(value) && value >= 0 && value <= 80) document.documentElement.style.setProperty(property, `${value}px`);
}
const tier = params.get('tier') === 'free' ? 'free' : 'seriousness';
let status = (params.get('state') ?? 'none') as DeepStatus;
let mine = params.get('mine') === 'true';
let approved: Record<string, boolean> | undefined;
const source = demoCommunity(() => ({ ...demoProfile, gender: 'man' }));
// Hand-authored QA examples, not output from a live AI call.
// Fictional contrast: A values reassurance but is slower to initiate/disclose;
// B initiates and seeks discussion sooner, but finds stating needs harder.
const texts = [
  'قد لا تكون المسافة بينكما في مقدار الاهتمام، بل في الطريقة التي يصبح بها مرئيًا. الطرف أ يقدّر الطمأنة، لكنه أقل ميلًا للمبادرة ومشاركة المشاعر بسهولة؛ والطرف ب يبادر بالحديث أكثر، مع صعوبة أكبر في التصريح بما يحتاجه. قد يبدأ ب الحوار ثم ينتظر أن يلتقط أ احتياجه دون طلب، بينما ينتظر أ علامة اهتمام أوضح. هذا احتمال من تركيب الإجابات، لا وصف لسلوك حدث. ما الإشارة التي تجعل كل طرف يعرف أن الآخر مهتم، دون أن يضطر إلى تخمينها؟',
  'الميل إلى الحوار العميق لدى كليكما قد يجعل الحديث الجاد مساحة قرب، لكن توقيت الوصول إليه قد يختلف. الطرف أ يصف انفتاحًا عاطفيًا أقل، بينما لدى ب استعداد أكبر للمشاركة عند الشعور بالأمان. قد تساعد مبادرة ب أ على الدخول في الحديث إذا لم تتحول كثرة الأسئلة إلى ضغط. وفي المقابل قد يمنح عمق أ الحوار تركيزًا عندما يصبح مرتاحًا. لا نعرف بعد ما الذي يصنع هذا الأمان لكل منكما؛ ابدآ بمثال شخصي صغير يختار صاحبه مقدار تفاصيله.',
  'قد تحمل لحظة الصمت معنيين مختلفين. أ أكثر راحة بالهدوء، وأقل ميلًا إلى الحديث وقت الضغط؛ ب يفضّل التعبير عن الضغط ويقدّر الطمأنة المتكررة. بعد يوم مرهق قد يرى أحدهما الوجود الهادئ قربًا، بينما يحتاج الآخر كلمة حتى يشعر بالقرب نفسه. لا تثبت هذه الإجابات أن أ ينسحب أو أن ب يلحّ. السؤال المفيد ليس من يحتاج تواصلًا أكثر، بل كيف نعلن أن هدوءنا راحة وليس ابتعادًا؟',
  'لدى أ رغبة واضحة في الطمأنة، مع مبادرة أقل بالحديث. هذا قد يجعل احتياجه للقرب أقل وضوحًا مما يشعر به داخليًا. وبما أن ب يبادر أكثر لكنه أقل مباشرة في طلب احتياجه، فقد يقوم كلاهما بفعل ينتظر أن يُفهم دون شرح: أحدهما ينتظر المبادرة والآخر ينتظر تقديرها. هذا ليس تناقضًا ولا دليلًا على عدم الاهتمام. جرّبا توضيح ما تحبانه في مبادرة الآخر، وما الذي تريدان طلبه بدل انتظار أن يُفهم تلقائيًا.',
  'تفضيل أ للتخطيط وحماسه للتجديد يمكن أن يجتمعا: قد يحب التجربة الجديدة عندما يعرف إطارها مسبقًا. ب أكثر حماسًا للتجديد وأقل تشددًا في الترتيب المسبق، وقد يفهم اقتراحًا مفاجئًا على أنه اهتمام. لا تعني استجابة أ المتحفظة رفضًا للفكرة بالضرورة؛ قد تكون طلبًا للوضوح. لا توضح الإجابات إن كان الوقت أو المكان أو الكلفة أهم تفاصيل التخطيط. أي جزء من الخطة نثبته ليبقى بقيتها ممتعًا ومرنًا؟',
  'في الخلاف قد تظهر حلقة تحتاج انتباهًا: ب يفضّل النقاش سريعًا، وأ أقل ميلًا لمناقشته فورًا. إذا فهم ب التأجيل بوصفه تجاهلًا فقد يزيد الأسئلة، وإذا فهم أ ذلك ضغطًا فقد يقل كلامه. هذه حلقة افتراضية وليست توقعًا مؤكدًا، والهدوء وحده لا يثبت تجنبًا. يمكن اختبار اتفاق بسيط: من يطلب مهلة يوضح أنها للهدوء ويحدد وقت العودة، ويسأل الطرف الآخر عن الحد الأدنى من الطمأنة الذي يحتاجه خلالها.',
  'تخيّلا أن أحدكما عاد مرهقًا ولم يبدأ الحديث. ما أول معنى سيخطر لك: يحتاج هدوءًا، أم ينتظر سؤالي، أم لا يريد التواصل؟ ثم اسألا: ما الجملة القصيرة التي ستغيّر هذا التفسير؟ هذا يختبر كيف تقرآن الصمت والمبادرة، لا مدى حبكما. سؤال المتابعة: لو قال «أحتاج نصف ساعة ثم نكمل»، هل يطمئنك وضوح العودة، أم تحتاج أيضًا كلمة اهتمام قبلها؟ لا توجد إجابة مثالية؛ المهم فهم الفرق.',
  'الفرصة هنا ليست أن تصبحا متماثلين، بل أن تصبح الإشارات بينكما أوضح. جرّبا اتفاقًا صغيرًا على المبادرة أو مهلة الخلاف، ثم لاحظا إن كان كل طرف يشعر بأنه مفهوم دون أن يتخلى عن احتياجه. إذا لم ينجح، اسألا أي تفسير لم يكن دقيقًا بدل الحكم على الشخصية. الإجابات تصف انطباعكما عن أنفسكما، ولا تخبرنا بعد كيف تتصرفان معًا أو هل تلتزمان باتفاقاتكما؛ هذا ما يحتاج معرفة وحوارًا فعليين.',
];
const fixtureSections = ['summary','strengths','differences','patterns','expectations','friction','conversation','conclusion'];
const findings = fixtureSections.map((section, index) => ({ id: `f${index + 1}`, section, kind: index === 7 ? 'uncertain' : index === 1 ? 'strength' : 'manageable', text: texts[index] }));
findings.push(
  {id:'f9',section:'patterns',kind:'manageable',text:'الرغبة في حوار عميق لا تعني سهولة كشف المشاعر. أ يفضّل التعمق لكنه يصف انفتاحًا أقل، وقد يشعر بقرب من النقاش الفكري قبل الحديث الشخصي. ب أكثر مبادرة وانفتاحًا، لكنه قد لا يقول بوضوح ما يريد سماعه. قد يستمران في حديث ممتع دون أن يعرف أحدهما أن الآخر ينتظر مشاركة شخصية. هذا تفسير محتمل، وليس استنتاجًا أن أحدكما يخفي شيئًا. ما الموضوع الذي يساعدك على الشعور بالأمان، وما السؤال الذي يأتي مبكرًا عليك؟'},
  {id:'f10',section:'patterns',kind:'manageable',text:'المبادرة بالنقاش والقدرة على تسمية الاحتياج ليستا الشيء نفسه. ب يفضّل حل الخلاف سريعًا، مع مباشرة أقل في التعبير عن الاحتياج؛ قد يبدأ الحديث بينما لم تتضح له بعد جملة «ما أحتاجه منك». أ قد يحتاج وقتًا أطول قبل النقاش، وهو ما قد يمنحه فرصة لصياغة الرد أو قد يُفهم خطأً كتأجيل. لا نعرف أي الاحتمالين يحدث فعليًا. قبل مناقشة الحل، جرّبا أن يصف كل طرف احتياجه بجملة واحدة دون اتهام.'},
  {id:'f11',section:'patterns',kind:'manageable',text:'اختلاف الطاقة الاجتماعية قد يظهر في توقيت القرب، لا في قيمته. أ يصف طاقة أقل بعد اللقاءات، بينما ب يستمد منها نشاطًا أكبر ويحب التواصل المتكرر. بعد مناسبة عائلية قد يرغب ب في استكمال الحديث، في الوقت الذي لا يكون أ مستعدًا للكلام بالقدر نفسه. لا يثبت ذلك عزلة أ ولا أن ب لا يحترم المساحة. اسألا عن شكل العودة المريح بعد اللقاءات: هل يكفي وقت هادئ معًا، أم يحتاج أحدكما حديثًا قصيرًا أولًا؟'}
);
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
