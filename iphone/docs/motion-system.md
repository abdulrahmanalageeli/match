# Wudayn iOS motion

Wudayn runs its member interface in a Capacitor WebView. The screen, selected answer and server-reported status should be readable as soon as they exist. Motion identifies **what changed, where it came from, or where to resume reading**. The member can act while the animation finishes.

## Timing and movement

| Use | Timing | Behavior |
| --- | --- | --- |
| Touch contact and release | 75 / 120 ms | A native button compresses to .982 on contact. Independent CSS scale preserves the button's positioning transform. Disabled controls remain still. |
| Local state | 160–200 ms | Emphasize one changed value, underline or receipt. A picker closes immediately and returns focus to the invoking row. Choosing a different value gives its label a 2 px settling movement. Escape returns focus silently. |
| Navigation | 220 ms shift, 280 ms reveal tokens | Welcome-to-account uses a short 12 px RTL entrance and 6 px exit. Back reverses direction. Member tabs keep their existing measured marker glide. Profile sections replace their text immediately and move the reading marker. |
| Shared content reveal | 240 ms default | Existing semantic reveal components begin at .82 opacity and 6 px displacement. Keep stable headings, long text, and editable controls stationary whenever possible. |
| First arrival | 360 ms trace, 55 ms offset between strokes | Draw the two parts of Wudayn's mark once, in the actual header. The courtyard, headline and signup control are already present. Returning to the page keeps the mark settled. |

Use the existing settle curve `cubic-bezier(.22,.78,.28,1)` for arrival and the release curve `cubic-bezier(.2,.8,.25,1)` for touch. A stroke may start just after its counterpart. Lists of answers and messages enter as groups without a per-row delay. Direction follows the actual RTL control order. Geometry follows the measured identity or tab position. There is no spring or overshoot in these paths. Native pickers retain their own gesture behavior.

**Haptics.** Use selection for a deliberate decision and notification feedback for an actual outcome. A success, warning or error can follow a selection within the 450 ms suppression window. Repeated results stay quiet. Mutual progression checks the state returned by the service. Closing a relationship has no success vibration. The iOS bridge uses UIKit, requires the foreground app and honors the in-app haptics preference. Unsupported platforms remain silent. Reduced Motion and haptics are independent preferences.

**Accessibility and interruption.** Both system and app Reduced Motion settings apply. Selection, failure and delivery remain visible through text, ink, checkmarks or position when movement is disabled. Text input, OTP entry, consent and slider commits run on their existing events. Preserve native dialog focus, Escape and scroll restoration. A decorative transition may be skipped on backgrounding, rapid navigation or unsupported browsers. Keep private photos outside shared-element snapshots.

## Five design decisions

| Moment | Concepts considered | Selected treatment and reason |
| --- | --- | --- |
| First launch | Full-screen courtyard aperture, moving logo between two screens, drawing the existing header mark | The header trace gives the brand one moment of movement and releases the signup screen on its first frame. |
| Luna interprets an introduction | Progressive transcription into rows, morphing the chat bubble, one grouped reveal with a source rule | The source rule connects an editable proposal to the words supporting it. A correction changes its treatment in place. AI latency never determines how long a decorative sequence lasts. |
| A partner criterion becomes strict | Sliding pill, staggered target inputs, underline sized to the selected Arabic label | The underline identifies which importance changed. Its target field becomes available immediately. |
| Discovery to compatibility | Whole-card expansion, page dissolve, identity handoff plus a reading marker | The portrait or initial provides continuity. A missing or protected image takes the direct route. Within the profile, only the marker travels while the Arabic text remains readable. |
| A message reaches its recipient | Moving the bubble, a persistent spinner, a stationary receipt with two strokes | The message stays in place. The first and second strokes distinguish accepted and delivered. Read uses ink and a label. Failure gets its own mark and a visible retry action. |

## Journey coverage and implementation boundaries

Paths below are relative to `iphone/`.

| Journey or control | Decision | Implementation |
| --- | --- | --- |
| Welcome, account entry, forward/back | In-place emblem and shorter directional handoff. Keyboard focus can reach signup immediately. | `src/Welcome.tsx`, `src/welcome.css`, `src/welcomeNavigation.css` |
| Main tabs, sheets, overlays | Keep the measured member-tab glide and native dialog lifecycle. A searchable sheet opens nearer its final position. Commit emphasizes the new field value. | `src/Home.tsx` (existing tab behavior), `src/ui/SheetChoiceSelect.tsx`, `src/ui/SheetChoiceSelect.css` |
| Shared controls, success and errors | CSS handles ordinary press feedback. Shared reveals retain interruption and reduced-motion handling. Native result haptics take precedence over a recent selection. | `src/motion.css`, `src/arrivalSurfaces.css`, `src/motion/Reanimated.tsx`, `src/feedback/haptics.ts` |
| Registration, OTP, personal and public profile fields | Bring the code field into focus after SMS succeeds. Keep the account and phone context visible. Forward/back registration steps use short opposing movement. Text, date, search, numeric and consent controls retain their native semantics. | `src/auth/signup-sms.css`, `src/onboarding/SignupBasicsSlides.tsx`, `src/onboarding/signup-slides.css` |
| Luna, questionnaire, correction and partner criteria | Extracted answers arrive together. Source and edit state stay adjacent. Questionnaire transitions describe direction. The criterion indicator follows the Arabic control geometry. | `src/interview/HybridAssessment.tsx`, `src/interview/hybrid-assessment.css`, `src/onboarding/MarriageFields.tsx`, `src/onboarding/marriage-fields.css`, `src/onboarding/arrivalAssessments.css` |
| Photos, reveal controls, readiness and submission | Retain the explicit media and disclosure choices, immediate privacy preview, readiness agreement and server submission. The shared controls supply touch feedback. | `src/onboarding/MensPhotoChoice.tsx`, `src/onboarding/ProfilePhotoChoice.tsx`, `src/onboarding/ReadinessStep.tsx` (existing behavior) |
| Discovery, preview, member profiles, connection requests | Restore the same row and focus after dismissal, including recommendations without a photo. Interest feedback waits for the request to succeed. | `src/community/Community.tsx`, `src/community/useWeeklyCardTransition.ts`, `src/community/arrivalDiscovery.css`, `src/profile/MemberProfile.tsx` |
| Compatibility and reports | A verified score change interpolates the existing bar. The exact number is immediately readable. Missing data has no rail. Existing reports and score computation keep their own boundaries. | `src/compatibility/FitDetails.tsx`, `src/compatibility/fit.css` |
| Messaging, connection decisions, exclusivity | Keep receipts anchored, preserve reading position, keep retry visible near the bottom, and acknowledge mutually confirmed advancement. | `src/community/Community.tsx`, `src/community/arrivalChat.css` |
| Membership review, paywall, settings and empty states | The review timeline marks its current step. Its ring holds only while a refresh is pending. Entitlement continues to come from the service. Static placeholders, empty states and reduced-motion switch states remain legible. | `src/Screens.tsx`, `src/onboarding/arrivalJourney.css`; existing `src/settings/settings.css` and `src/feedback/RoutePlaceholder.tsx` |

## Verification and next priorities

Local browser runs used 375×667, 390×844 and 430×932 CSS-pixel viewports. Checks covered keyboard navigation and focus return, RTL, enlarged type, system and in-app Reduced Motion, SMS failure and retry, and failed, pending, delivered and read messages. Fake accounts and service responses supplied the data. Browser timings measure component transitions; they do not measure member completion time.

The interval between the first sampled welcome frame and the first frame without the inert lock was 2,221–2,258 ms before the change in Chromium. It was zero in all three revised Chromium viewports and in Windows WebKit. This interval excludes bundle loading. The baseline used the pre-overhaul local application fixture and the revised recording used the release build. Loading and cold-start timings between those builds are not comparable. The 390 px registration recordings measured 185 ms for the extraction group to settle, 174 ms for a criterion and 175 ms for OTP. These figures include the fixture state change.

### Repeatable checks

The arrival comparison takes a local build directory and writes its recording and samples under `iphone/.tmp/flagship-motion`. Run from the `iphone` directory. The picker and registration tests use local fixtures. The screenshot and video evidence uses synthetic members.

```sh
node tests/motion-arrival.browser.mjs .tmp/flagship-motion/web after
node tests/motion-arrival.browser.mjs .tmp/flagship-motion/web after --webkit
node tests/motion-picker.browser.mjs
node tests/registration-motion.browser.mjs
node tests/discovery-refinement.browser.mjs
node --experimental-strip-types --experimental-vm-modules --test tests/haptics.test.mjs tests/chat-actions.test.mjs
```

### Remaining priorities

1. Run the same discoveries, correction and retry paths on physical iPhones with VoiceOver, an Arabic keyboard and large accessibility text. Check focus and native keyboard dismissal while the user is editing.
2. Profile compositor frames, image memory and power on a smaller physical iPhone during repeated profile opening and long chats, including Low Power Mode. Browser frame samples show intermediate states but cannot establish device frame rate, thermal cost or GPU memory.
3. Validate UIKit haptic intensity, negative outcomes and authenticated StoreKit transitions on a device with appropriate test entitlements.
