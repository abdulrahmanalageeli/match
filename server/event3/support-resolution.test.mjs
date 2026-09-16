import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../../app/routes/event3.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  useEffect(() => {\n    if (!sosRequests) return', source.indexOf('function SOSButton'))
const end = source.indexOf('  }, [sosRequests])', start) + '  }, [sosRequests])'.length
assert.ok(start >= 0 && end > start)
const effect = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 })
const request = (id, status) => ({ id, status, created_at: '2026-09-16T10:00:00Z', chat_history: [
  { from: 'user', text: `issue-${id}`, timestamp: '2026-09-16T10:00:00Z' },
  { from: 'organizer', text: `reply-${id}`, timestamp: '2026-09-16T10:01:00Z' },
] })
function screen() {
  const state = { messages: [], unread: false, options: true }
  const context = { sosRequests: [], useEffect: fn => fn(),
    setMessages: update => { state.messages = update(state.messages) },
    setHasUnread: value => { state.unread = value }, setShowOptions: value => { state.options = value },
    lastReplyCountRef: { current: 0 }, openRef: { current: false },
    playSOSMessageSound() {}, vibrate() {}, toast() {}, window: { sessionStorage: { setItem() {} } },
  }
  return { state, poll(requests) { context.sosRequests = requests; runInNewContext(effect, context) } }
}
test('host or cohost resolution removes the conversation on the next poll', () => {
  const { state, poll } = screen()
  poll([request('one', 'replied')])
  assert.equal(state.messages.length, 2)
  assert.equal(state.unread, true)
  poll([request('one', 'resolved')])
  assert.equal(state.messages.length, 0)
  assert.equal(state.unread, false)
  assert.equal(state.options, true)
})
test('opening support after resolution does not restore the old issue', () => {
  const { state, poll } = screen()
  poll([request('closed', 'resolved')])
  assert.equal(state.messages.length, 0)
  assert.equal(state.unread, false)
})
test('resolving one request preserves other active conversations and failed sends', () => {
  const { state, poll } = screen()
  state.messages.push({ id: 'failed', text: 'retry me', status: 'failed', from: 'user' })
  poll([request('closed', 'resolved'), request('active', 'pending')])
  assert.equal(state.messages.length, 3)
  assert.ok(state.messages.every(message => !message.text.includes('closed')))
  assert.ok(state.messages.some(message => message.status === 'failed'))
  assert.equal(state.options, false)
})
