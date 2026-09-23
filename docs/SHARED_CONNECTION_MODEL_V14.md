# Shared connection model V14

Implemented on 23 September 2026. The application now uses the previously evaluated shared survey model for new balanced compatibility calculations. This change is prepared locally; it does not deploy the application, apply a live migration, or rewrite saved matches.

## What it does

The model takes both people's questionnaire answers and predicts a directional connection utility. It calculates A→B and B→A separately and uses the lower direction as the mutual score. Existing eligibility and assignment rules still determine which pairs can be considered.

Training used 75% total loss weight on whether people wanted to connect after a meeting and 25% on their rankings. This is a training mixture, not two displayed scores averaged together. It is a shared model: a person's identity and personal feedback history are not predictors, and attending another event does not automatically retrain it.

The original artifact is copied byte-for-byte to `server/matching/connection-model-config.json`. It contains 910 feature coefficients fitted from 256 connection responses and 1,966 ranking directions from Events 26–28. Its SHA-256 is `b14be564cf25d5cfecbb88858a2e480f8bd8d32828a67a3a4be4136e3eeb021d`. The embedded `SHADOW_ONLY` and `production_activation: false` fields describe its original research provenance; application activation is controlled by the separate runtime version.

## Scores and explanations

Runtime version: `2026-09-23-v14-shared-connection-75-25-min-100`.

Raw utilities are mapped monotonically onto a relative 0–100 index using the frozen distribution of training-profile utilities. The reference mapping uses no outcomes to calibrate success probabilities. It preserves raw ordering except for rounding to six decimals. The score means relative model preference, not a probability of connection or romance. The mutual index is the lower directional index.

AI semantic analysis and existing questionnaire dimensions remain available as diagnostics. They add no bonus or penalty to this model. The existing AI precache workflow remains in place for those explanations. UI labels for the current model use `/100`; historical saved scores retain their provenance.

The serialized field `scoreBreakdown.personalized` is retained for API compatibility. Its payload explicitly records `personalHistoryApplied: false`, the model hash, raw utilities, score meaning, and the minimum-direction formula.

## Cache and storage

Cache identities include the new version and every effective shared-model questionnaire input, including MBTI answers and stored-type fallback. Previous model scores are rejected as current cache hits. Current payload validation checks the raw-to-index mapping, mutual arithmetic, evidence counts, direction identity, and diagnostic-only AI behavior.

Migration `20260923130340_activate_v14_shared_connection_model.sql` advances database freshness markers and adds guards for V14 cache and result rows. Historical model guards and saved historical values remain intact. Deploying requires applying this migration with the application update, then rebuilding current compatibility caches before generating matches. Do not reinterpret historical results as V14 or replace their saved snapshots.

## Verification and limits

The isolated V14 release against `main` passes 205 matching and relevant Event3 tests and the production build. It excludes the unrelated, unreleased V13 migration test. Regenerating the synthetic fixtures produces identical bytes, and the independent score-scale verification passes. The model artifact is protected from Git line-ending conversion so its pinned SHA-256 remains identical on Windows and Linux.

The JavaScript encoder is checked against 66 Python-generated synthetic pair fixtures covering all 910 features, including missing answers, survey formats and MBTI fallback. Separate tests cover the display scale, server/client score contracts, cache invalidation and PostgreSQL persistence guards. Fixtures contain synthetic profiles, not participant records.

The production build passed with bundled Node 24.19.0. The final combined matching/relevant Event3 run passed 202 tests; four additional participant API contract tests passed after the final missing-total guard (206 passing checks in total). Targeted TypeScript checks passed for the display components and client model contract. The wider Event3 run also exposed four pre-existing failures: three UI expectation failures and a support-resolution test that assumes LF line endings in the CRLF source. The original-file backups reproduce these failures; unrelated implementation was left unchanged. Two concurrency-related VM timeouts passed when rerun separately.

Implementation parity is not new accuracy evidence. The earlier retrospective comparison remains a separate research analysis. The fixed 75/25 candidate had 71.7% expected positive top choices in that analysis; the 72.7% figure belongs to the broader selection procedure. The final all-recent-data artifact has not been prospectively validated, and it did not improve every metric or User 7's benchmark. No further optimization or retraining was performed during this implementation.
