# Group voting activities

Two activities, each with 30 Arabic prompts and a tailored discussion question per prompt. Both are about everyday group habits and friendships, without a romantic premise.

- **Green / Red / Depends — أخضر، أحمر، أو يعتمد؟**: private choices on one phone, then anonymous counts and discussion.
- **Unwritten Rules — قوانيننا غير المكتوبة**: agree/disagree voting, then discussion and an explicit group decision to add a rule to the unofficial rulebook. A majority vote does not automatically add a rule.

Participants may skip any prompt. Skips are displayed separately. The shared group display receives no individual choices or vote counts before the reveal. Each event round starts ten prompts further into the bank; all 30 remain available. Groups can finish early after any reveal.

The rulebook survives switching activities while GroupsPage remains mounted. It is not stored across page reloads or closing the group activity page; the summary tells participants to take a screenshot to keep it.

Content source: `app/lib/event3-social-votes.ts`.

## Artwork

Assets: `public/event3/activities/green-red-depends.webp` and `public/event3/activities/unwritten-rules.webp`.

Generated with the built-in imagegen tool using `lets-agree.webp` as a style reference. Delivery exports are 512 × 512 WebP at quality 94; generated originals are preserved. Both use the existing midnight navy backdrop, broad ribbon shapes, paired face profiles, and purple/blue/cyan/mint gradients. Green / Red / Depends uses three flags; Unwritten Rules uses an open book and checkmark. No text is embedded in either logo.
