# Abdulrahman simulation

The private Abdulrahman tester session automatically starts local fictional activity. The `محاكاة` drawer can pause, step or reset it. Reham has no simulation controller or AI callback; the server also rejects her session for generation. Real member accounts cannot access this mode.

Visits, interest and requests follow a causal sequence with varied timing. Matches count the existing real test pair toward the two-match limit. A real exclusive pair stops fictional activity. Simulated agreements require the user's signature; advancement, rewind and call permissions affect only local fictional records. They never modify Reham's pair. Actual voice calls remain available only between the two testers.

Replies use the existing configured OpenAI model (`NISFAYN_AI_MODEL`, default `gpt-5.4-mini`), fixed fictional persona briefs and bounded text history. Only fictional-thread text is sent; real-pair history and uploaded media are excluded. Early introduction anchors and recent turns provide context (32 messages / 8,000 characters per request). The browser saves up to 100 text messages per fictional thread, retaining introduction anchors. This is browser-local memory, not cross-device sync.

The existing authenticated database quota remains authoritative: 6 requests/minute, 80/day per tester and 300/day globally. Identical warm-instance requests share cached results. Offline/limited AI uses a local reply and records that fallback in simulation controls. The model must identify itself truthfully if directly asked; no per-message AI badge is required within the disclosed simulation.

Activity runs only while the app is in the foreground. Pause, tab hiding, deletion, blocking, closed matches and changing exclusivity invalidate late replies. No background jobs, real member notifications, new database migrations or BlindMatch changes.

Profile photos use the existing private-portrait authorization component across chat, notifications and calls. Normal member privacy/blur policies remain in force.

Validation: 53 targeted AI, isolation, simulation, persistence, journey, persona and portrait tests passed; production TypeScript/Vite build checked before deployment.
