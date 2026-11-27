/** The input is already ranked and filtered for this member and discovery view. */
export function selectRecommendations<T extends {recommendationKind?: 'close'}>(ranked: readonly T[]): T[] {
  const strict = ranked.filter(person => person.recommendationKind !== 'close').slice(0, 5);
  if (strict.length >= 3) return strict;
  return [...strict, ...ranked.filter(person => person.recommendationKind === 'close').slice(0, 3 - strict.length)];
}
