import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTopicCard, readTopic, rememberTopic, topicResumeKey, topicRoutes } from '../src/interview/topicJourney.ts';

const question = id => ({ id, label: id });
const card = (themeIndex, id, traits = []) => ({
  themeIndex, self: question(id), partner: question(id + '-partner'), selfOnly: false, personality: traits.map(question),
});
const labels = ['A', 'B', 'C'];
const cards = [card(0, 'home'), card(1, 'time', ['planning']), card(1, 'care'), card(2, 'talk')];

test('a chosen topic stays active, asks both practical perspectives before personality, then wraps to outstanding topics', () => {
  const completed = new Set(['time', 'time-partner']);
  const routes = () => topicRoutes(labels, cards, () => true, field => !completed.has(field.id));
  assert.deepEqual(routes()[1], {label:'B', remaining:3, nextIndex:2, nextLabel:'care'});
  assert.equal(nextTopicCard(routes(), 1), 2);
  completed.add('care');
  assert.equal(routes()[1].nextLabel, 'care-partner');
  completed.add('care-partner');
  assert.equal(routes()[1].nextLabel, 'planning');
  completed.add('planning');
  assert.equal(nextTopicCard(routes(), 1), 3);
  completed.add('talk');
  completed.add('talk-partner');
  assert.equal(nextTopicCard(routes(), 2), 0);
  completed.add('home');
  completed.add('home-partner');
  assert.equal(nextTopicCard(routes()), -1);
});

test('only applicable receipt fields count toward the next question and topic total', () => {
  const setup = [{ ...card(0, 'residence'), selfOnly: true }, card(0, 'parenting')];
  const routes = parenting => topicRoutes(['A'], setup, field => parenting || field.self.id !== 'parenting', field => field.id !== 'residence');
  assert.deepEqual(routes(false)[0], {label:'A', remaining:0, nextIndex:-1, nextLabel:''});
  assert.deepEqual(routes(true)[0], {label:'A', remaining:2, nextIndex:1, nextLabel:'parenting'});
});

test('a tab bookmark stores only a topic index for a specific member UUID and catalog', () => {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {configurable:true, value:{
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }});
  try {
    assert.equal(topicResumeKey('not-a-member-uuid', false), undefined);
    const uuid = '11111111-1234-1234-1234-000000000001';
    const key = topicResumeKey(uuid, false);
    rememberTopic(key, 2);
    assert.equal(readTopic(key, 4), 2);
    assert.equal(readTopic(topicResumeKey(uuid, true), 4), 0);
    assert.equal(readTopic(topicResumeKey(uuid.replace(/1$/, '2'), false), 4), 0);
    assert.equal(readTopic(key, 2), 0);
    rememberTopic(key, null);
    assert.equal(values.size, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else delete globalThis.sessionStorage;
  }
});
