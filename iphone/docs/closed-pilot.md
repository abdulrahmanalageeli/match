# نصفين closed-pilot handoff

## Try the member journey

1. From the welcome screen select **جرّب إعداد الملف**, then **التوافق**. Choose what you do and what you want from a spouse. There are 30 optional responses across six sections. You may emphasize two sections, or expressly require a particular partner answer about children, residence or marriage timing.
2. Review who sees each field before consenting. Saving a demo profile opens **ترشيحات الأسبوع**. Open a profile and expand a topic to read the questions behind its explanation.
   To try one introduction all the way through, send a request, tap **عرض الطلبات**, then **محاكاة قبول الطرف الآخر**. This action exists only in the fictional demo. In the live app the recipient accepts the request from their own account. Confirmed mutual acceptance joins the Nisfayn heart in **تم التوافق** with a finite gold-and-rose burst and a short original chime; **ابدأ المحادثة** opens that person's chat, while **لاحقًا** keeps it available. New acceptance updates are observed while signed in; historical chats do not replay the celebration on a fresh session. Reduce Motion presents the joined logo immediately. Sound is independently muted from the celebration or **صوت التوافق** in Settings, with the preference saved on the device. Dismissing or backgrounding stops sound. If the browser blocks playback, the sound button starts it explicitly; blocked audio never queues for an unrelated later tap.
3. In a mutually accepted conversation, open **مسار التعارف**. Choosing a guided question puts it into your draft. Each member must agree separately before the app records serious discussion or a formal/family step. Either can close the chat. From Settings, **ما يراه الآخرون** previews disclosure and **نسخة من بياناتي** retrieves only the member's own contributions.

## Pilot rules

- The server validates approved adult membership, subscription, reciprocal age/location requirements, deliberate dealbreakers and blocks. An unanswered required condition prevents a new recommendation. Existing accepted conversations remain subject to participation, safety and entitlement checks.
- A Riyadh calendar week starts Monday. The first eligible visit generates at most five suggestions. Additional filtering, profile changes and repeated visits cannot expand that week's shortlist. A small or empty eligible pool can produce fewer. Requests expire after seven days. Each member can have at most three accepted conversations.
- Fit combines two directional comparisons. Default section weights, priority multipliers and band thresholds are pilot choices. An explanation is provisional until at least five topics across three sections have complete answers from both people. Lifestyle differences can be useful prompts for discussion. An incomplete assessment alone cannot produce a confident fit band.
- Candidate explanations come from versioned question and topic IDs. They are generated from structured answers using Arabic templates. No external model receives profile answers or private chat text.

## Learn from the pilot

An authorized operator can call `public.marriage_fit_cohorts()` for the last 13 Riyadh weeks. For each week, model version and fit band it returns counts of unique member/candidate offers returned by discovery, opened profiles, requests sent, acceptances and jointly confirmed formal steps. Refreshing a list or opening the same card twice does not increase its counts. The original band stays fixed if either person later changes answers. The cohort contains discovery-originated requests linked to an actual returned offer. A returned offer only establishes that the API supplied it, and older cohorts have had longer to progress. Rows linked to deleted members are removed. `public.marriage_pilot_totals()` provides daily counts across request origins for the last 30 days. Both reports are operator-only.

Use opened / returned to understand which cards attract attention. Use accepted / requested and formal / accepted to understand reciprocity and progression. Show the sample sizes beside each rate. These counters describe the pilot. Changing production weights needs prospective validation against an eligible baseline. The original event results and limits are in [the evidence report](blindmatch-evidence.md).

## Decisions and remaining launch dependencies

The working Capacitor iPhone app and existing membership model are retained. The plan's Expo rewrite and free/Plus pricing are separate product decisions. Email verification remains available. For Saudi mobile OTP, configure a supported Supabase SMS provider and rate limits, then build with `VITE_MARRIAGE_PHONE_OTP=true`. Test delivery on a real phone before opening enrollment. [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login)

App Store signing, purchase sandbox verification, lock-screen push, identity-provider integration and hosting/privacy review still require external accounts or operator work.

Photo disclosure, delegated family access, staff moderation UI and generative explanations are separate milestones. A formal-step agreement records the members' intent. It does not contact family or verify an engagement. The pilot has no training data for predicting marriage outcomes.
