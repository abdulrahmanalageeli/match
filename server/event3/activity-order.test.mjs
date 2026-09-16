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

test('round-specific openings keep all activities, stable random choices, and Imposter last', () => {
  const middleOrders = new Set();
  for (let round = 1; round <= 3; round++) {
    for (let participant = 1; participant <= 100; participant++) {
      const seed = `participant:${participant}`;
      const actual = Array.from(context.order(seed, round), game => game.id);
      if (round === 1) {
        assert.deepEqual(actual.slice(0, 4), ['lets-agree', 'conspiracy-theories', 'green-red-depends', 'unwritten-rules']);
      } else if (round === 2) {
        assert.deepEqual(actual.slice(0, 4), ['conspiracy-theories', 'lets-agree', 'green-red-depends', 'unwritten-rules']);
      } else {
        assert.deepEqual(actual.slice(0, 4), ['green-red-depends', 'unwritten-rules', 'lets-agree', 'conspiracy-theories']);
      }
      assert.equal(actual.at(-1), 'imposter');
      assert.deepEqual([...actual].sort(), [...ids].sort());
      assert.deepEqual(actual, Array.from(context.order(seed, round), game => game.id));
      middleOrders.add(actual.slice(4, -1).join(','));
    }
  }
  assert.ok(middleOrders.size > 100, 'middle activities must retain participant-specific variety');
});

test('all four featured activities carry the new badge', () => {
  const featuredIds = [...catalog.matchAll(/id: "([^"]+)",\s+isNew: true/g)].map(match => match[1]);
  assert.deepEqual(featuredIds, ['lets-agree', 'conspiracy-theories', 'green-red-depends', 'unwritten-rules']);
});
