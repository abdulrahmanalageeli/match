import { createRoot } from 'react-dom/client'
import { lazy, Suspense } from 'react'
import App from './App'
import { readRecoveryLink, cleanRecoveryUrl } from './auth/passwordRecovery'
import { TesterGate } from './testing/TesterGate'
import { ConnectionNotice } from './community/ConnectionNotice'
import './design.css'
import './flows.css'
import './screens.css'
import './motion.css'
import { initializeDevicePreferences } from './settings/preferences'
import { AppBoundary, initializeFaultReporting } from './monitoring'
import { initializeKeyboardViewport } from './mobile/keyboardViewport'
import './mobile/keyboard.css'
import './onboarding/arrivalJourney.css'
import './onboarding/arrivalAssessments.css'
import './community/arrivalDiscovery.css'
import './community/arrivalChat.css'
import './arrivalSurfaces.css'

document.documentElement.lang='ar'
document.documentElement.dir='rtl'
const entryUrl = new URL(window.location.href)
const recoveryLink = readRecoveryLink(entryUrl.href)
// Recovery capabilities are captured and removed before any entry screen mounts.
if (recoveryLink) window.history.replaceState(null, '', cleanRecoveryUrl(entryUrl.href))
initializeDevicePreferences()
initializeFaultReporting()
const stopKeyboardViewport = initializeKeyboardViewport()
if (import.meta.hot) import.meta.hot.dispose(stopKeyboardViewport)
const GuardianPortal = lazy(() => import('./family/GuardianPortal').then(module => ({ default: module.GuardianPortal })))
const familyEntry = !recoveryLink && entryUrl.searchParams.get('family') === '1'
const familyInvite = familyEntry ? new URLSearchParams(entryUrl.hash.slice(1)).get('invite') ?? undefined : undefined
// Invitation capabilities stay out of server logs and leave the address bar after capture.
// Preserve Supabase auth callback fragments for the guardian client to consume.
if (familyInvite) { entryUrl.hash = ''; window.history.replaceState(null, '', entryUrl.pathname + entryUrl.search) }
createRoot(document.getElementById('root')!).render(<AppBoundary>{recoveryLink ? <App recoveryLink={recoveryLink}/> : familyEntry
  ? <Suspense fallback={<main className="flow-frame" dir="rtl"><p role="status">جارٍ فتح جسر الأهل…</p></main>}><GuardianPortal inviteToken={familyInvite} onExit={() => window.location.assign(window.location.pathname)} /></Suspense>
  : import.meta.env.MODE==='demo'?<TesterGate/>:<App/>}<ConnectionNotice/></AppBoundary>)
