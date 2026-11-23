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

type Factor = readonly [id: keyof Answers, title: string, reading: string];

function story(first: Factor, second: Factor, her: ReturnType<typeof member>, herQuote: string,
  him: ReturnType<typeof member>, hisQuote: string) {
  const fit = comparePreferences(her, him)?.fit;
  function describe([id, title, reading]: Factor) {
    const status = fit?.preferenceEvidence?.topics.find(topic => topic.id === id)?.status;
    return { id, title, reading, status };
  }
  return { factors: [describe(first), describe(second)] as const, score: preferencePercentage(fit),
    people: [{ name: her.name, image: her.image, quote: herQuote }, { name: him.name, image: him.image, quote: hisQuote }] };
}

export const welcomePairs = [
  story(['marriage_timeline', 'الخطوة الرسمية', 'هي تبي الخطبة خلال ستة أشهر. هو يحتاج أكثر من سنة.'],
    ['housing_arrangement', 'أول بيت', 'نورة تبي بيت مستقل. نواف يفضّل يعيش مع أهله.'],
    noura, 'ودي بالخطوة الرسمية خلال ست شهور.', nawaf, 'أحتاج أكثر من سنة قبل ما أتقدّم.'),
  story(['residence_plan', 'بين الرياض والخبر', 'هي تبي تبقى بالرياض. هو بالخبر ومستعد ينقل لها.'],
    ['marriage_timeline', 'الخطوة الرسمية', 'الاثنين يناسبهم يتقدّمون رسميًا خلال ستة أشهر.'],
    noura, 'ودي أبقى بالرياض بعد الزواج.', saud, 'أنا بالخبر ويناسبني أنقل للرياض.'),
  story(['wife_work', 'عملها بعد الزواج', 'الاثنين يفضّلون إنها تكمّل بوظيفتها.'],
    ['domestic_labor', 'شغل البيت', 'هي تبي يتقاسمون شغل البيت. هو يفضّل أغلبه عليها.'],
    noura, 'ودي أكمل بوظيفتي ونتقاسم شغل البيت.', abdullah, 'ودي تشتغل، وأشوف أغلب شغل البيت عليها.'),
  story(['children_plan', 'قرار العيال', 'العيال شرط عند لولوة، وفهد يبي عيال مثلها.'],
    ['parenting_approach', 'تربية العيال', 'هي تسمع عذر ولدها أول. هو يبدأ بتطبيق الاتفاق.'],
    lulwa, 'أبي عيال، ويهمّني يكون حاسم قراره.', fahad, 'إيه، أبي أكون أب.'),
  story(['social_rhythm', 'طبع الويكند', 'هي تبي هدوء البيت. هو يستمتع بكثرة الزيارات.'],
    ['money_management', 'الادخار', 'إذا جاهم مبلغ إضافي، الاثنين يفضّلون يدّخرونه.'],
    sarah, 'أرتاح مع شخص يحب القعدة الهادية مثلي.', omar, 'أستانس إذا كان الويكند مليان زيارات.'),
  story(['family_authority', 'كلمة الأهل', 'هي تبي القرار بينهم. هو يفضّل ينتظر موافقة أهله.'],
    ['financial_provision', 'مصروف البيت', 'هي تبي المصاريف بالنص. هو يتكفّل بالأساسيات.'],
    lulwa, 'نسمع رأي أهلنا ونقرر سوا.', abdullah, 'إذا أهلي ما وافقوا، أفضّل ننتظر.'),
  story(['housing_arrangement', 'أول بيت', 'السكن مع أهله يناسبها لفترة. هو يبيه على طول.'],
    ['wife_work', 'عملها بعد الزواج', 'الاثنين يفضّلون إنها تكمّل بوظيفتها.'],
    manal, 'نسكن معهم إذا اتفقنا متى نستقل.', nawaf, 'ودي نستقر مع أهلي على طول.'),
  story(['financial_provision', 'مصروف البيت', 'هي تبي المصاريف بالنص. هو يبيها على قدّ الراتب.'],
    ['children_plan', 'قرار العيال', 'لولوة وسعود كلهم يبون عيال.'],
    lulwa, 'أفضل ندفع الأساسيات بالنص.', saud, 'أشوف كل واحد يدفع على قدّ راتبه.'),
  story(['social_boundaries', 'حدود الطلعات', 'هي تكتفي بجمعات الأهل. هو يختار فعاليات تناسب حدوده.'],
    ['conflict_response', 'وقت الزعل', 'هي تحدد وقت يرجعون فيه للنقاش. هو يفضّل يتركه مفتوح.'],
    sarah, 'أنا أحب جمعات الأهل، وعادي يروح الفعالية بدوني.', omar, 'أحب بعض الفعاليات، وعادي ما تجي معي.'),
  story(['conflict_response', 'وقت الزعل', 'هي تبي وقت واضح للرجوع للنقاش. هو يفضّل يأجّله.'],
    ['money_management', 'الادخار', 'إذا جاهم مبلغ إضافي، الاثنين يفضّلون يدّخرونه.'],
    noura, 'نهدأ، بس نتفق متى نرجع نتكلم.', omar, 'إذا زعلت أنسحب وما أحب أرجع للموضوع بسرعة.'),
  story(['closeness_pace', 'بداية التعارف', 'هو يرتاح لكلمة اهتمام واضحة. هي تشارك تفاصيلها شوي شوي.'],
    ['housing_arrangement', 'أول بيت', 'هي يناسبها تسكن مع أهله لفترة. هو يبي بيت مستقل.'],
    manal, 'أشارك تفاصيلي شوي شوي.', fahad, 'أرتاح إذا سمعت منها إنّي مهم عندها.'),
  story(['faith_routine', 'وقت للعبادة', 'ودّها يقرون سوا بوقت ثابت. هو يفضّل يرتّب عبادته بنفسه.'],
    ['family_authority', 'كلمة الأهل', 'هي تبي القرار بينهم. هو ينتظر موافقة أهله.'],
    manal, 'ودي يكون لنا وقت ثابت نقرأ فيه قرآن سوا.', nawaf, 'أفضل أرتّب وقت عبادتي بنفسي.'),
  story(['parenting_approach', 'لو خالف ولدهم اتفاق', 'هي تسمع عذره أول. هو يطبّق الاتفاق ثم يسمعه.'],
    ['wife_work', 'عملها بعد الزواج', 'الاثنين يفضّلون إنها تكمّل بوظيفتها.'],
    sarah, 'ودي أسمع وش صار قبل أقرر.', fahad, 'أطبّق اللي اتفقنا عليه، وبعدين أسمع منه.'),
];
