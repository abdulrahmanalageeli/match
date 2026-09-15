import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const [groups, agree, discussion, document] = await Promise.all([
  '../../app/routes/groups.tsx',
  '../../app/components/groups/LetsAgreeActivity.tsx',
  '../../app/components/PromptTopicsModal.tsx',
  '../../docs/activity-question-proposals-2026-09-16.md',
].map(path => readFile(new URL(path, import.meta.url), 'utf8')))
const approved = [...document.matchAll(/^\d+\. \*\*([^*]+)\*\*\s*(.+)$/gm)]
const proposals = letter => approved.filter(([, label]) => label.startsWith(letter)).map(([, , text]) => text)
const evaluate = (source, result) => runInNewContext(`${ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText}\n;(${result})`)
const banks = evaluate([
  groups.slice(groups.indexOf('const PRIORITY_QUESTION_COUNT'), groups.indexOf('const charadesTopics')),
  groups.slice(groups.indexOf('const fiveSecondRuleCategories'), groups.indexOf('export function GroupsPage')),
  groups.slice(groups.indexOf('const shuffleArray ='), groups.indexOf('// Imposter helpers')),
].join('\n'), '{ neverHaveIEverQuestions, wouldYouRatherQuestions, whatWouldYouDoScenarios, hotSeatQuestions, fiveSecondRuleCategories, shuffleArray, PRIORITY_QUESTION_COUNT }')
const scenarios = evaluate(agree.slice(agree.indexOf('const PRIORITY_SCENARIO_COUNT'), agree.indexOf('const STEPS')), '{ SCENARIOS, getScenariosForRound }')
const openingStart = discussion.indexOf('const openingQuestionsByDepth:')
const openings = evaluate(discussion.slice(openingStart, discussion.indexOf('// Curated specifically', openingStart)), 'openingQuestionsByDepth')

test('approved question banks are integrated, with choices and categories formatted for their UI', () => {
  assert.equal(approved.length, 112)
  const expected = {
    neverHaveIEverQuestions: proposals('ق'),
    whatWouldYouDoScenarios: proposals('م'),
    hotSeatQuestions: proposals('ك'),
    fiveSecondRuleCategories: proposals('ث').map(text => text.replace(/^سمّ ثلاثة /, '').replace(/\.$/, '')),
    wouldYouRatherQuestions: proposals('خ').map(text => {
      const [optionA, optionB] = text.replace(/؟$/, '').split('، أو ')
      return { optionA, optionB }
    }),
  }
  for (const [name, entries] of Object.entries(expected)) {
    assert.equal(entries.length, 16)
    assert.deepEqual(JSON.parse(JSON.stringify(banks[name].slice(0, 16))), entries, name)
    assert.ok(banks[name].length > 16, 'older bank remains available')
  }
  for (const question of proposals('ن')) assert.ok(Object.values(openings).flat().includes(question))
  assert.equal(Object.values(openings).flat().length, 32)
})

test('question shuffling exhausts the approved prefix before older content without losing or repeating entries', () => {
  const names = ['neverHaveIEverQuestions', 'wouldYouRatherQuestions', 'whatWouldYouDoScenarios', 'hotSeatQuestions', 'fiveSecondRuleCategories']
  for (const name of names) {
    const bank = banks[name]
    const before = JSON.stringify(bank)
    for (let run = 0; run < 8; run++) {
      const shuffled = banks.shuffleArray(bank, banks.PRIORITY_QUESTION_COUNT)
      assert.equal(shuffled.length, bank.length)
      assert.deepEqual(new Set(shuffled.slice(0, 16)), new Set(bank.slice(0, 16)))
      assert.deepEqual(new Set(shuffled.slice(16)), new Set(bank.slice(16)))
      assert.equal(new Set(shuffled.slice(0, 16)).size, 16)
      assert.equal(JSON.stringify(bank), before, 'shuffle must not mutate the source bank')
    }
    assert.ok(groups.includes(`shuffleArray(${name}, PRIORITY_QUESTION_COUNT)`))
    assert.ok(!groups.includes(`shuffleArray(${name})`), 'all starts and restarts must preserve priority')
  }
})

test('each group round keeps the six retained scenarios, with the original first scenario pinned first', () => {
  const bank = scenarios.SCENARIOS
  assert.deepEqual(Array.from(bank, scenario => scenario.title), [
    'صندوق للمستقبل', 'هدية من المجموعة', 'فيلمنا القصير',
    'أمسية على ذوقنا', 'ضيف في مدينتنا', 'جمعتنا الأولى',
  ])
  for (const [index, proposalIndex] of [0, 1, 7].entries()) {
    const [goal, twist] = proposals('ت')[proposalIndex].split(' **المفاجأة:** ')
    assert.equal(bank[index].goal, goal)
    assert.equal(bank[index].twist, twist)
    assert.equal(bank[index].choices.length, 3)
    for (const field of ['title', 'setting', 'question', 'reflection']) assert.ok(bank[index][field])
  }
  for (const round of [1, 2, 3]) {
    const order = scenarios.getScenariosForRound(round)
    assert.equal(order[0], bank[0], 'the original first scenario must remain first in every round')
    assert.deepEqual(new Set(order.slice(0, 3)), new Set(bank.slice(0, 3)))
    assert.deepEqual(Array.from(order.slice(3)), Array.from(bank.slice(3)))
    assert.equal(new Set(order).size, 6)
  }
})
