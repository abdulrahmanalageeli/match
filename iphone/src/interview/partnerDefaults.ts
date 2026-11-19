import catalog from './partner-defaults.json' with { type: 'json' };
type Choices = Record<string, string[]>;
const rules: Record<string, Record<string, string | null>> = catalog;

// Drafts keep explicit choices. Derive suggestions until final confirmation.
export function resolvePartnerDefaults(explicit: Choices, saved: Choices, blocked: ReadonlySet<string>) {
  const choices = { ...explicit };
  const inferred = new Set<string>();
  for (const [dimension, codes] of Object.entries(rules)) {
    const self = `preference:${dimension}:self`;
    const partner = `preference:${dimension}:partner`;
    if (explicit[partner] || blocked.has(partner) || saved[self]?.length !== 1) continue;
    const answer = saved[self][0];
    if (explicit[self]?.length !== 1 || explicit[self][0] !== answer || !Object.hasOwn(codes, answer)) continue;
    const code = codes[answer];
    if (code) {
      choices[partner] = [code];
      inferred.add(partner);
    }
  }
  return { choices, inferred };
}
