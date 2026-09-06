import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const readRoute = () => readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8")

test("AI welcome keeps its corner escape action limited to the loading state", async () => {
  const route = await readRoute()
  const start = route.indexOf("function AiWelcomePopup")
  const end = route.indexOf("function NotEnrolledScreen", start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const popup = route.slice(start, end)

  assert.match(
    popup,
    /\{loading && \(\s*<motion\.button[\s\S]*aria-label="تخطّي الرسالة والدخول إلى الفعالية"/,
  )
  assert.doesNotMatch(popup, /loading \? "الدخول الآن" : "المتابعة"/)
  assert.match(popup, /dismissButtonRef\.current \|\| cardRef\.current/)
  assert.match(popup, /\{!loading && failed && \([\s\S]*يلا نبدأ/)
})
