import { dimensionsForVersion } from './practical-catalog.ts';
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
  family_authority: 'لو اختلفتم مع الأهل في قرار السكن، كيف تشرحون قراركم لهم؟',
  financial_provision: 'لو تغيّر دخل أحدكما فترة، كيف تراجعون اتفاق المصاريف؟',
  domestic_labor: 'إذا انشغل أحدكما هذا الأسبوع، ما أول مهمة ممكن يتولاها الآخر؟',
  housing_arrangement: 'وش تفاصيل الخصوصية اللي تهمكم في البيت من أول يوم؟',
  social_rhythm: 'ما شكل أسبوع يجمع وقتًا جميلًا لنا وزيارات مريحة، ويترك مساحة كافية للراحة؟',
  mixed_gatherings: 'لو وصلت دعوة تناسب واحدًا منكما، كيف تتفقون على الرد؟',
  match_disagreement_style: 'ما الاتفاق الصغير الذي نقدر نضعه من البداية ليظل الحوار محترمًا، حتى لو اختلفنا؟',
  repair_after_conflict: 'ما الكلمات أو التصرفات البسيطة التي تساعدنا نرجع للحوار بعد الزعل؟',
  faith_routine: 'كيف تعرف أن الطرف الآخر يرحّب بالتذكير أو المشاركة؟',
  closeness_pace: 'ما عادة صغيرة تساعدنا نبني القرب بالتدريج، مع احترام مساحة كل واحد منا؟',
  public_event_attendance: 'أي نوع من الفعاليات تستمتعون فيه سوا، ومتى يفضّل أحدكم يطلع لحاله؟',
  parenting_approach: 'إذا اختلفتما أمام طفل على تصرّف، كيف تكملون الحديث بينكم؟',
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
    const definition = dimensionsForVersion(fit.version).find(item => item.id === topic.id);
    if (!definition) continue;
    if (topic.status === 'aligned') {
      aligned.push({ id: `aligned:${topic.id}`, kind: 'aligned', title: definition.title,
        context: definition.reason, prompt: alignedPrompts[topic.id] ?? definition.discussion });
    } else if (topic.status === 'missing') {
      explore.push({ id: `explore:${topic.id}`, kind: 'explore', title: definition.title,
        context: 'لم تكتمل الإجابات عن هذا الموضوع؛ هذا سؤال للاستكشاف، وليس نتيجة اتفاق أو اختلاف.', prompt: definition.discussion });
    } else {
      discussion.push({ id: `discussion:${topic.id}`, kind: 'discussion', title: definition.title,
        context: topic.status === 'conditional' ? 'الاتفاق هنا يعتمد على الظروف أو على قرار لم يُحسم بعد.' : topic.status === 'one_sided' ? 'توجد ملاءمة في اتجاه واحد. سؤال هادئ يساعدكما على فهم احتياجات كل طرف.'
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
