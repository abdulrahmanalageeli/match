import assert from 'node:assert/strict'
import test from 'node:test'
import { redactAnalyticsUrl } from './analytics.ts'

test('page views and events never include participant tokens or other URL parameters', () => {
  for (const type of ['pageview', 'event']) {
    for (const path of ['/welcome', '/event3', '/results', '/admin']) {
      const original = { type, url: `https://blindmatch.app${path}?token=private-token&t=short-token&phone=private-phone#private-fragment` }
      const event = redactAnalyticsUrl(original)
      assert.deepEqual(event, { type, url: `https://blindmatch.app${path}` })
      assert.match(original.url, /private-token/, 'the browser URL/event must not be mutated')
    }
  }
})

test('normal page paths are preserved and unparseable URLs are dropped', () => {
  assert.deepEqual(redactAnalyticsUrl({ type: 'pageview', url: 'https://blindmatch.app/privacy' }), { type: 'pageview', url: 'https://blindmatch.app/privacy' })
  assert.equal(redactAnalyticsUrl({ type: 'pageview', url: 'invalid?token=private-token' }), null)
})
