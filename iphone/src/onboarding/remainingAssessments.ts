type Choices = ReadonlyArray<{ code: string }>;

/** Coverage is based on valid saved choices, not simply a non-empty answer. */
export function hasPreferenceAnswer(options: Choices, answer: unknown): boolean {
  return typeof answer === 'string' && options.some(option => option.code === answer);
}

export function hasScenarioAnswer(options: Choices, answer: { self?: string; partner?: string[] } | undefined, side: 'self' | 'partner'): boolean {
  if (side === 'self') return hasPreferenceAnswer(options, answer?.self);
  const values = answer?.partner;
  return Array.isArray(values) && values.length > 0 && new Set(values).size === values.length
    && values.every(value => hasPreferenceAnswer(options, value));
}
