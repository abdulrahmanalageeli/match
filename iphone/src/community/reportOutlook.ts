import type { DeepFinding, DeepReview } from './deepCompatibilityModel';

type Outlook = [title: string, opportunity: string, friction: string, action: string];
const repair: Outlook = [
  'ماذا يعني الاعتذار لكل منكما؟', 'إذا تركتما باب الحديث مفتوحًا بعد الاعتذار، فقد يسهل على كل منكما طلب ما يحتاجه حتى بعد أن تهدأ اللحظة.',
  'قد يفهم أحدكما عودة الآخر إلى الموضوع على أنها رفض للاعتذار، بينما لا يزال أثر الكلمة أو الموقف حاضرًا.',
  '«في موقف سابق، ما الذي جعلك تشعر أن الاعتذار وصل؟». قد يتضح أن أحدكما ينتظر اعترافًا بالأثر، والآخر يهتم أكثر بما يتغير بعده.',
];
const outings: Outlook = [
  'كيف يتصور كل منكما الوقت الاجتماعي بعد الزواج؟', 'قد يصبح تنوّع ما يمتعكما فرصة لاكتشاف أماكن وأشخاص ما كان كل منكما ليختارهم وحده.',
  'إذا تولّى شخص واحد اختيار الطلعات دائمًا، فقد تتكرر خططه المفضلة ويبدو حضور الآخر موافقةً على كل التفاصيل.',
  '«صف يوم إجازة تحبه كما تقضيه الآن». استمعا إلى ما يذكره كل طرف تلقائيًا عن الناس والهدوء والوقت لنفسه.',
];
const planning: Outlook = [
  'الوضوح والعفوية في الحياة بعد الزواج', 'قد يتيح قليل من الترتيب لكليكما تجربة شيء جديد براحة أكبر.',
  'قد يبدو تغيير الحجز في آخر لحظة تفصيلًا صغيرًا لأحدكما، بينما يعني للآخر إعادة ترتيب اليوم كله.',
  '«متى أسعدك تغيير غير متوقع، ومتى أربكك؟». المثال يوضح إن كان المهم هو الوقت الكافي أم المشاركة في القرار.',
];
const communication: Outlook = [
  'إذا تكرر سوء الفهم', 'قد يصبح طلب التوضيح طريقة للعودة إلى حديث صعب من دون أن يتراكم أثره.',
  'قد يُفهم التفسير المطوّل على أنه دفاع عن الكلمة الجارحة، خصوصًا قبل أن يشعر الطرف المتأذي بأن أثرها مفهوم.',
  'إذا كان الحديث مناسبًا، يمكن سؤال كل طرف: «حين تُفهم كلمة منك على غير قصدك، ماذا تحب أن يسمع منك الآخر أولًا؟».',
];
const themes: Record<string, Outlook> = {
  'interaction-lasting_tension-make_amends':repair,
  'interaction-conflict_pace-reassurance':repair,
  'interaction-group_energy-try_new_ideas':outings,
  'interaction-social_energy-novelty':outings,
  'interaction-prepare_early-try_new_ideas':planning,
  'interaction-planning-novelty':planning,
  'interaction-harsh_words-perspective_taking':communication,
  'interaction-unfinished_tasks-follow_through':[
    'عندما تزداد مسؤوليات البيت', 'قد يساعد وضوح مَن يتولى كل مهمة على أن يثق كل منكما بأن التفاصيل ستمضي حتى في أسبوع مزدحم.',
    'إذا ظلّ أحدكما يتذكر المواعيد ويتابعها عن الاثنين، فقد يتعب من عبء المتابعة حتى لو تقاسمتما التنفيذ.',
    'اسألا عن معنى المسؤولية بمثال من الحياة الحالية: «حين تتولى أمرًا في العمل أو مع الأهل، كيف تعرف أنه اكتمل؟». قد يشمل المعنى عند أحدكما التذكّر والمتابعة أيضًا.',
  ],
  repair_after_conflict:repair, conflict_response:communication, social_rhythm:outings,
  money_management:[
    'عند أول مصروف غير متوقع', 'قد يمنحكما اتفاق مسبق حرية التصرف في المبالغ الصغيرة مع حماية ما تدّخرانه لهدف مشترك.',
    'عندما يفاجئكما مصروف كبير، قد يتحول النقاش من كيفية تغطيته إلى من كان عليه إخبار الآخر أولًا.',
    '«إذا طرأ مصروف كبير بعد الزواج، ما الذي تحب أن يناقشه الزوجان قبل اتخاذ القرار؟». يكفي فهم المبدأ الذي يهم كل طرف.',
  ],
};

export function addReportOutlook(findings: DeepFinding[], review: DeepReview[]) {
  // Prefer the strongest paired scenes. Use assessed practical topics for
  // couples whose personality answers do not support one of those scenes.
  const ranked = [...findings.filter(f=>f.section==='patterns'), ...findings.filter(f=>f.section==='strengths' || f.section==='differences')];
  const used = new Set<Outlook>();
  for (const source of ranked) {
    const theme = themes[source.id];
    const disclosure = review.find(item=>item.id===source.id);
    if (!theme || used.has(theme) || !disclosure?.ownEvidence.length) continue;
    const [title,opportunity,friction,action] = theme;
    const id = 'outlook-'+source.id;
    findings.push({id,section:'conclusion',kind:'uncertain',text:[title,'فرصة بينكما: '+opportunity,'ما قد يصعب: '+friction,'من الآن: '+action].join('\n\n')});
    review.push({id,section:'conclusion',ownInterpretation:'مشاركة قراءة مستقبلية حول «'+title+'» وخطوة عملية لتجربتها.',ownEvidence:disclosure.ownEvidence});
    used.add(theme);
    if (used.size===2) break;
  }
}
