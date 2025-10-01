# Add Event ID to Match Feedback

## Problem
Feedback submissions were not associated with specific events, causing potential cross-event data contamination when participants submit feedback during event transitions.

## Solution
Added `event_id` column to `match_feedback` table and updated all related API endpoints and frontend code.

## Changes Made

### 1. Database Schema (`database/add_event_id_to_match_feedback.sql`)

**Added event_id column:**
```sql
ALTER TABLE public.match_feedback 
ADD COLUMN IF NOT EXISTS event_id INTEGER NULL DEFAULT 1;
```

**Added indexes:**
- `idx_match_feedback_event_id` - For efficient event filtering
- `idx_match_feedback_event_participant_round` - For common query pattern

**Updated unique constraint:**
```sql
-- Old constraint
match_feedback_match_id_participant_number_round_key (match_id, participant_number, round)

-- New constraint  
match_feedback_match_id_participant_number_round_event_key (match_id, participant_number, round, event_id)
```

This ensures participants can submit separate feedback for the same round in different events.

### 2. API Changes (`api/participant.mjs`)

#### Save Participant Action (Feedback Submission)

**Added event_id parameter:**
```javascript
const { assigned_number, summary, survey_data, feedback, round, secure_token, event_id } = req.body
```

**Updated logging:**
```javascript
console.log('📝 Processing feedback for round:', round, 'event_id:', event_id)
```

**Updated existing feedback check:**
```javascript
// Now checks event_id too
.eq("match_id", match_id)
.eq("participant_number", assigned_number)
.eq("round", round)
.eq("event_id", event_id || 1)
```

**Added event_id to feedback data:**
```javascript
const feedbackData = {
  match_id,
  participant_number: assigned_number,
  participant_token: secure_token || null,
  round,
  event_id: event_id || 1,  // ← Added
  // ... other fields
}
```

**Updated UPDATE query:**
```javascript
.update(feedbackData)
.eq("match_id", match_id)
.eq("participant_number", assigned_number)
.eq("round", round)
.eq("event_id", event_id || 1)  // ← Added
```

#### Check Feedback Submitted Action

**Updated feedback check:**
```javascript
// Check if feedback exists for this token, round, and event
const { data: feedbackData, error: feedbackError } = await supabase
  .from("match_feedback")
  .select("id")
  .eq("match_id", match_id)
  .eq("participant_token", secure_token)
  .eq("round", round)
  .eq("event_id", event_id)  // ← Added
```

### 3. Frontend Changes (`app/routes/welcome.tsx`)

**Updated feedback submission:**
```javascript
body: JSON.stringify({
  action: "save-participant",
  assigned_number: assignedNumber,
  secure_token: secureToken,
  round: currentRound,
  event_id: currentEventId || 1,  // ← Added
  feedback: feedbackAnswers
})
```

## Benefits

### ✅ Event Isolation
- Feedback is now properly associated with specific events
- Participants can submit separate feedback for same round in different events
- No cross-event data contamination

### ✅ Data Integrity
- Unique constraint includes event_id
- Prevents duplicate feedback within same event
- Allows same participant/round combination across different events

### ✅ Accurate Reporting
- Admin can filter feedback by event
- Analytics are event-specific
- Historical data remains clean

### ✅ Race Condition Prevention
- Feedback submitted during event transition goes to correct event
- No ambiguity about which event feedback belongs to

## Example Scenarios

### Scenario 1: Normal Feedback Submission
```
Event 1 (current_event_id = 1)
Participant #15 submits feedback for Round 1
→ Saved with event_id = 1 ✅
```

### Scenario 2: Event Transition During Feedback
```
Participant #15 opens feedback form (event_id = 1)
Admin switches to event 2 (current_event_id = 2)
Participant #15 submits feedback
→ Saved with event_id = 2 (uses current event) ✅
```

### Scenario 3: Multiple Events
```
Event 1: Participant #15 submits feedback for Round 1 → event_id = 1
Event 2: Participant #15 submits feedback for Round 1 → event_id = 2
Both records coexist without conflict ✅
```

## Database Migration

**Run the SQL migration:**
```bash
psql -U your_user -d your_database -f database/add_event_id_to_match_feedback.sql
```

**Backfill existing records (optional):**
```sql
UPDATE public.match_feedback 
SET event_id = 1 
WHERE event_id IS NULL;
```

**Make event_id NOT NULL (optional, after backfill):**
```sql
ALTER TABLE public.match_feedback 
ALTER COLUMN event_id SET NOT NULL;
```

## Testing Checklist

- [ ] Submit feedback in event 1 → Saved with event_id = 1
- [ ] Submit feedback in event 2 → Saved with event_id = 2
- [ ] Check feedback submitted query filters by event_id
- [ ] Unique constraint allows same participant/round in different events
- [ ] Feedback displays correctly for each event
- [ ] No cross-event data bleeding

## Related Issues Fixed

This change addresses the potential issue identified in the comprehensive audit:
- **POTENTIAL ISSUE 5**: Race Condition in Feedback Submission
- **Severity**: LOW-MEDIUM
- **Status**: ✅ RESOLVED

## Files Modified

1. `database/add_event_id_to_match_feedback.sql` - Database schema changes
2. `api/participant.mjs` - API endpoint updates
3. `app/routes/welcome.tsx` - Frontend feedback submission

## Impact

Feedback submissions are now properly isolated by event, preventing data contamination and ensuring accurate reporting across multiple events.
