import { AsyncLocalStorage } from 'node:async_hooks';
import currentCatalog from '../../src/compatibility/catalog.json' with {type:'json'};
import legacyCatalog from '../../src/compatibility/catalog-v3.json' with {type:'json'};
import traits from '../../src/compatibility/personality-catalog.json' with {type:'json'};
import legacyTraits from '../../src/compatibility/personality-catalog-v1.json' with {type:'json'};
import topics from '../../src/interview/catalog.json' with {type:'json'};
const priorThemes = {
  intent: { ids: ['initiative', 'depth'], question: 'في بداية التعارف، من يبدأ المواضيع عادة؟ وبالنسبة لك، الحوار الأقرب لك يتعمّق في موضوع واحد أو يتنقّل بين مواضيع؟' },
  communication: { ids: ['conflict_pace', 'directness'], question: 'وقت الاختلاف، عادةً تحب تتكلم فورًا أو بعد ما تهدأ؟ وكيف توضّح ما تحتاجه وما يزعجك؟' },
  closeness: { ids: ['closeness', 'reassurance'], question: 'في أغلب أيامك، كم تحب مشاركة التفاصيل والتواصل مع شريكك؟ وهل يطمئنك التعبير الواضح والمتكرر عن الاهتمام؟' },
  family: { ids: ['openness', 'support'], question: 'وقت الضغط، هل ترتاح عادةً للحديث مع شخص تثق به؟ وكيف تكون مشاركة مشاعرك وتجربتك إذا شعرت بالأمان معه؟' },
  practical: { ids: ['planning', 'novelty'], question: 'لو تخططون لإجازة قصيرة، تحب غالبًا ترتيب التفاصيل مبكرًا؟ وتميل لتجربة مكان جديد أو العودة للمألوف؟' },
  everyday: { ids: ['social_energy', 'quiet_comfort'], question: 'بعد جمعة مع الناس، عادةً طاقتك تزيد أو تحتاج هدوء؟ وكيف تشعر بلحظات الصمت مع شخص قريب؟' },
};
const priorFollowUps = {
  initiative: 'مع شخص جديد، عادةً تبادر بفتح المواضيع أو تنتظر الطرف الآخر يبدأ؟',
  depth: 'في الحوار، عادةً تستمتع بالتعمّق في موضوع واحد أو التنقّل بين مواضيع مختلفة؟',
  conflict_pace: 'وقت الاختلاف، عادةً تفضّل تناقشه فورًا أو تنتظر إلى وقت أهدأ؟',
  directness: 'إذا احتجت شيء أو تضايقت، كيف تعبّر عنه عادةً للشخص القريب منك؟',
  closeness: 'في أغلب أيامك، كم تحب مشاركة تفاصيل يومك والتواصل مع شريكك؟',
  reassurance: 'قد إيش يطمئنك التعبير الواضح والمتكرر عن الاهتمام؟',
  openness: 'إذا حسّيت بالأمان مع شخص، هل يسهل عليك عادةً مشاركة مشاعرك وتجربتك؟',
  support: 'وقت الضغط، عادةً ترتاح للحديث مع شخص تثق به أو تفضّل تتعامل معه بنفسك؟',
  planning: 'لو تخططون لإجازة قصيرة، عادةً تحب ترتيب تفاصيلها مبكرًا أو تتركها لوقتها؟',
  novelty: 'في وقت فراغك، عادةً تتحمّس لتجربة أماكن وأنشطة جديدة أو تفضّل المألوف؟',
  social_energy: 'بعد جمعة مع الناس، عادةً تحس بنشاط أكبر أو تحتاج وقتًا تستعيد فيه طاقتك؟',
  quiet_comfort: 'كيف تحس بلحظات الصمت مع شخص قريب: مريحة أو تفضّل تفتحون موضوعًا؟',
};

const newGroups = {
  intent:['prepare_early','follow_through'],
  communication:['perspective_taking','make_amends','harsh_words'],
  closeness:['explore_views','try_new_ideas'],
  family:['calm_before_acting','lasting_tension','stress_recovery'],
  practical:['unfinished_tasks','prefer_familiar'],
  everyday:['group_energy','start_conversation','quiet_settings'],
};
const currentFollowUps = Object.fromEntries(traits.map(trait => [trait.id, 'كم تشبهك هذه العبارة؟ ' + trait.prompt]));
const currentThemes = Object.fromEntries(Object.entries(newGroups).map(([topic, ids]) =>
  [topic, { ids, question: currentFollowUps[ids[0]] }]));
const previousTopic = {
  mixed_gatherings: 'everyday',
  public_event_attendance: 'everyday',
  match_disagreement_style: 'communication',
};

function buildAssessment(catalog, traits, personalityThemes, personalityFollowUps, labels) {
  const { dimensions } = catalog;
  const preferenceFields = dimensions.flatMap(dimension => ['self', 'partner'].map(side => ({
    id: `preference:${dimension.id}:${side}`,
    kind: 'preference',
    fieldId: dimension.id,
    side,
    topic: topics.find(topic => topic.dimensionIds.includes(dimension.id) || topic.id === previousTopic[dimension.id]),
  })));
  const personalityFields = traits.map(trait => ({
    id: `personality:${trait.id}:self`,
    kind: 'personality',
    fieldId: trait.id,
    side: 'self',
    topic: topics.find(topic => personalityThemes[topic.id].ids.includes(trait.id)),
  }));
  return {
    dimensions, traits, personalityThemes, personalityFollowUps,
    acceptedFields: [...preferenceFields, ...personalityFields],
    requiredFields: [...preferenceFields.filter(field => catalog !== currentCatalog || field.id !== 'preference:residence_plan:partner'), ...personalityFields],
    preferenceById: new Map(dimensions.map(dimension => [dimension.id, dimension])),
    personalityById: new Map(traits.map(trait => [trait.id, trait])),
    options: labels.map((label, index) => ({ code: 'ABCDE'[index], label })),
  };
}

export const historicalAssessment = buildAssessment(legacyCatalog, legacyTraits, priorThemes, priorFollowUps,
  ['لا يشبهني إطلاقًا','يشبهني قليلًا','يشبهني أحيانًا','يشبهني غالبًا','يشبهني كثيرًا']);
export const currentAssessment = buildAssessment(currentCatalog, traits, currentThemes, currentFollowUps,
  ['لا يشبهني إطلاقًا','لا يشبهني كثيرًا','يشبهني إلى حد ما','يشبهني','يشبهني كثيرًا']);

// The authenticated member RPC resolves the persisted questionnaire for this request.
export const assessmentScope = new AsyncLocalStorage();
export const assessment = () => assessmentScope.getStore()?.catalog ?? currentAssessment;
