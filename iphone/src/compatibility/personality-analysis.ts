import catalog from './personality-catalog.json' with { type: 'json' };

export const personalityEvidenceMethod = 'answer-distance-v1' as const;
export const personalityDomains = [
  { id: 'communication', title: 'الحوار والتعبير', description: 'المبادرة في الحديث، وعمقه، ووضوح الاحتياج.', questionIds: ['initiative', 'depth', 'directness'] },
  { id: 'closeness', title: 'القرب والطمأنينة', description: 'مشاركة المشاعر، والتواصل اليومي، والتعبير عن الاهتمام.', questionIds: ['openness', 'closeness', 'reassurance'] },
  { id: 'everyday', title: 'إيقاع الحياة', description: 'الطاقة الاجتماعية، والتخطيط، والتجارب الجديدة.', questionIds: ['social_energy', 'planning', 'novelty'] },
  { id: 'pressure', title: 'الضغط ومساحة الهدوء', description: 'طلب الدعم، وتوقيت مناقشة الخلاف، والراحة في الهدوء.', questionIds: ['support', 'conflict_pace', 'quiet_comfort'] },
] as const;

export const distributionSteps = [
  { key: 'same', label: 'الإجابة نفسها', points: 100 },
  { key: 'near', label: 'فرق درجة واحدة', points: 75 },
  { key: 'different', label: 'فرق درجتين', points: 50 },
  { key: 'far', label: 'فرق ثلاث درجات', points: 25 },
  { key: 'opposite', label: 'فرق أربع درجات', points: 0 },
] as const;

export type PersonalityDomainId = typeof personalityDomains[number]['id'];
export type PersonalityDistribution = Record<typeof distributionSteps[number]['key'], number>;
export type PersonalityDomainEvidence = { id: PersonalityDomainId; covered: number; total: number; percentage: number | null };
export type PersonalityEvidencePayload = {
  method: typeof personalityEvidenceMethod;
  domains: PersonalityDomainEvidence[];
  distribution: PersonalityDistribution | null;
};
export type PersonalityEvidence = PersonalityEvidencePayload & { distribution: PersonalityDistribution };
type TopicText = { title: string; similarity: string; discussion: string; prompt: string };

// Interpret only closeness/distance between answers. Neither direction nor a
// psychological diagnosis can be inferred from a pair's similarity score.
export const personalityTopics: Record<string, TopicText> = {
  social_energy: { title: 'الطاقة الاجتماعية', similarity: 'إجاباتكما متقاربة في أثر اللقاءات الاجتماعية على طاقتكما. هذا لا يحدد إن كنتما اجتماعيين أو تفضلان الهدوء.', discussion: 'تختلف إجاباتكما حول الطاقة بعد اللقاءات الاجتماعية. قد تحتاجان إلى توزيع مختلف بين اللقاءات والوقت الهادئ.', prompt: 'كيف نوازن بين لقاءات الأهل والأصدقاء والوقت الهادئ الذي يحتاجه كل منا؟' },
  initiative: { title: 'المبادرة في الحوار', similarity: 'إجاباتكما متقاربة في الميل إلى بدء الحديث عند التعارف. من المفيد توضيح كيف يفضل كل منكما أن يبدأ التواصل.', discussion: 'تختلف درجة ميلكما إلى بدء الحديث. لا يعني قلة المبادرة وحدها قلة الاهتمام؛ اتفقا على إيقاع التواصل.', prompt: 'كيف نُظهر الاهتمام بالمبادرة دون أن يشعر أحدنا أنه يحمل الحوار وحده؟' },
  depth: { title: 'عمق الحوار', similarity: 'إجاباتكما متقاربة بشأن التعمق في موضوع واحد مقارنة بالتنقل بين المواضيع.', discussion: 'تختلف إجاباتكما بشأن التعمق في موضوع واحد. قد يساعد التنويع بين حديث خفيف ووقت لنقاش أطول.', prompt: 'متى تحب الحديث المتعمق، ومتى تفضل حوارًا خفيفًا ومتنوعًا؟' },
  openness: { title: 'مشاركة المشاعر', similarity: 'إجاباتكما متقاربة حول سهولة مشاركة المشاعر عند الشعور بالأمان؛ لكن حدود الخصوصية تبقى موضوعًا للحوار.', discussion: 'تختلف إجاباتكما حول سهولة مشاركة المشاعر. قد يحتاج كل طرف إلى وقت أو أسلوب مختلف حتى يشعر بالراحة.', prompt: 'ما الذي يساعدك على الشعور بالأمان عندما تتحدث عن مشاعرك؟' },
  closeness: { title: 'التواصل اليومي', similarity: 'إجاباتكما متقاربة بشأن مشاركة تفاصيل اليوم وتكرار التواصل.', discussion: 'تختلف درجة رغبتكما في مشاركة تفاصيل اليوم والتواصل المتكرر. توضيح التوقعات قد يمنع تفسير الانشغال أو الهدوء بشكل خاطئ.', prompt: 'ما مقدار التواصل اليومي الذي يريح كلًا منا، وكيف نوضح انشغالنا؟' },
  reassurance: { title: 'الطمأنينة', similarity: 'إجاباتكما متقاربة بشأن أهمية التعبير الواضح والمتكرر عن الاهتمام.', discussion: 'تختلف إجاباتكما بشأن الحاجة إلى التعبير المتكرر عن الاهتمام. قد تختلف طريقة الشعور بالطمأنينة بينكما.', prompt: 'ما الكلمات أو التصرفات التي تشعرك بالاهتمام، وكم تحتاج أن تتكرر؟' },
  support: { title: 'الدعم وقت الضغط', similarity: 'إجاباتكما متقاربة بشأن الحديث مع شخص موثوق وقت الضغط. اسألا أيضًا عن نوع الدعم المريح لكل منكما.', discussion: 'تختلف إجاباتكما بشأن اللجوء إلى الحديث وقت الضغط. من المفيد سؤال الطرف الآخر إن كان يريد الاستماع أو الحلول أو بعض المساحة.', prompt: 'عندما تمر بضغط، هل تريد أن أستمع أم أساعد بحل أم أعطيك وقتًا؟' },
  planning: { title: 'التخطيط', similarity: 'إجاباتكما متقاربة في الميل إلى الاتفاق على التفاصيل مسبقًا.', discussion: 'تختلف درجة تفضيلكما للتخطيط المسبق. الاتفاق على ما يجب تحديده وما يمكن تركه مرنًا قد يقلل الاحتكاك.', prompt: 'ما الخطط التي تحتاج اتفاقًا مسبقًا، وما الذي نرتاح لتركه عفويًا؟' },
  novelty: { title: 'التجارب الجديدة', similarity: 'إجاباتكما متقاربة بشأن الحماس للتجارب الجديدة مقارنة بتكرار المألوف.', discussion: 'تختلف إجاباتكما بشأن تجربة الجديد. يمكن مناقشة مساحة مريحة للتجديد مع الحفاظ على أنشطة مألوفة.', prompt: 'كيف نختار تجارب جديدة يستمتع بها كلانا دون ضغط على أحدنا؟' },
  conflict_pace: { title: 'توقيت مناقشة الخلاف', similarity: 'إجاباتكما متقاربة بشأن توقيت مناقشة الخلاف. من المفيد الاتفاق مسبقًا على طريقة طلب استراحة والعودة للحوار.', discussion: 'تختلف إجاباتكما بشأن مناقشة الخلاف فورًا أو الانتظار. تحديد وقت واضح للعودة إلى الحوار قد يساعدكما على احترام احتياج كل طرف.', prompt: 'إذا احتاج أحدنا وقتًا للهدوء، كيف نطلبه ومتى نعود للحديث؟' },
  directness: { title: 'وضوح الاحتياج', similarity: 'إجاباتكما متقاربة بشأن التصريح بما تحتاجانه وما يزعجكما.', discussion: 'تختلف درجة وصفكما لأنفسكما في التعبير المباشر عن الاحتياج. سؤال واضح ولطيف قد يكون أنفع من توقع أن يفهم الطرف الآخر وحده.', prompt: 'كيف نخبر بعضنا بما نحتاجه أو بما أزعجنا بطريقة واضحة ولطيفة؟' },
  quiet_comfort: { title: 'الراحة في الهدوء', similarity: 'إجاباتكما متقاربة بشأن الراحة في الهدوء مع شخص قريب؛ لا يوضح ذلك وحده مقدار التواصل الذي تحتاجانه.', discussion: 'تختلف إجاباتكما بشأن الراحة في لحظات الصمت. من المفيد توضيح متى يكون الهدوء راحة ومتى يحتاج أحدكما إلى تواصل.', prompt: 'كيف نميّز بين هدوء مريح وحاجة إلى الحديث أو الطمأنينة؟' },
};

export function createPersonalityEvidence(distances: ReadonlyMap<string, number>, complete: boolean): PersonalityEvidencePayload {
  const domains = personalityDomains.map(domain => {
    const known = domain.questionIds.flatMap(id => {
      const distance = distances.get(id);
      return Number.isInteger(distance) && distance! >= 0 && distance! <= 4 ? [distance!] : [];
    });
    return { id: domain.id, covered: known.length, total: domain.questionIds.length,
      percentage: complete && known.length === domain.questionIds.length
        ? Math.round(100 * (1 - known.reduce((sum, value) => sum + value, 0) / (4 * known.length))) : null };
  });
  const distribution: PersonalityDistribution | null = complete
    ? { same: 0, near: 0, different: 0, far: 0, opposite: 0 } : null;
  if (distribution) for (const question of catalog) {
    const distance = distances.get(question.id);
    if (Number.isInteger(distance) && distance! >= 0 && distance! <= 4) distribution[distributionSteps[distance!].key]++;
  }
  return { method: personalityEvidenceMethod, domains, distribution };
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const count = (value: unknown): value is number => Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= catalog.length;

/** Accept only complete evidence whose arithmetic reconciles to the displayed score. */
export function validatedPersonalityEvidence(value: unknown): PersonalityEvidence | null {
  if (!record(value) || value.version !== 'personality-v1' || value.method !== personalityEvidenceMethod
      || value.complete !== true || value.covered !== catalog.length || value.total !== catalog.length
      || !Number.isInteger(value.percentage) || typeof value.percentage !== 'number'
      || !record(value.distribution) || !Array.isArray(value.domains) || value.domains.length !== personalityDomains.length) return null;
  const distribution = value.distribution;
  if (Object.keys(distribution).length !== distributionSteps.length || distributionSteps.some(step => !count(distribution[step.key]))) return null;
  const counts = distribution as PersonalityDistribution;
  if (distributionSteps.reduce((sum, step) => sum + counts[step.key], 0) !== catalog.length
      || Math.round(distributionSteps.reduce((sum, step) => sum + counts[step.key] * step.points, 0) / catalog.length) !== value.percentage) return null;
  const ids = new Set(catalog.map(question => question.id));
  const isIds = (items: unknown): items is string[] => Array.isArray(items) && items.every(id => typeof id === 'string' && ids.has(id)) && new Set(items).size === items.length;
  if (!isIds(value.similarities) || !isIds(value.differences)
      || value.similarities.length !== counts.same + counts.near
      || value.differences.length !== counts.different + counts.far + counts.opposite
      || new Set([...value.similarities, ...value.differences]).size !== catalog.length) return null;
  const similarities = new Set(value.similarities);
  let domainDistance = 0;
  const domains: PersonalityDomainEvidence[] = [];
  for (const [index, definition] of personalityDomains.entries()) {
    const domain = value.domains[index];
    if (!record(domain) || domain.id !== definition.id || domain.covered !== definition.questionIds.length
        || domain.total !== definition.questionIds.length || !Number.isInteger(domain.percentage)) return null;
    // Each 3-item domain has 12 possible distance points. Its rounded score
    // identifies that integer exactly; do not average already-rounded bars.
    const gap = Array.from({ length: 13 }, (_, index) => index).find(distance => Math.round(100 * (1 - distance / 12)) === domain.percentage);
    if (gap === undefined) return null;
    const near = definition.questionIds.filter(id => similarities.has(id)).length;
    if (gap < (3 - near) * 2 || gap > near + (3 - near) * 4) return null;
    domainDistance += gap;
    domains.push({ id: definition.id, covered: domain.covered as number, total: domain.total as number, percentage: domain.percentage as number });
  }
  if (domainDistance !== counts.near + 2 * counts.different + 3 * counts.far + 4 * counts.opposite) return null;
  return { method: personalityEvidenceMethod, domains, distribution: counts };
}

export type PersonalityInsight = { id: string; title: string; interpretation: string; prompt: string };
export type PersonalityAnalysis = PersonalityEvidence & { strengths: PersonalityInsight[]; discussion: PersonalityInsight[] };
export function analyzePersonality(value: unknown): PersonalityAnalysis | null {
  const evidence = validatedPersonalityEvidence(value);
  if (!evidence || !record(value)) return null;
  const candidates = (ids: string[], difference: boolean) => {
    const rank = (id: string) => evidence.domains.find(domain => personalityDomains.find(item => item.id === domain.id)!.questionIds.some(question => question === id))?.percentage ?? 0;
    return ids.slice().sort((a, b) => (difference ? rank(a) - rank(b) : rank(b) - rank(a)) || catalog.findIndex(item => item.id === a) - catalog.findIndex(item => item.id === b)).slice(0, 2)
      .map(id => ({ id, title: personalityTopics[id].title, interpretation: difference ? personalityTopics[id].discussion : personalityTopics[id].similarity, prompt: personalityTopics[id].prompt }));
  };
  return { ...evidence, strengths: candidates(value.similarities as string[], false), discussion: candidates(value.differences as string[], true) };
}
