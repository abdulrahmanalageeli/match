import test from 'node:test';
import assert from 'node:assert/strict';
import { ageFromBirthday, latestAdultBirthday } from './birthday.ts';

test('age changes on the birthday, including leap-day birthdays', () => {
 assert.equal(ageFromBirthday('2008-11-09',new Date(2026,10,8)),17);
 assert.equal(ageFromBirthday('2008-11-09',new Date(2026,10,9)),18);
 assert.equal(ageFromBirthday('2004-02-29',new Date(2026,1,28)),21);
 assert.equal(ageFromBirthday('2004-02-29',new Date(2026,2,1)),22);
 assert.equal(latestAdultBirthday(new Date(2024,1,29)),'2006-02-28');
});
test('rejects impossible and ambiguous dates instead of rolling them forward', () => {
 for(const value of ['', '2025-02-29','2000-13-01','2000-04-31','09/11/2000']) assert.equal(ageFromBirthday(value),null);
});
