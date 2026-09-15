import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../../app/components/PromptTopicsModal.tsx', import.meta.url), 'utf8')
const bankAndSelector = source
  .slice(source.indexOf('const promptTopics ='), source.indexOf('/**\n * Focused') === -1
    ? source.indexOf('/**\r\n * Focused') : source.indexOf('/**\n * Focused'))
  .replace(/^\s*icon:.*$/gm, '')
const compiled = ts.transpileModule(bankAndSelector, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText
const { getUnseenQuestion, openingQuestionsByDepth, tableQuestionsByDepth, priorityGroupQuestionsByDepth, readTableModeState, storageKey } = runInNewContext(`${compiled}\n;({ getUnseenQuestion, openingQuestionsByDepth, tableQuestionsByDepth, priorityGroupQuestionsByDepth, readTableModeState, storageKey: TABLE_MODE_STORAGE_KEY })`)

test('all 32 approved questions precede older questions within their depth in every round', () => {
  const allOpenings = Object.values(openingQuestionsByDepth).flat()
  assert.equal(allOpenings.length, 32)
  assert.equal(new Set(allOpenings).size, 32)
  for (const depth of ['shallow', 'medium', 'deep']) {
    const openings = openingQuestionsByDepth[depth]
    const oldBank = [...priorityGroupQuestionsByDepth[depth], ...tableQuestionsByDepth[depth]]
    for (const table of [1, 2, 7, 8]) {
      for (const round of [1, 2, 3]) {
        const history = []
        for (let index = 0; index < openings.length; index++) {
          const next = getUnseenQuestion(depth, history, table, round)
          assert.ok(openings.includes(next), `${depth}, table ${table}, round ${round}: opening ${index + 1}`)
          assert.ok(!history.includes(next), 'openings must not repeat')
          assert.equal(getUnseenQuestion(depth, [...history], table, round), next, 'same table and history must agree')
          history.push(next)
        }
        const older = getUnseenQuestion(depth, history, table, round)
        assert.ok(oldBank.includes(older), 'older questions remain accessible after the openings')
        assert.ok(!openings.includes(older))
      }
    }
  }
})

test('changing round, table, or depth consumes unseen openings before falling back', () => {
  const history = []
  for (const depth of ['shallow', 'medium', 'deep']) {
    for (let index = 0; index < openingQuestionsByDepth[depth].length; index++) {
      const next = getUnseenQuestion(depth, history, index % 3 + 1, index % 3 + 1)
      assert.ok(openingQuestionsByDepth[depth].includes(next))
      assert.ok(!history.includes(next))
      history.push(next)
    }
  }
  assert.equal(new Set(history).size, 32)
})

test('opening rollout starts with a fresh session history', () => {
  assert.equal(storageKey, 'discussion_table_mode_v4')
  const initial = readTableModeState()
  assert.equal(initial.depth, 'shallow')
  assert.equal(initial.history.length, 0)
  assert.equal(initial.index, -1)
})
