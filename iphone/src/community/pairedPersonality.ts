import { personalityQuestionsFor } from '../compatibility/personality.ts';
import type { DeepFinding, DeepReview } from './deepCompatibilityModel';

// Each scene requires affirmative evidence on two distinct items, one from
// each person. Low endorsement alone never establishes the opposite trait.
type Scene = {
  items: [string, string];
  title: string;
  meaning: (first: string, second: string) => string;
  shared: string;
  experiment: string;
  detail?: {items:[string,string]; meaning:(first:string,second:string)=>string};
};

const current: Scene[] = [
  {
    items:['lasting_tension','make_amends'], title:'قد يصل الاعتذار قبل أن يهدأ أثر الموقف',
    meaning:(a,b)=>`ربما يبقى أثر الموقف ${a} بعد انتهاء الخلاف، بينما تأتي محاولة الإصلاح ${b} مبكرًا. هنا قد يكون الاعتذار صادقًا ومقبولًا، ومع ذلك يظلّ الحديث غير مكتمل.`,
    shared:'قد يبادر كل منكما بالصلح ويظل في نفسه شيء من الموقف. إذا عاد أحدكما إليه لاحقًا، فقد يكون بحاجة إلى أن يُسمع مرة أخرى.',
    detail:{items:['perspective_taking','calm_before_acting'],meaning:(a,b)=>`قد تجتمع ${a} القدرة على فهم وجهة النظر الأخرى مع بقاء الزعل. وقد يجتمع ${b} الهدوء مع الرغبة في تدارك الخطأ. فهم سبب ما حدث وقبول الاعتذار وعودة الارتياح قد تقع في ثلاث لحظات مختلفة.`},
    experiment:'حين تعتذر لشخص أو يعتذر لك، ما الذي يخبرك أن ما أزعجك قد فُهم؟',
  },
  {
    items:['group_energy','try_new_ideas'], title:'الحماس للخروج قد يكون لسببين مختلفين',
    meaning:(a,b)=>`قد تأتي متعة الخرجة ${a} من الناس الذين فيها، و${b} من تجربة المكان للمرة الأولى. قد تتحمسان للدعوة نفسها ثم يختلف شعوركما حين يطول اللقاء بعد انتهاء النشاط.`,
    shared:'قد يجذبكما في الخرجة وجهان: تجربة شيء جديد ولقاء الناس. ويمكن لكل منكما تسمية الجانب الذي يجذبه حين يتحدث عن اهتماماته.',
    detail:{items:['start_conversation','prepare_early'],meaning:(a,b)=>`قد تبدأ الأحاديث تلقائيًا ${a}، بينما ترتبط متعة التجربة الجديدة ${b} بمعرفة ترتيباتها مسبقًا. دعوة ضيف إضافي في آخر لحظة قد تغيّر معنى الخطة لكل منكما.`},
    experiment:'ما آخر مناسبة استمتعت بها؟ ما الذي بقي في ذاكرتك منها: الناس، أم الفكرة الجديدة، أم شيء آخر؟',
  },
  {
    items:['unfinished_tasks','follow_through'], title:'ما الذي يعنيه الالتزام لكل منكما؟',
    meaning:(a,b)=>`حين تكثر التفاصيل قد تبقى مهمة بدأ تنفيذها ${a} مفتوحة، بينما يحظى الوفاء بالموعد باهتمام خاص ${b}. قد يساعد التذكير مرة، ثم يصبح مزعجًا إذا صار أحدكما مسؤولًا عن المتابعة دائمًا.`,
    shared:'قد تحرصان على الوفاء بالوعد، وتبقى مع ذلك بعض التفاصيل معلّقة عند ازدحام الأسبوع. قد يكون موضع التعثر آخر خطوة صغيرة، حتى حين تكون النية واضحة عندكما.',
    detail:{items:['try_new_ideas','perspective_taking'],meaning:(a,b)=>`قد تكون البداية الجديدة أسهل ${a} من متابعة آخر التفاصيل، بينما يمكن أن يجتمع ${b} تفهّم سبب التأخير مع الحاجة إلى موعد واضح. التفهّم وحده لا يوزّع المسؤولية.`},
    experiment:'هل تتذكر التزامًا صعب الوفاء به في العمل أو الدراسة؟ كيف عرفت أن المطلوب قد اكتمل؟',
  },
  {
    items:['prepare_early','try_new_ideas'], title:'متى تكون المفاجأة مريحة؟',
    meaning:(a,b)=>`قد يبدأ الاستمتاع بالرحلة ${a} حين تتضح ترتيباتها، و${b} حين تظهر فرصة لتجربة شيء جديد. قد تقصدان الاستمتاع باليوم نفسه حتى لو فضّل أحدكما حجز التفاصيل وترك الآخر بعضها مفتوحًا.`,
    shared:'قد تستمتعان بالتحضير وبالتجديد معًا. السؤال العملي هو أي جزء من الرحلة يستحق الحجز المبكر وأي جزء يفقد متعته إذا تقرر مسبقًا.',
    experiment:'متى تستمتع بالمفاجأة، ومتى تحب أن تعرف التفاصيل مسبقًا؟',
  },
  {
    items:['harsh_words','perspective_taking'], title:'متى يصبح السؤال إنصاتًا؟',
    meaning:(a,b)=>`وقت الزعل قد تسبق الكلمات المقصود ${a}، بينما يظهر الحرص على فهم المعنى ${b}. سؤال التوضيح قد يفتح باب الرجوع عن كلمة جارحة، لكن تكراره في اللحظة نفسها قد يطيل الخلاف.`,
    shared:'قد تحرصان على فهم وجهتي النظر ثم تخرج كلمة أقسى مما قصدها صاحبها. أحيانًا يكون أول ما يحتاجه الطرف الآخر اعترافًا بأثر الكلمة، قبل تفسير معناها.',
    experiment:'هل مرّت بك كلمة فُهمت على غير قصدك؟ ما الذي ساعد على توضيح معناها؟',
  },
];
const legacy: Scene[] = [
  {
    items:['conflict_pace','reassurance'], title:'هل نحلّ الخلاف الآن أم نطمئن أولًا؟',
    meaning:(a,b)=>`قد تأتي المبادرة إلى فتح الخلاف ${a}، بينما يكون سماع ما يطمئن على العلاقة مهمًا ${b}. قد ينشغل أحدكما بتفاصيل الحل بينما لا يزال الآخر يتساءل عمّا يعنيه الخلاف لكما.`,
    shared:'قد ترغبان في حلّ الخلاف فورًا وسماع ما يطمئن على العلاقة في الوقت نفسه. بدء الحديث بالحل وحده قد يترك السؤال الأهم معلّقًا.',
    experiment:'في خلاف سابق مع شخص تثق به، ما الذي أراحك أكثر: وضوح الحل أم الشعور بأن رأيك سُمع؟',
  },
  {...current[3],items:['planning','novelty']},
  {...current[1],items:['social_energy','novelty']},
];

type Answers = Readonly<Record<string,string>> | undefined;
export function pairedPersonality(version: string, own: Answers, peer: Answers, alias: string) {
  const questions = personalityQuestionsFor(version);
  const score = (answers: Answers, id: string) => ['A','B','C','D','E'].indexOf(answers?.[id] ?? '') + 1;
  const scenes = version === 'personality-v2' ? current : legacy;
  const candidates = scenes.flatMap(scene => {
    const [a,b] = scene.items;
    const [ma,mb,pa,pb] = [score(own,a),score(own,b),score(peer,a),score(peer,b)];
    if (![ma,mb,pa,pb].every(Boolean)) return [];
    const forward = Math.min(ma,pb) >= 4, backward = Math.min(pa,mb) >= 4;
    if (!forward && !backward) return [];
    const shared = forward && backward;
    const first = forward?'لديك':`لدى ${alias}`, second = forward?`لدى ${alias}`:'لديك';
    const body = shared ? scene.shared : scene.meaning(first,second);
    const detail = version === 'personality-v2' ? scene.detail : undefined;
    const useDetail = !shared && detail && score(forward?own:peer,detail.items[0])>=4
      && score(forward?peer:own,detail.items[1])>=4;
    const nuance = useDetail ? detail.meaning(first,second) : undefined;
    const ownKeys = useDetail ? [...scene.items, detail.items[forward?0:1]] : scene.items;
    // Select more distinctive scenes first. This only orders the reading.
    const priority = shared ? 0 : Math.abs(ma-pa) + Math.abs(mb-pb);
    return [{scene,body,nuance,ownKeys,priority}];
  }).sort((left,right)=>Number(!!right.nuance)-Number(!!left.nuance) || right.priority-left.priority);
  const findings: DeepFinding[] = [], review: DeepReview[] = [];
  for (const {scene,body,nuance,ownKeys} of candidates.slice(0,3)) {
    const id = 'interaction-'+scene.items.join('-');
    const ownEvidence = ownKeys.map(key=>{
      const question=questions.find(q=>q.id===key)!;
      return {key:'personality:'+key,label:question.prompt,value:question.options.find(o=>o.code===own?.[key])!.label};
    });
    findings.push({id,section:'patterns',kind:'uncertain',text:[scene.title,body,nuance,scene.experiment].filter(Boolean).join('\n\n')});
    review.push({id,section:'patterns',ownInterpretation:`تربط هذه القراءة بين «${questions.find(q=>q.id===scene.items[0])!.title}» و«${questions.find(q=>q.id===scene.items[1])!.title}» في موقف يومي.`,ownEvidence});
  }
  return {findings,review};
}
