# Wudayn UI/UX/GUI standards

These are permanent, mandatory standards for all Wudayn interface work. Apply them alongside the root `AGENTS.md`, which defines architecture, security, development efficiency, and product boundaries. This policy grants creative responsibility within the requested task; it does not authorize unrelated feature, architecture, or design changes.

## Product identity and existing standards

Wudayn is a serious Saudi marriage application. Aim for polished iPhone experiences, excellent Arabic RTL, natural and culturally appropriate Arabic, intuitive accessible interactions, strong privacy, and minimal onboarding friction. Preserve the established design system, branding, navigation, safe-area handling, scroll behavior, and purposeful animations.

Use existing components, utilities, design tokens, and motion patterns. Inspect effective CSS and relevant implementation before changing them. Maintain visual consistency across screens and representative device sizes. Creativity must improve comprehension, usability, emotional relevance, or product coherence. Never confuse visual elaboration with premium quality.

## Adaptive creative freedom

Select the level that matches the requested scope. Do not inflate a small task into a redesign. When a task contains several kinds of work, apply the appropriate level to each affected part.

### Level 1 — Bug fixes and minor adjustments

Creative freedom is minimal. For bug fixes, alignment corrections, spacing adjustments, and other small UI changes:

- Preserve the existing design and interactions.
- Make focused changes without unnecessary redesigns.
- Introduce no new visual concept without a clear reason connected to the fix.
- Perform proportionate before-and-after visual validation of the affected element and state. Keep this lightweight for localized changes.
- Avoid unnecessary alternatives, brainstorming, or approval interruptions for routine corrections.

### Level 2 — New components and features

Creative freedom is proactive and selective. For new components, screens, interactions, animations, or features:

- Identify the purpose, the member's context, and the conventional implementation.
- Independently explore at least one meaningfully more inventive alternative. Explore genuine improvements rather than generating alternatives to satisfy a quota or presenting cosmetic variants.
- Consider intuitive interactions, meaningful visual metaphors, elegant information presentation, typography, transitions, and motion appropriate to Wudayn.
- Evaluate whether an alternative improves the experience enough to justify its accessibility, performance, implementation, and maintenance costs.
- Briefly recommend a superior alternative when one exists, stating its benefit and material trade-off. Recommend the strongest choice rather than leaving an endless list of options.
- Use the conventional implementation when it is best. Proceed with the established direction; obtain approval before a significant conceptual departure.

### Level 3 — Full redesigns and new experiences

Creative freedom is high. For substantial redesigns, major new experiences, or open-ended design requests:

- Explore at least three genuinely distinct concepts, considering different layouts, information hierarchies, interaction models, visual metaphors, and animations.
- Do not present minor changes of color, radius, or decoration as separate concepts.
- Evaluate originality, usability, visual sophistication, emotional relevance, accessibility, performance, and implementation cost.
- Recommend the strongest direction with clear, concise reasoning.
- Obtain approval before implementing a major conceptual departure. Existing explicit approval for a direction should not trigger repeated confirmation requests.

## Creative inspiration and taste

Think beyond ordinary components when doing so adds value. Generic progress indicators, cards, onboarding steppers, badges, loading animations, and discovery layouts are possible starting points, not automatic answers. Consider whether the information or emotion can be expressed more meaningfully.

For example, incorporating compatibility progress into a wedding ring (دبلة) combines function, symbolism, and product identity more effectively than merely polishing a generic circular progress indicator. This establishes the expected level of conceptual thinking. It is not a recurring motif: do not repeatedly reuse rings or force marriage symbolism into unrelated interfaces.

Seek intelligent ideas through context-aware motion, intuitive microinteractions, spatial relationships, progressive disclosure, culturally relevant details, and clear information visualization. The idea should feel natural once understood. A conventional solution is valid when it serves the member best.

Reject gimmicks, overly literal symbolism, visual noise, emotional manipulation, confusing interactions, generic generated aesthetics, and complexity whose maintenance cost exceeds its value. Do not invent weaknesses or redesign approved components just to demonstrate creativity.

## Motion as product design

Motion should communicate state, progression, relationships, or interaction feedback, and make navigation easier to follow. Favor refined timing, restraint, readability, responsiveness, and high performance. Respect reduced-motion settings and the existing motion implementation. Evaluate animation in the actual rendered interaction, including interrupted or repeated use where relevant.

## Continuous creative evaluation and visual QA

Creative evaluation continues during component development, interaction work, responsive adaptation, and screenshot inspection. Do not stop thinking after planning. Inspect both visual execution and the underlying concept, proportionate to the creative level.

For significant UI changes, the mandatory process is:

1. Capture baseline screenshots of the affected experience before implementation.
2. Develop and evaluate concepts appropriate to the creative freedom level.
3. Implement the approved or established direction using the existing system.
4. Capture matching screenshots afterward across representative iPhone resolutions, including Dynamic Island and older notched layouts where applicable. Match route, viewport, scroll position, data, and interaction state so comparisons are meaningful.
5. Critically assess alignment, spacing, typography, color, safe areas, RTL, hierarchy, image treatment, readability, controls, accessibility, and conceptual quality. Exercise relevant scrolling, keyboard, loading/error, and transition states.
6. Refine meaningful weaknesses within scope and repeat the affected checks. Propose significant conceptual changes for approval before implementing them.

Use actual rendered screenshots rather than treating source inspection, typechecks, or builds as visual evidence. Browser viewport checks do not establish native-device behavior. If capture or a required device is unavailable, finish the checks that are possible and report the exact validation gap; do not claim the visual/device gate passed or expand scope to compensate.

During inspection, consider whether information could be communicated more elegantly, an interaction could be more intuitive, or subtle motion could clarify state. If the concept is awkward, consider conceptual refinement instead of only adjusting margins or colors. Keep approved direction, task boundaries, privacy, and performance requirements in force.

Before completing a substantial interface feature, check that it:

- Is visually polished and technically correct.
- Feels intentionally designed and coherent with Wudayn.
- Communicates meaning clearly and remains accessible.
- Uses invention to improve usability, comprehension, or emotional relevance.
- Has no clearly superior unconsidered concept that should be surfaced briefly.

Keep internal exploration efficient. Present concise recommendations and meaningful trade-offs; lengthy brainstorming is unnecessary unless requested. Keep validation proportional for small changes while meeting the screenshot requirements for significant work.

**Be inventive when invention adds value, restrained when simplicity is better, and meticulous in both cases.**
