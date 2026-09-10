import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const readRoute = () => readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8")

test("AI welcome keeps one stable, focused corner action through loading and completion", async () => {
  const route = await readRoute()
  const start = route.indexOf("function AiWelcomePopup")
  const end = route.indexOf("function NotEnrolledScreen", start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const popup = route.slice(start, end)

  assert.match(
    popup,
    /<motion\.button[\s\S]*ref=\{dismissButtonRef\}[\s\S]*aria-label=\{loading \? "تخطّي الرسالة والدخول إلى الفعالية" : "متابعة الدخول إلى الفعالية"\}/,
  )
  assert.match(popup, /dismissButtonRef\.current \|\| cardRef\.current/)
  assert.match(popup, /\{!loading && <p className="sr-only" role="status" aria-live="polite">/)
  assert.match(popup, /\{!loading && failed && \([\s\S]*يلا نبدأ/)
})

test("Event3 walkthrough scopes contact-choice privacy to the other participant", async () => {
  const route = await readRoute()

  assert.match(route, /لا يظهر قرار أي طرف للآخر منفرداً/)
  assert.doesNotMatch(route, /يبقى قرار كل طرف سرياً تماماً/)
})
