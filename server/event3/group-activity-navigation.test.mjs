import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const groupsRoutePath = new URL('../../app/routes/groups.tsx', import.meta.url)
const welcomeRoutePath = new URL('../../app/routes/welcome.tsx', import.meta.url)

test('group activities preserve Event 3 test-mode query parameters', async () => {
  const [groupsSource, welcomeSource] = await Promise.all([
    readFile(groupsRoutePath, 'utf8'),
    readFile(welcomeRoutePath, 'utf8'),
  ])

  assert.match(groupsSource, /const location = useLocation\(\)/)
  assert.match(groupsSource, /to=\{\{ pathname: "\/event3", search: location\.search \}\}/)
  assert.ok(
    groupsSource.includes("window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${window.location.hash}`);"),
    'embedded group activities must retain the complete Event3 URI when intercepting back navigation',
  )
  assert.doesNotMatch(groupsSource, /pushState\(null, '', window\.location\.pathname\)/)
  assert.match(welcomeSource, /window\.location\.href = `\/groups\$\{window\.location\.search\}`/)
})
