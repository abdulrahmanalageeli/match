/** From the current question, continue through the same list and wrap to any earlier gaps. */
export function nextQuestion<T extends { id: string }>(
  fields: readonly T[], from: string | undefined, unanswered: (field: T) => boolean,
) {
  const start = Math.max(0, fields.findIndex(field => field.id === from));
  for (let offset = 0; offset < fields.length; offset++) {
    const field = fields[(start + offset) % fields.length];
    if (unanswered(field)) return field;
  }
}

export function questionResumeKey(memberId: string | undefined, historical: boolean, manualCatalog?: {practical?: string; personality?: string}) {
  if (!memberId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(memberId)) return undefined;
  const practical = manualCatalog?.practical ?? (historical ? 'marriage-v3' : 'marriage-v4');
  const personality = manualCatalog?.personality ?? (historical ? 'personality-v1' : 'personality-v2');
  const version = practical === 'marriage-v4' && personality === 'personality-v2' ? 'v5'
    : practical === 'marriage-v3' && personality === 'personality-v1' ? 'v4' : practical + ':' + personality;
  return `wudayn:assessment-topic:${memberId}:${version}`;
}

export function readQuestion(key: string | undefined, firstInOldTopic: (index: number) => string | undefined) {
  if (key) try {
    const value = sessionStorage.getItem(key);
    // Earlier builds bookmarked the group, so continue at its first outstanding question.
    if (value && /^[0-3]$/.test(value)) return firstInOldTopic(Number(value));
    return value ?? undefined;
  } catch { /* Answers remain available without a local bookmark. */ }
}

export function rememberQuestion(key: string | undefined, fieldId: string | undefined) {
  if (key) try {
    if (fieldId) sessionStorage.setItem(key, fieldId);
    else sessionStorage.removeItem(key);
  } catch { /* Browser storage is optional. */ }
}
