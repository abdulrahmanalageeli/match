import catalog from './catalog.json' with { type: 'json' };
import type { MatchFit } from './model.ts';
import { readPreferenceEvidence } from './preference-evidence.ts';

export type ConversationPrompt = {
  id: string;
  kind: 'aligned' | 'discussion' | 'explore';
  title: string;
  context: string;
  prompt: string;
};

const alignedPrompts: Record<string, string> = {
  children_plan: 'ما التفاصيل التي تجعل قرارنا بشأن الإنجاب مناسبًا لحياتنا، وكيف نراجعه مع تغيّر الظروف؟',
  residence_plan: 'لو وصفنا يومًا عاديًا في المكان الذي نود العيش فيه، ما التفاصيل التي تجعله مريحًا لنا؟',
  wife_work: 'كيف نساند طموحات بعضنا ونرتّب وقت العمل والبيت بطريقة تناسبنا معًا؟',
  marriage_timeline: 'ما الخطوة العملية الأولى التي تساعدنا نصل إلى موعد مناسب للخطوة الرسمية، دون استعجال؟',
  family_boundaries: 'كيف نحافظ على قربنا من أهلنا، ونبني في الوقت نفسه طريقتنا الخاصة في اتخاذ القرارات؟',
  shared_budget: 'لو خططنا لأول شهر في بيتنا، ما أولويات المصاريف والادخار التي نحب نرتّبها معًا؟',
  household_roles: 'كيف يبدو يوم مريح لنا في البيت، وما المهام التي يستمتع كل واحد منا بالمشاركة فيها؟',
  weekly_planning: 'لو كانت لدينا نهاية أسبوع معًا، كيف نحب أن نقضيها من الصباح إلى المساء؟',
  social_rhythm: 'ما شكل أسبوع يجمع وقتًا جميلًا لنا وزيارات مريحة، ويترك مساحة كافية للراحة؟',
  conversation_initiative_preference: 'ما البداية البسيطة التي تجعل الحديث مريحًا لنا، خصوصًا في الأيام المزدحمة؟',
  match_disagreement_style: 'ما الاتفاق الصغير الذي نقدر نضعه من البداية ليظل الحوار محترمًا، حتى لو اختلفنا؟',
  repair_after_conflict: 'ما الكلمات أو التصرفات البسيطة التي تساعدنا نرجع للحوار بعد الزعل؟',
  conversation_depth: 'ما فكرة أو قصة من حياتنا نحب نعطيها مساحة في حديثنا اليوم؟',
  closeness_pace: 'ما عادة صغيرة تساعدنا نبني القرب بالتدريج، مع احترام مساحة كل واحد منا؟',
  curiosity_style: 'ما شيء نحب أن يعرفه الآخر عنا، ولا يظهر عادةً في الملف الشخصي؟',
  early_openness: 'ما التفاصيل التي نرتاح لمشاركتها الآن، وكيف نعبّر بلطف إذا احتجنا وقتًا قبل الحديث عن شيء؟',
};

function generalPrompts(): ConversationPrompt[] {
  return [
    { id: 'general:daily-life', kind: 'explore', title: 'بداية بسيطة', context: 'سؤال عام للتعارف؛ لا يستنتج اتفاقًا أو اختلافًا من تقييم غير مكتمل.',
      prompt: 'ما الشيء البسيط الذي يجعل يومك أجمل، وكيف تحب تقضي وقتك بعد يوم طويل؟' },
    { id: 'general:feeling-at-home', kind: 'explore', title: 'تصوّر الحياة معًا', context: 'مساحة لفهم ما يهم كل طرف، دون افتراض إجابات مسبقة.',
      prompt: 'ما الأشياء التي تجعل البيت مكانًا مريحًا بالنسبة لك، وما الذي تتمنى أن نبنيه معًا؟' },
  ];
}

/** Only derived, bilateral outcomes personalize prompts; private answers never enter a message. */
export function conversationInsights(fit?: MatchFit): {
  source: 'evidenced' | 'legacy' | 'general'; prompts: ConversationPrompt[];
} {
  if (!fit || typeof fit !== 'object' || Array.isArray(fit)) return { source: 'general', prompts: generalPrompts() };
  const readout = readPreferenceEvidence(fit);
  if (readout.source === 'unavailable') return { source: 'general', prompts: generalPrompts() };
  const aligned: ConversationPrompt[] = [], discussion: ConversationPrompt[] = [], explore: ConversationPrompt[] = [];
  for (const topic of readout.topics) {
    const definition = catalog.dimensions.find(item => item.id === topic.id);
    if (!definition) continue;
    if (topic.status === 'aligned') {
      aligned.push({ id: `aligned:${topic.id}`, kind: 'aligned', title: definition.title,
        context: definition.reason, prompt: alignedPrompts[topic.id] ?? definition.discussion });
    } else if (topic.status === 'missing') {
      explore.push({ id: `explore:${topic.id}`, kind: 'explore', title: definition.title,
        context: 'لم تكتمل الإجابات عن هذا الموضوع؛ هذا سؤال للاستكشاف، وليس نتيجة اتفاق أو اختلاف.', prompt: definition.discussion });
    } else {
      discussion.push({ id: `discussion:${topic.id}`, kind: 'discussion', title: definition.title,
        context: topic.status === 'one_sided' ? 'توجد ملاءمة في اتجاه واحد. سؤال هادئ يساعدكما على فهم احتياجات كل طرف.'
          : topic.status === 'different' ? 'تختلف الاحتياجات التي أظهرتها المقارنة. يمكن بدء الحديث بفضول ومساحة للمرونة.'
          : 'يشير ملخّص التوافق إلى موضوع يستحق الحديث، دون تفاصيل كافية عن اتجاه الاختلاف.',
        prompt: definition.discussion });
    }
  }
  // A shared strength opens the conversation; a useful question follows without framing either person as wrong.
  const prompts: ConversationPrompt[] = [];
  for (let index = 0; index < Math.max(aligned.length, discussion.length); index++) {
    if (aligned[index]) prompts.push(aligned[index]);
    if (discussion[index]) prompts.push(discussion[index]);
  }
  if (!prompts.length) return { source: 'general', prompts: generalPrompts() };
  return { source: readout.source, prompts: [...prompts, ...explore] };
}
