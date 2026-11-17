# Luna shared compatibility analysis

Implemented in source, 17 November 2026. Hosted deployment, real-model quality evaluation, and native acceptance testing remain release gates.

## Member experience

- The existing chat exposes **ملفكما مع لونا** to all members after the communication agreement. Only a server-verified **وسام الجدية** member can initiate. The matched recipient can accept and read the resulting report on any tier.
- Request and acceptance provide separate, explicit consent to OpenAI processing. No new questionnaire, messages, photos, contact information, or identity documents are collected for analysis.
- The stored assessment currently contains 32 self/partner answers plus 12 personality statements, not 44 new questions. Saved priorities and hard requirements provide additional context. Both assessments must be complete.
- Eight report sections cover summary, strengths, differences, cross-dimensional patterns, mutual expectations, friction, optional conversation prompts, and a balanced conclusion. Length follows evidence quality; no marriage-success probability or replacement compatibility score is produced.
- Each person privately reviews interpretations based solely on their own cited answers, with optional source details. These are **own-only disclosure previews, not previews of the exact joint wording**. Joint text is withheld because showing it early could disclose the other person's preferences. Approval authorizes the corresponding shared inference; it does not guarantee identical wording.
- Unselected disclosures are refused. Refusing a source also removes other findings, summaries, or conclusions depending on that person's refused source. Only mutually approved findings are published. Either person can subsequently withdraw in-app access; saved external copies cannot be recalled.
- There is no analysis-credit purchase system. The current gate is the seriousness subscription. Abuse controls permit three requests per requester per rolling day and at most three generation attempts per request; these are operational limits, not a marketed credit allowance.

## Implementation map

| Boundary | Files |
| --- | --- |
| Chat entry, consent, private review, report | `src/community/DeepCompatibility.tsx`, `deepCompatibility.css`, integration in `Community.tsx` |
| Typed, fail-closed response projection / real-member adapter | `deepCompatibilityModel.ts`, `deepCompatibilityClient.ts`, `data.ts` |
| Authenticated generation endpoint / model validation | `api/deep-compatibility.mjs`, `api/_lib/deep-compatibility.mjs` |
| State machine, evidence, access, retention | `supabase/migrations/20261118010000_deep_compatibility.sql` |
| Member disclosures / comparison | `src/legal/LegalNotice.tsx`, `src/membership/Membership.tsx` |

`marriage_deep_analysis(connection_id, action, decisions)` is the authenticated member RPC. Actions are get/request/accept/decline/cancel/review. The service-only `marriage_deep_analysis_job` claims a six-minute lease and publishes or fails the result. A claim copies no client-provided evidence: the browser sends only a connection ID, and the API obtains the actor from a live authenticated state RPC.

State: requested → ready → generating → review → shared. Decline, cancellation, stale answers/expiry, and bounded failures have explicit handling. The UI polls/revalidates state but never starts a model call from polling. Real-member capability is deliberately absent from demo and private-tester adapters; fixtures use isolated fake data.

## Model and privacy boundaries

Generation follows the existing Luna model (`gpt-6-luna`). One joint request reasons over the server snapshot and produces evidence-linked findings. Two parallel, isolated requests then produce the private disclosure previews. Each receives only that person's cited evidence and section/ID metadata—never the partner's answers or the joint text. All calls use `store: false`, bounded output, timeouts, and no automatic provider retries.

Both JavaScript and SQL validate report shape, section coverage, unique IDs, and actual bilateral evidence references. The API also rejects invented percentages, links, and unsupported hard-incompatibility labels. These checks do not prove semantic faithfulness: a real Arabic report-quality review is required before release. No private evidence or model response is logged or returned by the generation endpoint.

Tables have RLS and no direct member/service-role table grants. Only participant-authorized projections expose own previews or approved joint text. Denied findings are physically removed. Answer changes invalidate access; blocking or ending the match cancels and erases analysis content immediately. Account/connection deletion cascades. Requests expire after seven days; accepted analyses after thirty days. Existing `operations_cleanup` deletes expired or inaccessible records; account export excludes partner sources and unpublished drafts.

## Resume / release checks

1. Review and explicitly authorize applying the pending membership migrations in timestamp order, then `20261118010000_deep_compatibility.sql`, to the intended marriage environment. Nothing here applies them to a hosted database.
2. Deploy the server endpoint with existing server-only OpenAI/Supabase configuration and the updated member bundle. `vercel.json` requests 300 seconds; confirm hosting supports that duration. Native staging intentionally cannot send its token to the production AI endpoint.
3. Run a real two-account acceptance: serious sender, free recipient; reject, accept, change answers mid-generation, decline one disclosure, confirm dependent omissions, reopen report, withdraw, block, expire session. Review Arabic specificity, uncertainty, source fidelity, and absence of unsupported predictions. No live model call was made by automated tests.
4. Complete the Apple sandbox and signed iPhone checks in `APPLE_SUBSCRIPTIONS.md`. A browser preview or Git push does not validate StoreKit or update TestFlight.

Targeted checks from `iphone/`:

```sh
npm run typecheck
npm run build
node --experimental-strip-types --test tests/deep-compatibility.test.mjs tests/deep-compatibility-model.test.mjs
```

From `iphone/supabase/tests/`: `node --test deep-compatibility.test.mjs membership-products.test.mjs membership-tiers.test.mjs membership-discovery.test.mjs`.

Browser fixture: `tests/fixtures/deep-compatibility-qa.html`; simulated browser viewport checks are not native-device verification.
