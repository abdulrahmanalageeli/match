type Choices = Record<string, string[]>;

// Partner preferences must be chosen independently of the member's own answers.
export function resolvePartnerDefaults(explicit: Choices, _saved: Choices, _blocked: ReadonlySet<string>) {
  return { choices: { ...explicit }, inferred: new Set<string>() };
}
