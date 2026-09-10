import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [route, styles] = await Promise.all([
  readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/app.css", import.meta.url), "utf8"),
])

test("Event3 uses one isolated premium visual system", () => {
  for (const token of [
    "--event3-purple",
    "--event3-cyan",
    "--event3-surface",
    "--event3-line",
    "--event3-radius-card",
  ]) assert.match(styles, new RegExp(token))

  assert.match(styles, /\.event3-stage\s*\{[\s\S]*isolation: isolate/)
  assert.match(styles, /\.event3-glass\s*\{[\s\S]*backdrop-filter: blur\(22px\)/)
  assert.match(styles, /\.event3-sheet\s*\{/)
  assert.match(route, /event3-ambient__halo--primary/)
  assert.match(route, /event3-ambient__vignette/)
})

test("Event3 mobile controls remain readable and easy to tap", () => {
  assert.match(styles, /\.event3-shell :where\(input, textarea, select\)\s*\{[\s\S]*min-height: 3\.25rem;[\s\S]*font-size: 1rem;/)
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*\.event3-shell :where\(button, \[role="button"\], a\.event3-action\)[\s\S]*min-height: 3rem;/)
  assert.match(styles, /\.event3-shell :is\(\.text-\\\[8px\\\], \.text-\\\[9px\\\], \.text-\\\[10px\\\]\)[\s\S]*font-size: 0\.75rem;/)
  assert.match(styles, /padding-bottom: max\(1\.5rem, env\(safe-area-inset-bottom\)\)/)
  assert.match(styles, /-webkit-tap-highlight-color: transparent/)
})

test("all long participant states opt into the shared mobile treatment", () => {
  for (const className of [
    "event3-auth-view",
    "event3-setup-view",
    "event3-round-view",
    "event3-ranking-view",
    "event3-feedback-view",
    "event3-processing-view",
    "event3-break-view",
    "event3-final-view",
  ]) assert.match(route, new RegExp(className))

  assert.match(route, /event3-ranking-view flex min-h-0 flex-col overflow-hidden/)
  assert.match(route, /event3-scroll min-h-0 flex-1 overflow-y-auto/)
})

test("welcome animation is brief, skippable, and respects reduced motion", () => {
  assert.match(route, /setIntroStage\("brand"\), 650/)
  assert.match(route, /setIntroStage\("welcome"\), 1450/)
  assert.match(route, /onClick=\{\(\) => setIntroStage\("welcome"\)\}/)
  assert.match(route, /if \(reduceMotion\) \{[\s\S]*setIntroStage\("welcome"\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.event3-shell \*/)
})

test("final reveal has a cohesive mobile-first finale treatment", () => {
  assert.match(route, /event3-finale-stage/)
  assert.match(route, /event3-finale-journey/)
  assert.match(route, /event3-finale-reveal-list/)
  assert.match(route, /event3-finale-cta/)
  assert.match(styles, /\.event3-finale-stage\s*\{[\s\S]*backdrop-filter: blur\(22px\)/)
  assert.match(styles, /\.event3-finale-cta\s*\{[\s\S]*linear-gradient/)
  assert.match(styles, /@keyframes event3-finale-cta-sheen/)
})

test("tutorial uses the premium Event3 surface and anchored mobile navigation", () => {
  assert.match(route, /event3-tutorial-shell/)
  assert.match(route, /event3-tutorial-card/)
  assert.match(route, /event3-choice-story__slide/)
  assert.match(route, /event3-tutorial-act/)
  assert.match(route, /event3-tutorial-ranking/)
  assert.match(route, /event3-tutorial-mutual/)
  assert.match(styles, /\.event3-tutorial-card\s*\{[\s\S]*backdrop-filter: blur\(22px\)/)
  assert.match(styles, /\.event3-choice-story__slide\s*\{[\s\S]*grid-template-rows/)
  assert.match(styles, /\.event3-tutorial-header,[\s\S]*\.event3-tutorial-nav\s*\{[\s\S]*backdrop-filter: blur\(20px\)/)
  assert.doesNotMatch(route, /TutorialModeChooser|tutorialChoice/)
})
