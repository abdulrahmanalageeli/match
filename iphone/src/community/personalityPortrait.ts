import { personalityQuestionsFor } from '../compatibility/personality.ts';
import { dimensionsForVersion } from '../compatibility/practical-catalog.ts';
import type { DeepReview } from './deepCompatibilityModel';

type Inputs = { personalityAnswers?: Record<string,string>; surveyAnswers?: Record<string,string> };
type Motif = [string, string, string];

// Combine statements within one person's own instrument before considering the pair.
const current: Motif[] = [
  ['quiet_settings','explore_views','قد يكون المكان هادئًا فيما يدور في ذهنك حديث مليء بالأسئلة. قد يلفت انتباهك اختلاف الرأي أكثر من صخب الجلسة نفسها.'],
  ['stress_recovery','prefer_familiar','قد ترتاح للمألوف ومع ذلك تستعيد توازنك سريعًا إذا طرأ أمر مزعج. ربما يلاحظ الناس تمسّكك بعادة تحبها قبل أن يلاحظوا مرونتك حين تتغيّر الظروف.'],
  ['start_conversation','explore_views','قد تستوقفك في الحديث إجابة لم تتوقّعها. يبدو أن مبادرتك بالسؤال طريقة لفهم كيف يرى الشخص الأمور، خصوصًا حين يختلف رأيه عنك.'],
  ['calm_before_acting','make_amends','قد يلاحظ الناس هدوءك قبل أن يلاحظوا اهتمامك. حين تؤذي كلمة منك أحدًا، يبدو أن ما تفعله بعدها جزء من معنى الاعتذار عندك.'],
  ['perspective_taking','lasting_tension','قد تفهم وجهة نظر من أزعجك قبل أن يزول أثر الموقف عنك. من يسمع تفهّمك قد يظن أن الأمر انتهى، بينما ما زلت تحتاج وقتًا حتى ترتاح.'],
  ['prepare_early','try_new_ideas','قد يراك الناس دقيقًا في الترتيب، ثم يفاجئهم حماسك لفكرة غير مألوفة. ربما يكون وضوح البداية هو ما يمنحك الحرية لتجربة شيء جديد.'],
  ['group_energy','quiet_settings','قد تستمد طاقة من الناس وفي الوقت نفسه ترتاح في الأماكن الهادئة. يبدو أن نوع الجلسة يفسّر ذوقك أفضل من وصفك بكلمة «اجتماعي».'],
  ['follow_through','perspective_taking','قد يظهر اهتمامك بالناس في شيئين صغيرين: أن تفهم سبب طلبهم، وأن تتذكر ما وعدت به حين ينشغل الجميع.'],
  ['try_new_ideas','unfinished_tasks','يبدو أن في البدايات ما يجذب انتباهك بسرعة. وقد يكون آخر جزء من الفكرة أقل متعة من اكتشافها، حتى عندما تكون الفكرة نفسها مهمة لك.'],
  ['harsh_words','make_amends','قد تسبقك الكلمة وقت الزعل، ثم تنتبه إلى أثرها وتبادر إلى إصلاحه. سرعة ردّك وحدها قد تعطي انطباعًا ناقصًا عن طريقتك مع الناس.'],
];
const legacy: Motif[] = [
  ['initiative','depth','قد تبدأ الحديث بسهولة، لكن ما يبقي انتباهك فيه هو أن تجد فكرة تستحق التعمق. كثرة الكلام وحدها قد لا تعطيك إحساسًا بأنك عرفت الشخص.'],
  ['planning','novelty','قد تكون التفاصيل الواضحة عندك بداية الفضول: متى عرفت الإطار، أصبح التفكير في شيء جديد أكثر متعة.'],
  ['quiet_comfort','reassurance','قد يريحك الصمت مع شخص تعرفه جيدًا، وتظل الكلمة الواضحة مهمة لك في بداية المعرفة، حين يصعب تفسير الصمت.'],
  ['directness','openness','قد يسهل عليك أن توضح ما تحتاجه، فيما تأتي مشاركة ما تشعر به على مهل حين يتكوّن الأمان.'],
];

const practicalLens: Record<string,Record<string,string>> = {
  closeness_pace:{
    A:'وفي بداية التعارف، قد يكون الحديث سهلًا قبل أن تصبح التفاصيل الشخصية سهلة المشاركة. لكل منهما توقيته عندك.',
    B:'وفي بداية التعارف، قد تحمل كلمة صريحة عن نية المتابعة معنى أوضح عندك من طول الحديث.',
    C:'وفي بداية التعارف، يبدو أن راحة الحديث عندك تتسع حين تستطيع اختيار ما تشاركه وما تحتفظ به لنفسك.',
  },
  repair_after_conflict:{
    A:'حين تختلف الآراء، قد يعني لك فتح الموضوع في حينه أن هناك فرصة للفهم.',
    B:'عندما تحتدّ الآراء، قد يساعدك أخذ مهلة تعرف بعدها متى يمكن استئناف الحديث.',
    C:'عندما يصعب الحديث، قد تكون اللفتة اللطيفة عندك مدخلًا إلى توضيح ما جرى.',
  },
};

export function personalityPortrait(profile:Inputs, instrument:string, version:string) {
  const questions=personalityQuestionsFor(instrument);
  const evidence:DeepReview['ownEvidence']=[];
  const options=new Map(questions.map(q=>[q.id,q.options.find(o=>o.code===profile.personalityAnswers?.[q.id])]));
  const endorsed=(id:string)=>['D','E'].includes(options.get(id)?.code ?? '');
  const motifs=instrument==='personality-v1'?legacy:current;
  let best=motifs.filter(([a,b])=>endorsed(a)&&endorsed(b)).sort((l,r)=>
    [r[0],r[1]].filter(k=>options.get(k)?.code==='E').length-[l[0],l[1]].filter(k=>options.get(k)?.code==='E').length)[0];
  if (!best && instrument==='personality-v2' && ['group_energy','start_conversation'].every(id=>['A','B'].includes(options.get(id)?.code ?? ''))) {
    best=['group_energy','start_conversation','قد لا يكون الدخول سريعًا في حديث جماعي أسهل طريقة للتعرّف عليك. حديث قصير حول موضوع يهمك قد يكشف عنك أكثر من عدد المرات التي تبادر فيها بالكلام.'];
  }
  const keys=best?best.slice(0,2):[];
  let text=best?.[2] ?? '';
  if (!best) {
    const item=questions.find(q=>endorsed(q.id));
    if (item) {
      keys.push(item.id);
      text=`أبرز خيط في وصفك لنفسك هو «${item.title}». ومعناه يتضح أكثر من موقف تتذكره بنفسك: متى يظهر هذا الجانب منك بوضوح، ومتى يختلف؟`;
    } else if (questions.every(q=>options.get(q.id))) {
      keys.push(...questions.map(q=>q.id));
      text='يصعب اختصار شخصيتك في سمة واحدة من هذا الوصف. قد يكون مثال تعرفه عن نفسك أصدق في تقديمك: ما الموقف الذي تتمنى لو عرفه شخص عنك قبل أن يكوّن انطباعه الأول؟';
    }
  }
  for (const key of keys) {
    const question=questions.find(q=>q.id===key)!;
    evidence.push({key:'personality:'+key,label:question.prompt,value:options.get(key)!.label});
  }
  const practicalOrder=keys.some(key=>['make_amends','lasting_tension','conflict_pace','harsh_words'].includes(key))
    ? ['repair_after_conflict','closeness_pace'] : ['closeness_pace','repair_after_conflict'];
  for (const key of practicalOrder) {
    const code=profile.surveyAnswers?.[key] ?? '';
    const topic=dimensionsForVersion(version).find(t=>t.id===key);
    const value=topic?.options.find(o=>o.code===code)?.self;
    if (!topic || !value || !practicalLens[key][code]) continue;
    text=[text,practicalLens[key][code]].filter(Boolean).join(' ');
    evidence.push({key:'answer:'+key,label:topic.selfPrompt,value});
    break;
  }
  return {text,evidence};
}
