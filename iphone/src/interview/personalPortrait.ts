type Option = { code: string; label: string };
type Field = { id: string; label: string; prompt: string; options: Option[] };

// A line always carries the catalog field and option that the member can edit.
// Derive it from saved selections only; an inferred partner answer is never a personal statement.
export function portraitLines<T extends Field>(
  themes: readonly (readonly T[])[],
  saved: Readonly<Record<string, string[]>>,
  inferredPartnerIds: ReadonlySet<string>,
) {
  return themes.flatMap(fields => {
    const answers = fields.flatMap(field => {
      const values = saved[field.id];
      const option = values?.length === 1 && !inferredPartnerIds.has(field.id)
        ? field.options.find(item => item.code === values[0])
        : undefined;
      return option ? [{ field, option }] : [];
    });
    // Prefer a concrete statement about the member's own life in each topic.
    const answer = answers.find(({ field }) => field.id.startsWith('preference:') && field.id.endsWith(':self'))
      ?? answers[0];
    if (!answer) return [];
    const { field, option } = answer;
    const partner = field.id.endsWith(':partner');
    const trait = field.id.startsWith('personality:');
    let context = partner ? `ما أتمناه في الشريك · ${field.label}` : `عنّي · ${field.label}`;
    let phrase = option.label;
    if (trait) {
      context = `تقييمي لنفسي · ${field.label}`;
      phrase = `«${field.prompt}» · ${option.label}`;
    } else if (field.id === 'preference:children_plan:self' && option.code === 'C') {
      phrase = 'لم أحسم قراري بشأن الإنجاب بعد';
    } else if (field.id === 'preference:marriage_timeline:self' && ['A','B','C'].includes(option.code)) {
      phrase = `يناسبني أن نخطو الخطوة الرسمية ${option.label}`;
    } else if (field.id === 'preference:match_disagreement_style:self') {
      phrase = `عند الاختلاف، أفضّل ${option.label}`;
    } else if (field.id === 'preference:faith_routine:self' && option.label === 'كل واحد يرتب عبادته بنفسه') {
      phrase = 'يناسبني أن يرتّب كل واحد منّا عبادته بنفسه';
    }
    const preview = partner ? `ما أتمناه في الشريك · ${field.label} · ${phrase}` : phrase;
    return [{ ...answer, context, phrase, preview }];
  });
}
