import test from 'node:test';
import assert from 'node:assert/strict';
import { portraitLines } from '../src/interview/personalPortrait.ts';
import current from '../src/compatibility/catalog.json' with { type: 'json' };
import archived from '../src/compatibility/catalog-v3.json' with { type: 'json' };

function childrenFields(catalog) {
  const item = catalog.dimensions.find(dimension => dimension.id === 'children_plan');
  return ['self', 'partner'].map(side => ({
    id: `preference:${item.id}:${side}`, label: item.title, prompt: item[`${side}Prompt`],
    options: item.options.map(option => ({ code: option.code, label: option[side] })),
  }));
}

test('current and archived portraits preserve the exact subject, uncertainty and editable source', () => {
  for (const catalog of [current, archived]) {
    const [self, partner] = childrenFields(catalog);
    const themes = [[self, partner]];
    const implicit = new Set([partner.id]);
    for (const saved of [{}, { [partner.id]: ['A'] }, { [self.id]: ['A', 'B'] }, { [self.id]: ['Z'] }]) {
      assert.deepEqual(portraitLines(themes, saved, implicit), []);
    }
    const [unsure] = portraitLines(themes, { [self.id]: ['C'], [partner.id]: ['A'] }, implicit);
    assert.equal(unsure.phrase, 'لم أحسم قراري بشأن الإنجاب بعد');
    assert.equal(unsure.field.id, self.id);
    assert.equal(unsure.option.code, 'C');
    const [explicitPartner] = portraitLines(themes, { [partner.id]: ['A'] }, new Set());
    assert.match(explicitPartner.context, /في الشريك/);
    assert.equal(explicitPartner.phrase, partner.options[0].label);
    assert.match(explicitPartner.preview, /في الشريك/);
    assert.equal(explicitPartner.field.id, partner.id);
  }
});

test('a personality statement always retains the selected self-rating, including disagreement', () => {
  const trait = { id: 'personality:calm_before_acting:self', label: 'التفكير قبل التصرف',
    prompt: 'إذا صار شيء مزعج، أقدر أهدأ وأفكر قبل ما أتصرف.', options: [{ code: 'A', label: 'لا يشبهني إطلاقًا' }] };
  const [line] = portraitLines([[trait]], { [trait.id]: ['A'] }, new Set());
  assert.equal(line.phrase, `«${trait.prompt}» · لا يشبهني إطلاقًا`);
  assert.equal(line.preview, line.phrase);
  assert.equal(line.field.id, trait.id);
});
