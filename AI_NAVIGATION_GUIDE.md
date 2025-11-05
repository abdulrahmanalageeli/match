# BlindMatch AI Navigation Guide

> **Purpose**: Quick reference for AI assistants to navigate, understand, and modify the BlindMatch codebase efficiently.

---

## 🗂️ PROJECT STRUCTURE

```
match/
├── api/                          # Serverless API endpoints (Vercel)
│   ├── admin/
│   │   ├── index.mjs            # Admin operations (2,793 lines)
│   │   └── trigger-match.mjs    # Matching algorithm (152,366 bytes)
│   ├── participant.mjs          # Participant operations (1,618 lines)
│   ├── db-check.mjs             # Database health checks
│   ├── generate-summary.mjs     # Match summaries
│   ├── get-my-matches.mjs       # Participant match retrieval
│   └── init-event-state.mjs     # Event initialization
│
├── app/                         # React Router frontend
│   ├── routes/
│   │   ├── welcome.tsx          # Main participant flow (510,967 bytes) ⚠️ HUGE
│   │   ├── admin.tsx            # Admin dashboard (204,244 bytes)
│   │   ├── results.tsx          # Match results page (37,946 bytes)
│   │   ├── groups.tsx           # Group activities (92,189 bytes)
│   │   └── matrix.tsx           # Compatibility matrix (17,067 bytes)
│   ├── components/              # Reusable UI components
│   │   ├── SurveyComponent.tsx  # Survey form (69,179 bytes)
│   │   ├── ParticipantResultsModal.tsx (72,564 bytes)
│   │   ├── WhatsappMessageModal.tsx (38,319 bytes)
│   │   ├── PromptTopicsModal.tsx (50,037 bytes)
│   │   └── ui/                  # Shadcn/Radix UI components
│   └── lib/
│       ├── api.ts               # API client functions
│       ├── types.ts             # TypeScript interfaces
│       └── supabase.ts          # Supabase client
│
├── database/                    # SQL schema definitions
│   ├── participants_schema.sql  # Participant table (10,490 bytes)
│   ├── match_result_schema.sql  # Match results (9,516 bytes)
│   ├── match_feedback_schema.sql
│   ├── excluded_pairs_schema.sql
│   ├── excluded_participants_table.sql
│   ├── event_state_schema.sql
│   ├── compatibility_cache.sql
│   └── admin_results_schema.sql
│
└── sql/                         # Migration scripts
```

---

## 🔌 API ENDPOINTS

### `/api/participant` (Unified Participant Endpoint)

**Actions:**
- `create-token` - Create new participant and token
- `resolve-token` - Get participant data from token
- `save-participant` - Save survey data
- `match-preference` - Record mutual match preferences
- `get-match-results` - Get all matches for participant
- `check-feedback-submitted` - Check if feedback exists
- `check-phone-duplicate` - Validate phone uniqueness
- `phone-lookup-data` - Get participant data by phone
- `phone-lookup-signup` - Sign up returning participant
- `check-next-event-signup` - Check signup status
- `auto-signup-next-event` - Auto-register for next event
- `disable-auto-signup` - Disable auto-signup
- `unregister-next-event` - Remove from next event
- `generate-vibe-analysis` - AI analysis of compatibility
- `enable-auto-signup` - Enable auto-signup feature

### `/api/admin` (Admin Operations)

**GET**: Fetch all participants
**POST Actions:**
- `participants` - Get participants (with optional event_id filter)
- `delete` - Remove participant
- `set-phase` - Change event phase
- `set-table` - Auto-assign table numbers
- `update-table` - Update single table number
- `toggle-auto-signup` - Toggle participant auto-signup
- `event-phase` - Get current phase
- `set-announcement` - Broadcast message
- `clear-announcement` - Remove announcement
- `set-emergency-pause` - Pause/resume event
- `set-total-rounds` - Configure round count
- `get-event-state` - Get full event state
- `get-participant-stats` - Statistics dashboard
- `get-waiting-count` - Count waiting participants
- `start-global-timer` - Start round timer
- `end-global-timer` - Stop round timer
- `set-results-visibility` - Show/hide results
- `get-results-visibility` - Check visibility status
- `get-max-event-id` - Get highest event ID
- `set-current-event-id` - Set active event
- `get-current-event-id` - Get active event
- `get-all-match-history` - Fetch all matches
- `set-registration-enabled` - Enable/disable registration
- `get-registration-enabled` - Check registration status
- `set-event-finished` - Mark event as finished
- `get-event-finished` - Check event finished status
- `cleanup-incomplete-profiles` - Remove incomplete data
- `get-participant-results` - Get participant match results
- `get-excluded-pairs` - Fetch excluded pairs
- `add-excluded-pair` - Add pair exclusion
- `remove-excluded-pair` - Remove exclusion
- `clear-excluded-pairs` - Clear all exclusions
- `get-locked-matches` - Fetch locked matches
- `add-locked-match` - Lock a match
- `remove-locked-match` - Unlock match
- `clear-locked-matches` - Clear all locks
- `get-excluded-participants` - Get excluded participants
- `add-excluded-participant` - Exclude participant from all matches
- `remove-excluded-participant` - Remove participant exclusion
- `clear-excluded-participants` - Clear all participant exclusions
- `mark-messages-sent` - Mark WhatsApp messages as sent
- `get-group-assignments` - Fetch group matches
- `clean-slate` - Remove last admin result and current event matches

### `/api/admin/trigger-match` (Matching Algorithm)

**POST**:
- `manualMatch: { participant1, participant2, bypassEligibility }` - Create manual match
- Without manualMatch - Generate automatic matches
- Includes full compatibility calculations:
  - MBTI compatibility (0-10%)
  - Attachment style (0-15%)
  - Communication style (0-15%)
  - Lifestyle preferences (0-15%)
  - Core values (0-20%)
  - AI vibe analysis (0-25%)
  - Humor bonus (0-2%)

---

## 🗃️ DATABASE SCHEMA

### `participants` Table
**Key Fields:**
- `id` (UUID, PK), `assigned_number` (INT, unique)
- `secure_token` (TEXT, unique, auto-generated)
- `match_id` (UUID, always "00000000-0000-0000-0000-000000000000")
- `event_id` (INT, default 1) - Multi-event support
- `name`, `gender` (male/female), `age` (18-65), `phone_number`
- `survey_data` (JSONB) - All survey responses
- `mbti_personality_type` (VARCHAR(4)), `attachment_style`, `communication_style`
- `same_gender_preference` (BOOL), `any_gender_preference` (BOOL)
- `PAID` (BOOL), `PAID_DONE` (BOOL) - Payment tracking
- `signup_for_next_event` (BOOL), `auto_signup_next_event` (BOOL)
- `humor_banter_style` (CHAR(1)), `early_openness_comfort` (INT 1-5)
- `ai_personality_analysis` (TEXT) - Cached AI analysis

**Constraints:**
- Cannot have both same_gender AND any_gender preference
- Organizer always assigned_number = 9999
- Age must be 18-65
- MBTI must match valid patterns

### `match_results` Table
**Key Fields:**
- `id` (UUID, PK), `match_id` (UUID)
- `participant_a/b/c/d/e/f_number` (INT) - Supports up to 6-person groups
- `round` (SMALLINT), `table_number`, `group_number`
- `compatibility_score` (INT total)
- Individual scores (NUMERIC 5,2):
  - `mbti_compatibility_score`, `attachment_compatibility_score`
  - `communication_compatibility_score`, `lifestyle_compatibility_score`
  - `core_values_compatibility_score`, `vibe_compatibility_score`
- `mutual_match` (BOOL), `participant_a/b_wants_match` (BOOL)
- `event_id` (INT), `event_finished` (BOOL)
- `conversation_start_time`, `conversation_duration`, `conversation_status`
- `humor_early_openness_bonus` (TEXT: none/partial/full)

### `match_feedback` Table
- Stores 1-5 ratings for each round
- `participant_number`, `participant_token`, `round`, `event_id`
- Ratings: compatibility_rate, conversation_quality, personal_connection, etc.

### `excluded_pairs` Table
- Admin-defined pair exclusions
- `participant1_number`, `participant2_number`
- Bidirectional unique constraint

### `excluded_participants` Table
- Participants excluded from ALL matching
- `participant_number`, `match_id`, `reason`

### `event_state` Table
**Single Row Configuration:**
- `match_id` (PK, always "00000000-0000-0000-0000-000000000000")
- `phase` (TEXT: waiting/registration/round_1/round_2/etc.)
- `current_round` (INT), `total_rounds` (INT, default 4)
- `announcement` (TEXT), `announcement_type` (info/warning/error/success)
- `emergency_paused` (BOOL)
- `global_timer_active`, `global_timer_start_time`, `global_timer_duration`
- `results_visible`, `registration_enabled`
- `current_event_id` (INT)

### `compatibility_cache` Table
- Caches AI vibe analysis and compatibility scores
- Indexed by participant pairs and content hashes
- Reduces OpenAI API calls
- Includes humor_multiplier and humor_early_openness_bonus

### `group_matches` Table  
- Dedicated table for group matches (3-6 participants)
- `group_id`, `group_number`, `participant_numbers` (INT array)
- `participant_names` (TEXT array)
- Separate from individual match_results

---

## 🎯 KEY CONSTANTS

```javascript
// Used throughout the codebase
STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"
ORGANIZER_NUMBER = 9999
DEFAULT_EVENT_ID = 1
DEFAULT_TIMER_DURATION = 1800 // 30 minutes
```

---

## 🧭 NAVIGATION TIPS

### When Modifying Participant Flow (`welcome.tsx`)
⚠️ **WARNING**: This file is **510,967 bytes** - extremely large!
- Search for specific functions by name
- Main sections are organized by `step` state (0-6)
- Polling logic starts around line 675
- Survey component integration around line 2000+
- Token management in early sections

**Key State Variables:**
- `step` - Current UI step (-1: initial, 0: registration, 1: form, 2: waiting, 3+: rounds/results)
- `assignedNumber` - Participant number
- `secureToken` - Participant token
- `surveyData` - Form responses
- `phase` - Event phase from polling

### When Modifying Admin Panel (`admin.tsx`)
- Participant list rendering starts early
- Filtering logic uses `filteredParticipants` computed array
- Modal states for various operations
- Event state polling for real-time updates

### When Working with Matching Algorithm (`trigger-match.mjs`)
⚠️ **WARNING**: This file is **152,366 bytes**!
- Compatibility functions are separate and reusable
- `checkGenderCompatibility()` - Gender preference logic
- `checkAgeCompatibility()` - Age constraint logic
- `calculateMBTICompatibility()` - MBTI scoring
- `isParticipantComplete()` - Validation function
- `isParticipantExcluded()` - Exclusion checking
- Manual match creation uses `manualMatch` parameter

### When Adding New API Actions
1. **Participant APIs**: Add to `/api/participant.mjs`
2. **Admin APIs**: Add to `/api/admin/index.mjs`
3. Follow pattern: `if (action === "your-action") { ... }`
4. Always validate input parameters
5. Use proper error handling with try/catch
6. Return consistent JSON format: `{ success, data/error, message }`

---

## 🔑 COMMON PATTERNS

### API Call Pattern (Frontend)
```typescript
const response = await fetch('/api/participant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    action: 'action-name',
    // ... parameters
  })
})
const data = await response.json()
```

### Supabase Query Pattern
```javascript
const { data, error } = await supabase
  .from('table_name')
  .select('columns')
  .eq('match_id', STATIC_MATCH_ID)
  .eq('event_id', current_event_id)
```

### Token Storage
- **localStorage**: `blindmatch_result_token`, `blindmatch_returning_token`, `blindmatch_participant_name`, `blindmatch_participant_number`
- **sessionStorage**: `justCreatedToken`, `justCreatedTokenValue`

### Gender Preference Logic
```javascript
// Priority: any_gender > same_gender > opposite_gender (default)
if (anyGenderPrefA || anyGenderPrefB) return true
if (sameGenderPrefA && sameGenderPrefB) return genderA === genderB
return genderA !== genderB // opposite gender default
```

### Age Compatibility Logic
```javascript
if (anyGenderPrefA && anyGenderPrefB) return ageDiff <= 10
if (hasFemal) return ageDiff <= 6
return true // no constraint for male-only
```

---

## 🚨 CRITICAL THINGS TO KNOW

### 1. **Event ID System**
- Multi-event support via `event_id` column
- Always filter by `event_id` when querying participants/matches
- Current event ID stored in `event_state.current_event_id`

### 2. **Eligibility for Matching**
Participants must meet ALL criteria:
- Have complete `survey_data` (not null, not empty object)
- NOT in `excluded_participants` table
- For groups: must have `PAID_DONE = true`
- Not matched with organizer (#9999)

### 3. **Token Synchronization**
- `returningPlayerToken` and `resultToken` are SYNCHRONIZED
- Both localStorage keys contain same value
- Clearing one clears both

### 4. **Polling System**
- welcome.tsx polls every 1 second
- Fetches `/api/admin?action=get-event-state`
- Handles phase transitions automatically
- Skip polling when `step === -1` (initial screen)

### 5. **Manual Match Bypass**
- `bypassEligibility: true` fetches ALL participants
- Bypasses event signup, payment, survey, exclusion filters
- Still requires participants to exist in database

### 6. **Compatibility Score Breakdown**
- **Total**: 100%
- MBTI: 10%, Attachment: 15%, Communication: 15%
- Lifestyle: 15%, Core Values: 20%, Vibe (AI): 25%
- Humor Bonus: +0-2%

### 7. **Group Formation**
- Only participants with individual matches
- Must have gender balance (at least 1M + 1F)
- Avoids placing matched pairs together
- Requires `PAID_DONE = true`

### 8. **Phone Number Matching**
- Uses last 6 digits for flexible matching
- Normalizes all formats (removes +, spaces, etc.)
- Excludes current participant when checking duplicates

---

## 📝 COMMON MODIFICATIONS

### Add New Survey Question
1. Edit `app/components/SurveyComponent.tsx`
2. Add to `questions` array with proper validation
3. Update `participants.survey_data` JSONB extraction if needed

### Add New Compatibility Factor
1. Edit `api/admin/trigger-match.mjs`
2. Create `calculate[Factor]Compatibility()` function
3. Add score field to `match_results` table
4. Update total score calculation
5. Update `ParticipantDetailModal.tsx` to display new factor

### Add New Admin Action
1. Add action handler in `api/admin/index.mjs`
2. Add UI button/form in `app/routes/admin.tsx`
3. Create API call function
4. Update state management

### Change Event Phase Logic
1. Modify polling logic in `welcome.tsx` (around line 675)
2. Update phase transitions based on `eventState.phase`
3. Test with different phase values

---

## 🐛 DEBUGGING TIPS

### Check Logs
- **Frontend**: Browser console
- **Backend**: Vercel function logs or local terminal
- Look for emoji markers: ✅ ❌ 🚫 ⚠️ 🔍

### Common Issues
1. **Token not working**: Check `secure_token` is in DB and matches localStorage
2. **Matching fails**: Check participant has complete `survey_data`
3. **API 500 error**: Check Supabase env vars are set
4. **Polling not working**: Verify `step !== -1` condition
5. **Duplicate phone**: Check `check-phone-duplicate` excludes current user

### SQL Debug Queries
```sql
-- Check participant completeness
SELECT assigned_number, survey_data IS NOT NULL as has_data 
FROM participants WHERE match_id = '00000000-0000-0000-0000-000000000000';

-- Check event state
SELECT * FROM event_state WHERE match_id = '00000000-0000-0000-0000-000000000000';

-- Check matches for specific event
SELECT * FROM match_results WHERE event_id = 1 AND round > 0;
```

---

## 🎨 UI COMPONENT LIBRARY

- **Radix UI**: Dialog, Dropdown, Progress, Checkbox, etc.
- **Lucide React**: Icon system
- **Tailwind CSS**: Utility-first styling
- **Custom Components**: See `app/components/ui/`

---

## 🌐 DEPLOYMENT

- **Platform**: Vercel
- **Frontend**: React Router SSR
- **Backend**: Serverless functions in `/api/`
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4o-mini

**Environment Variables Required:**
- `SUPABASE_URL` / `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`

---

## 📚 ADDITIONAL RESOURCES

- **Memories**: Extensive implementation details in memory system
- **MD Files**: Various feature documentation in root directory
- **SQL Files**: Migration scripts in `/sql/` and `/database/`

---

**Last Updated**: 2025-11-06  
**Version**: Active Development
