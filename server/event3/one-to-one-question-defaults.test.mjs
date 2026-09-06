import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const event3RoutePath = new URL('../../app/routes/event3.tsx', import.meta.url)
const slideshowPath = new URL('../../app/components/QuestionSlideshow.tsx', import.meta.url)

test('one-to-one meetings progress from rhythm to choice to partnership', async () => {
  const [event3Source, slideshowSource] = await Promise.all([
    readFile(event3RoutePath, 'utf8'),
    readFile(slideshowPath, 'utf8'),
  ])

  assert.match(event3Source, /<QuestionSlideshow defaultSet="rhythm" \/>/)
  assert.match(event3Source, /defaultSet=\{isThirdChoice \? "partnership" : "choice"\}/)
  assert.match(
    event3Source,
    /questionPhase === "phase1" \? "rhythm" : questionPhase === "phase2" \? "choice" : "partnership"/,
  )

  assert.match(slideshowSource, /defaultSet === 'rhythm'\) return \['rhythm'/)
  assert.match(slideshowSource, /defaultSet === 'choice'\) return \['choice'/)
  assert.match(slideshowSource, /defaultSet === 'partnership'\) return \['partnership'/)
  assert.match(slideshowSource, /useState<QuestionSet>\(\(\) => availableSets\[0\]\)/)
})
