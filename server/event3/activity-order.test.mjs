import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../../app/routes/groups.tsx', import.meta.url), 'utf8');
const catalog = source.slice(source.indexOf('const games: Game[]'), source.indexOf('const hashActivitySeed'));
const ids = [...catalog.matchAll(/\bid: "([^"]+)"/g)].map(match => match[1]);
const algorithm = source.slice(source.indexOf('const hashActivitySeed'), source.indexOf('const gameThemes'));
const context = vm.createContext({ games: ids.map(id => ({ id })) });
vm.runInContext(ts.transpileModule(`${algorithm}\nglobalThis.order = shuffleActivitiesForParticipant;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);

test('every round pins Let’s Agree first and Imposter last while shuffling all middle activities', () => {
  const middleOrders = new Set();
  for (let round = 1; round <= 3; round++) {
    for (let participant = 1; participant <= 100; participant++) {
      const seed = `${round}:${participant}`;
      const actual = Array.from(context.order(seed), game => game.id);
      assert.equal(actual[0], 'lets-agree');
      assert.equal(actual.at(-1), 'imposter');
      assert.deepEqual([...actual].sort(), [...ids].sort());
      assert.deepEqual(actual, Array.from(context.order(seed), game => game.id));
      middleOrders.add(actual.slice(1, -1).join(','));
    }
  }
  assert.ok(middleOrders.size > 100, 'middle activities must retain participant-specific variety');
});
