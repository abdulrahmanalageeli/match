import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const admin = await readFile(new URL('../../app/routes/admin3.tsx', import.meta.url), 'utf8')
const cohost = await readFile(new URL('../../app/routes/admin-cohost.tsx', import.meta.url), 'utf8')

test('new admin help requests announce without opening a dialog', () => {
  const polling = admin.slice(admin.indexOf('const fetchSOS ='), admin.indexOf('const handleSOSAction ='))
  assert.doesNotMatch(polling, /setSosModalOpen/)
  assert.match(polling, /setSosRequests\(newRequests\)/)
  const modal = admin.slice(admin.indexOf('{/* ─── SOS Modal'), admin.indexOf('{/* ─── Initiate Chat Modal'))
  assert.doesNotMatch(modal, /height: '100vh'|(?:visibleRequests|sorted)\[0\]/)
  assert.match(modal, /h-\[min\(38rem,75dvh\)\]/)
  assert.match(modal, /aria-label="العودة إلى طلبات المساعدة"/)
})

test('cohost support polls on every tab and refreshes on focus or reconnect', () => {
  const start = cohost.indexOf('  useEffect(() => {\n    if (!agreementAccepted || panelLocked) return\n    fetchSupportRequests()')
  const effect = cohost.slice(start, cohost.indexOf('\n  useEffect(', start + 10))
  let calls = 0, interval, cleanup
  const listeners = new Map()
  const document = { visibilityState: 'visible', addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const window = { setInterval: (fn, delay) => { interval = fn; assert.equal(delay, 3000); return 1 }, clearInterval: () => { interval = null }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const context = { agreementAccepted: true, panelLocked: false, tab: 'rankings', fetchSupportRequests: () => calls++, document, window, useEffect: fn => { cleanup = fn() } }
  runInNewContext(effect, context)
  assert.equal(calls, 1)
  interval()
  assert.equal(calls, 2)
  document.visibilityState = 'hidden'
  interval()
  assert.equal(calls, 2)
  document.visibilityState = 'visible'
  for (const name of ['visibilitychange', 'focus', 'online']) listeners.get(name)()
  assert.equal(calls, 5)
  cleanup()
  assert.equal(listeners.size, 0)
  assert.equal(interval, null)
  runInNewContext(effect, { ...context, panelLocked: true })
  assert.equal(calls, 5)
})
