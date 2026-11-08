import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCity, canonicalNationality, cityOptions, nationalityChoices, numericOptions } from '../src/profile/profileOptions.ts';

test('known city spellings resolve exactly without confusing similar places', () => {
  assert.equal(canonicalCity('  Riyadh '), 'الرياض');
  assert.equal(canonicalCity('مكة'), 'مكة المكرمة');
  assert.equal(canonicalCity('المدينه المنوره'), 'المدينة المنورة');
  assert.notEqual(canonicalCity('الخبر'), canonicalCity('رياض الخبراء'));
  assert.equal(canonicalCity('قرية محفوظة قديمًا'), 'قرية محفوظة قديمًا');
});

test('nationality aliases share a value while unknown saved answers are preserved', () => {
  for (const value of ['سعودية', 'السعودية', 'Saudi Arabia']) assert.equal(canonicalNationality(value), 'سعودي');
  assert.equal(canonicalNationality('عمانية'), 'عُماني');
  assert.equal(canonicalNationality('إندونيسية'), 'إندونيسي');
  assert.equal(canonicalNationality('إجابة محفوظة'), 'إجابة محفوظة');
});

test('selection catalogs have unambiguous values and zero remains a real numeric choice', () => {
  for (const catalog of [cityOptions, nationalityChoices]) {
    assert.equal(new Set(catalog.map(option => option.value)).size, catalog.length);
    assert.ok(catalog.every(option => option.value.trim() && option.label.trim()));
  }
  const children = numericOptions(0, 20);
  assert.equal(children[0].value, '0');
  assert.equal(children.at(-1).value, '20');
});
