import { assessmentVersion, comparePreferences, dimensions, preferencePercentage } from './compatibility/model.ts';

// Completed fictional questionnaires, shared across the stories in which a person appears.
const sharedAnswers = {
  children_plan: 'A', residence_plan: 'A', wife_work: 'A', marriage_timeline: 'B',
  family_authority: 'A', financial_provision: 'C', domestic_labor: 'B', housing_arrangement: 'A',
  social_rhythm: 'B', social_boundaries: 'B', conflict_response: 'B', repair_after_conflict: 'B',
  faith_routine: 'B', closeness_pace: 'A', money_management: 'A', parenting_approach: 'B',
};
type Answers = Partial<typeof sharedAnswers>;
type Details = { wants?: Answers; city?: string; requires?: (keyof Answers)[] };

function member(name: string, image: string, gender: 'woman' | 'man', choices: Answers, details: Details = {}) {
  const self = { ...sharedAnswers, ...choices };
  const partner = { ...self, ...details.wants };
  const surveyAnswers: Record<string, string> = { ...self };
  for (const topic of dimensions) {
    surveyAnswers[topic.partnerId] = partner[topic.id as keyof Answers];
  }
  return { id: image, name, image, gender, city: details.city ?? 'الرياض', age: 30,
    preferredMinAge: 24, preferredMaxAge: 39, assessmentVersion, surveyAnswers, hardRequirements: details.requires };
}

const noura = member('نورة', 'noura', 'woman', { marriage_timeline: 'A' }, { wants: { residence_plan: 'B' } });
const lulwa = member('لولوة', 'lulwa', 'woman', { financial_provision: 'B' }, { requires: ['children_plan'] });
const manal = member('منال', 'manal', 'woman', { housing_arrangement: 'B', faith_routine: 'C' });
const sarah = member('سارة', 'sarah', 'woman', { social_rhythm: 'A', social_boundaries: 'A' }, { wants: { social_boundaries: 'B' } });
const abdullah = member('عبدالله', 'abdullah', 'man', { domestic_labor: 'A', financial_provision: 'A', family_authority: 'B' });
const fahad = member('فهد', 'fahad', 'man', { parenting_approach: 'A', closeness_pace: 'B' });
const nawaf = member('نواف', 'nawaf', 'man', { housing_arrangement: 'C', marriage_timeline: 'C', faith_routine: 'A', family_authority: 'B', financial_provision: 'A', closeness_pace: 'C' });
const omar = member('عمر', 'omar', 'man', { social_rhythm: 'C', conflict_response: 'D', repair_after_conflict: 'C', domestic_labor: 'A' }, { wants: { social_boundaries: 'A' } });
const saud = member('سعود', 'saud', 'man', { residence_plan: 'B', marriage_timeline: 'A', social_rhythm: 'C' }, { city: 'الخبر', wants: { social_rhythm: 'B', closeness_pace: 'B' } });

function story(topic: string, reading: string, alternate: readonly [string, string, 'link' | 'part'], her: ReturnType<typeof member>, herQuote: string,
  him: ReturnType<typeof member>, hisQuote: string) {
  const result = comparePreferences(her, him);
  return { topic, reading, alternate, ringEnding: alternate[2], score: preferencePercentage(result?.fit),
    people: [{ name: her.name, image: her.image, quote: herQuote }, { name: him.name, image: him.image, quote: hisQuote }] };
}

export const welcomePairs = [
  story('الخطوة الرسمية', 'هي مستعدة للخطبة خلال ستة أشهر. هو يحتاج أكثر من سنة.',
    ['أول بيت', 'نورة تبي بيت مستقل. نواف يفضّل يعيش مع أهله.', 'part'],
    noura, 'ودي بالخطوة الرسمية خلال ست شهور.', nawaf, 'أحتاج أكثر من سنة قبل ما أتقدّم.'),
  story('عملها بعد الزواج', 'متفقين إنها تكمّل بوظيفتها. يختلفون على تقسيم شغل البيت.',
    ['كلمة الأهل', 'هي تبي القرار بينهم. هو يفضّل ينتظر موافقة أهله.', 'part'],
    noura, 'إذا رجعنا من الدوام، نتقاسم اللي علينا.', abdullah, 'ودي تشتغل، وأشوف أغلب شغل البيت عليها.'),
  story('قرار العيال', 'العيال شرط عند لولوة، وفهد يبي عيال مثلها.',
    ['تربية العيال', 'هي تسمع عذر ولدها أول. هو يبدأ بتطبيق الاتفاق.', 'part'],
    lulwa, 'أبي عيال، ويهمّني يكون حاسم قراره.', fahad, 'إيه، أبي أكون أب.'),
  story('طبع الويكند', 'هي تبي شريك يحب هدوء البيت. هو يستمتع بكثرة الزيارات.',
    ['الادخار', 'إذا جاهم مبلغ إضافي، الاثنين يفضّلون يدّخرونه.', 'link'],
    sarah, 'أرتاح مع شخص يحب القعدة الهادية مثلي.', omar, 'أستانس إذا كان الويكند مليان زيارات.'),
  story('كلمة الأهل', 'كلهم يشاورون أهلهم. هي تبي القرار بينهم، وهو ينتظر موافقة أهله.',
    ['مصروف البيت', 'لولوة تفضّل يتقاسمون المصاريف بالنص.', 'part'],
    lulwa, 'نسمع رأي أهلنا ونقرر سوا.', abdullah, 'إذا أهلي ما وافقوا، أفضّل ننتظر.'),
  story('أول بيت', 'السكن مع أهله يناسبها لفترة. هو يبيه على طول.',
    ['عملها بعد الزواج', 'كلهم مرتاحين إنها تكمّل بوظيفتها.', 'link'],
    manal, 'نسكن معهم إذا اتفقنا متى نستقل.', nawaf, 'ودي نستقر مع أهلي على طول.'),
  story('بين الرياض والخبر', 'هي تبي تبقى بالرياض. هو بالخبر ومستعد ينقل لها.',
    ['الخطوة الرسمية', 'الاثنين يناسبهم يتقدّم رسميًا خلال ست شهور.', 'link'],
    noura, 'ودي أبقى بالرياض بعد الزواج.', saud, 'أنا بالخبر ويناسبني أنقل للرياض.'),
  story('مصروف البيت', 'كلهم يدّخرون. هي تبي المصاريف بالنص، وهو يبيها على قدّ الراتب.',
    ['قرار العيال', 'لولوة تبي عيال، وسعود يشاركها هالرغبة.', 'link'],
    lulwa, 'أفضل ندفع الأساسيات بالنص.', saud, 'أشوف كل واحد يدفع على قدّ راتبه.'),
  story('حدود الطلعات', 'هي تكتفي بجمعات الأهل، ومرتاحين إنه يحضر الفعاليات لحاله.',
    ['وقت الزعل', 'هي تبي موعد يرجعون فيه للنقاش. هو يفضّل يتركه مفتوح.', 'part'],
    sarah, 'أنا أحب جمعات الأهل، وعادي يروح الفعالية بدوني.', omar, 'أحب بعض الفعاليات، وعادي ما تجي معي.'),
  story('وقت الزعل', 'هي تبي تعرف متى يرجعون للسالفة. هو يفضّل يتركها مفتوحة.',
    ['الادخار', 'إذا جاهم مبلغ إضافي، الاثنين يفضّلون يدّخرونه.', 'link'],
    noura, 'نهدأ، بس نتفق متى نرجع نتكلم.', omar, 'إذا زعلت أنسحب وما أحب أرجع للموضوع بسرعة.'),
  story('بداية التعارف', 'هو يرتاح لكلمة اهتمام واضحة. هي تشارك تفاصيلها شوي شوي.',
    ['أول بيت', 'هي يناسبها تسكن مع أهله لفترة. هو يبي بيت مستقل.', 'part'],
    manal, 'أشارك تفاصيلي شوي شوي.', fahad, 'أرتاح إذا سمعت منها إنّي مهم عندها.'),
  story('وقت للعبادة', 'ودّها يخصّصون وقت يقرون فيه سوا. هو يفضّل يقرأ لحاله.',
    ['كلمة الأهل', 'هي تبي القرار بينهم. هو ينتظر موافقة أهله.', 'part'],
    manal, 'ودي يكون لنا وقت ثابت نقرأ فيه قرآن سوا.', nawaf, 'أفضل أرتّب وقت عبادتي بنفسي.'),
  story('لو خالف ولدهم اتفاق', 'هي تسمع عذره أول. هو يطبّق اللي اتفقوا عليه، ثم يسمعه.',
    ['عملها بعد الزواج', 'متفقين على استمرار سارة في عملها بعد الزواج.', 'link'],
    sarah, 'ودي أسمع وش صار قبل أقرر.', fahad, 'أطبّق اللي اتفقنا عليه، وبعدين أسمع منه.'),
];
