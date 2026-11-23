# Wudayn capacity for 100 members

**Planning midpoint for the first 30 days.** If 100 people register and wait for launch, budget about **37 MB of objects and 61 MB downloaded** from member APIs and storage. If those same people also use Discovery and chat on 20 days, the estimate rises to **181 MB of gross objects and 5.0 GB downloaded**. Most of the difference comes from repeatedly fetching portraits. These are workload estimates. All MB and GB below use decimal units.

| First month, same 100 members | Registration only | Registration plus active use |
|---|---:|---:|
| PostgreSQL, auth + application schemas, including baseline | 9.6–22.6 MB | 23.6–66.6 MB |
| Gross media uploaded to Storage | 37 MB (18–85) | 181 MB (87–376) |
| Device uploads including forms/messages, midpoint | ~47 MB | ~202 MB |
| API and protected-media response bodies delivered to devices | ~61 MB (29–134) | ~5.0 GB (1.2–15.0) |
| Live audio, separate Agora workload | 0 | 1,000 participant-minutes |
| Example Luna provider calls | 190 | 290 including 100 model-assisted searches |

**Measured locally.** With all migrations loaded, the disposable database used 4,325,376 bytes across auth and application relations before seeding. Adding 100 minimal approved synthetic accounts increased allocation by 245,760 bytes. A 24-card synthetic directory page was 14,617 bytes of JSON or 1,066 bytes gzipped. One synthetic account response was 617 bytes or 375 gzipped. The fixture repeats values and omits real histories. The model therefore uses larger response sizes and budgets for production documents. PostgreSQL grows in pages, so the seed delta is specific to that run.

### Registration only

- **Database.** Add 50–180 kB/member for the completed application, Luna transcript and structured snapshot, answer rows, consent receipts and indexes to the measured 4.57 MB seeded footprint. The range excludes provider system schemas, WAL, backups and point-in-time recovery.
- **Uploads.** Assume 100 encoded profile/gallery objects in total, including any additional permitted portrait version, at 220 kB each (120–450 kB). Assume 20 verification attachments at 750 kB (300 kB–2 MB). The result is 22 + 15 = **37 MB of files**. Allow another 100 kB/member for form and RPC uploads. A member choosing an avatar has no personal portrait upload. Manual verification accepts files up to 5 MiB.
- **Downloads.** Assume one retrieval per uploaded object by a member or reviewer, 30 account reads/member at 4 kB compressed (2–8 kB), and 120 kB/member of other application responses (50–250 kB). This gives 37 + 12 + 12 = **61 MB**. Reopening the waiting screen throughout the month adds active minutes and policy/receipt reads.
- **Luna.** A sample required interview request with an empty synthetic transcript, the full catalog and its structured-output schema was **83,919 JSON bytes**. A search request for a short Arabic query was 13,301 bytes. At one final extraction/member, 60 independent grounding checks and 30 requested choice explanations, the workload is **190 model calls**. The configured output ceilings total 1,226,500 tokens (100 × 10,000 + 60 × 3,500 + 30 × 550). Actual input and output depend on the transcript, schema, follow-ups and retries. Use provider-reported token counts. These backend requests travel separately from member device traffic.

### Active use

Assume 2,000 eight-minute sessions (100 members × 20 days), 20,000 text messages, 300 chat photos, 200 voice notes averaging 30 seconds, and 50 ten-minute calls between pairs.

| Driver | Midpoint calculation | Result |
|---|---|---:|
| Additional database growth | 20,000 messages × 0.6–1.8 kB including indexes, plus 2–8 MB for attachment metadata, events, read state and notification work | 14–44 MB |
| Chat photo uploads | 300 × 320 kB (150–650 kB) | 96 MB |
| Voice-note uploads | 200 × 30 seconds × 64 kbit/s ÷ 8 (15–60 seconds for range) | 48 MB |
| Additional non-media uploads | 20,000 messages × 300 B, plus ~5 MB for session requests | ~11 MB |
| Browse portraits | 2,000 sessions × 10 actual file downloads × 220 kB | **4.4 GB** |
| Chat media downloads | 75 one-time photos fetched once, 225 ordinary photos fetched twice, 200 voice notes fetched twice | 264 MB |
| Account API | 2,000 sessions × (one entry + 24 visible 20-second refreshes) × 4 kB | 200 MB |
| Directory API | 2,000 sessions × 3 pages × 8 kB compressed | 48 MB |
| Other responses | Allow for chat pages, realtime signals, notifications, policy checks and other controls | 60 MB |

Adding the 61 MB registration workload gives **5.03 GB delivered**. The bandwidth range uses 4–15 portrait downloads/session at 120–450 kB, 1–3 reads of ordinary chat media, 4–12 kB/directory page, and 30–120 MB for other responses. Count actual file downloads, including repeat opens, separately from cards rendered or permission checks. Most avatar-only browsing stays near the API rows. Voice notes request 64 kbit/s where the recorder supports the selected format. Encoders and container overhead vary.

The 181 MB storage midpoint comprises 37 MB during registration plus 144 MB uploaded in chat. It assumes every object is still present. Actual month-end storage depends on consumption, report holds, retention, deletion and cleanup completion. Over later months, add surviving new media and messages to the existing stock. Application egress above counts final device-facing response bodies once. Storage-to-Edge reads, transport overhead, retries, hardware backup and provider billing meters should be measured separately.

**Launch burst.** If all 100 members are simultaneously foregrounded, the account-state timer alone averages about five requests/second, with up to 100 initial reads arriving together. Realtime connections, discovery, media and subscription receipts add work. For phone sign-ups, count SMS sends as the number of verified-phone flows plus retries. Launch push delivery scales with opted-in registered devices, which can differ from the member count.

**Live calls.** Fifty ten-minute calls between two people use **1,000 Agora participant-minutes**. For illustration, at 24–64 kbit/s audio payload in each direction, that is 180–480 MB sent and 180–480 MB received across all participants. The SDK uses its speech encoder and adapts to the connection. Live calls do not create stored chat voice notes. An additional 100 model-assisted Luna searches adds 100 provider calls, about 1.33 MB of short-query request envelopes and up to 180,000 output tokens. Locally resolved searches skip that model call. Deep reports and safety analyses should have their own request and token counters.

### App delivery and the first measurements to collect

In the local web build the entry JavaScript/CSS gzipped to **402,582 / 58,372 bytes**. The registration route added **91,628 / 35,100 bytes** of JS/CSS and the mobile welcome hero was **66,960 bytes**. One hundred cold web registrations therefore need about **65.5 MB for those assets alone**, before fonts and other artwork. The lazy CanvasKit module adds 3,239,451 gzip bytes per cold load and the web Agora SDK 440,807 bytes. The website host serves these assets. The iPhone app bundles its web assets in the downloaded binary. Redistributing a build or clearing a browser cache changes cold-load counts.

1. **Measure portrait bytes first.** Reducing the 20,000 modeled card downloads from 220 kB to a purpose-sized 60 kB rendition would save **3.2 GB/month**. Generate permitted thumbnail variants using the same blur and authorization policy. Keep clear and one-time media out of persistent public caches.
2. **Separate idle refresh work from human activity.** Collect RPC counts, compressed response sizes and p95 duration by route. Check the visible-state polling fallback against reconnect and missed-event behavior before reducing it. Measure account-state payloads for completed accounts with active conversations.
3. **Check the retention curve.** At day 7 and day 30 compare bucket bytes by purpose, pending cleanup, sizes of tables/indexes and actual transfer meters. Count users, sessions, cache misses, voice duration and participant-minutes. Record aggregate model input/output tokens and latency per operation, without copying transcripts or chats into analytics.

Implementation references include [portrait loading](../src/photos/PortraitPhoto.tsx), [chat media encoding](../src/community/ChatMedia.tsx), [protected media delivery](../supabase/functions/member-chat-media/index.ts), [voice transport](../src/voice/transport.ts), [Luna interview requests](../api/_lib/interview.mjs), and [grounding checks](../api/_lib/interview-grounding.mjs).
