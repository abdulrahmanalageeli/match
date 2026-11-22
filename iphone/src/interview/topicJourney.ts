type Question = { id: string; label: string };
type TopicCard<Field extends Question> = {
  themeIndex: number;
  selfOnly: boolean;
  self: Field;
  partner: Field;
  personality: Field[];
};

export type TopicRoute = {
  label: string;
  remaining: number;
  nextIndex: number;
  nextLabel: string;
};

/** Finish the practical choices in a topic before its related personality questions. */
export function topicRoutes<Field extends Question, Card extends TopicCard<Field>>(
  labels: readonly string[], cards: readonly Card[], relevant: (card: Card) => boolean,
  unanswered: (field: Field) => boolean,
): TopicRoute[] {
  return labels.map((label, themeIndex) => {
    let remaining = 0;
    let next: { index: number; field: Field; practical: boolean } | undefined;
    cards.forEach((card, index) => {
      if (card.themeIndex !== themeIndex || !relevant(card)) return;
      const practicalFields = card.selfOnly ? [card.self] : [card.self, card.partner];
      for (const field of [...practicalFields, ...card.personality]) {
        if (!unanswered(field)) continue;
        remaining++;
        const practical = practicalFields.includes(field);
        if (!next || (!next.practical && practical)) next = {index, field, practical};
      }
    });
    return { label, remaining, nextIndex: next?.index ?? -1, nextLabel: next?.field.label ?? '' };
  });
}

export function nextTopicCard(routes: readonly TopicRoute[], start = 0) {
  for (let offset = 0; offset < routes.length; offset++) {
    const topic = routes[(start + offset) % routes.length];
    if (topic.nextIndex >= 0) return topic.nextIndex;
  }
  return -1;
}

export function topicResumeKey(memberId: string | undefined, historical: boolean) {
  if (!memberId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(memberId)) return undefined;
  return `wudayn:assessment-topic:${memberId}:${historical ? 'v4' : 'v5'}`;
}

export function readTopic(key: string | undefined, count: number) {
  if (key) try {
    const value = Number(sessionStorage.getItem(key));
    if (Number.isInteger(value) && value >= 0 && value < count) return value;
  } catch { /* The assessment also works without browser storage. */ }
  return 0;
}

export function rememberTopic(key: string | undefined, index: number | null) {
  if (key) try {
    if (index === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(index));
  } catch { /* An unavailable bookmark never interrupts an answer. */ }
}
