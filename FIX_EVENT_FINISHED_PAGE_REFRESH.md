# Fix: Event Finished Status on Page Refresh

## Problem
When refreshing the page on a match in event 2, it would automatically show the feedback modal and mark event 2 as finished, even though event 2 was still ongoing.

## Root Causes

### 1. Using Stale State Variable
**Location:** `app/routes/welcome.tsx` line 865

The code was using the state variable `currentEventId` which hadn't been updated yet (asynchronous state update):

```javascript
// WRONG - uses stale state
body: JSON.stringify({
  action: "check-feedback-submitted",
  secure_token: token,
  round: roundNumber,
  event_id: currentEventId  // This is still 1, not 2!
})
```

**Fix:** Use the fresh value from the API response:

```javascript
// CORRECT - uses fresh value
body: JSON.stringify({
  action: "check-feedback-submitted",
  secure_token: token,
  round: roundNumber,
  event_id: eventData.current_event_id || 1  // Fresh value from API
})
```

### 2. Missing Implicit Finished Logic in Participant API
**Location:** `api/participant.mjs` - `check-feedback-submitted` action

The participant API was only checking the `event_finished` flag in `match_results`, but wasn't considering the implicit finished logic (past events are automatically finished).

**Old Logic:**
```javascript
const { data: matchData } = await supabase
  .from("match_results")
  .select("event_finished")
  .eq("event_id", event_id)
  .single()

const eventFinished = matchData?.event_finished || false
```

**Problem:** This would return `false` for event 1 even when current event is 2.

**New Logic:**
```javascript
// Get current event ID
const currentEventId = eventStateData?.current_event_id || 1

// If requested event_id < current_event_id → automatically finished
if (event_id < currentEventId) {
  eventFinished = true
} else {
  // For current/future events, check event_finished flag
  eventFinished = matchData?.event_finished === true
}
```

## What Was Happening

### Scenario: Current Event = 2, User Refreshes Page

**Before Fix:**
1. Page loads, fetches event state → `current_event_id = 2`
2. State update is async, `currentEventId` state is still `1`
3. Check feedback API called with `event_id: 1` (stale state)
4. API checks event 1 → finds `event_finished = null` → returns `false`
5. But wait, the implicit logic says event 1 should be finished!
6. Confusion ensues, wrong feedback modal appears

**After Fix:**
1. Page loads, fetches event state → `current_event_id = 2`
2. Check feedback API called with `event_id: 2` (fresh value from API)
3. API checks event 2 → `2 >= 2` → checks `event_finished` flag
4. Event 2 is ongoing → returns `event_finished: false`
5. No feedback modal appears ✅

## Changes Made

### 1. Frontend (`app/routes/welcome.tsx`)

**Line 865 - Use fresh event ID:**
```javascript
// Before
event_id: currentEventId

// After
event_id: eventData.current_event_id || 1  // Use fresh value from API, not state
```

### 2. Participant API (`api/participant.mjs`)

**Added implicit finished logic to `check-feedback-submitted` action:**

```javascript
// Get current event ID
const currentEventId = eventStateData?.current_event_id || 1

// Implicit finished logic
if (event_id < currentEventId) {
  console.log(`Event ${event_id} is implicitly finished (current event is ${currentEventId})`)
  eventFinished = true
} else {
  // Check event_finished flag for current/future events
  eventFinished = matchData?.event_finished === true
}
```

## Impact

### Before Fix:
- ❌ Refreshing page in event 2 would check event 1 status
- ❌ Event 1 would appear as ongoing (wrong)
- ❌ Feedback modal would appear incorrectly
- ❌ Confusion about which event is finished

### After Fix:
- ✅ Refreshing page in event 2 checks event 2 status
- ✅ Event 1 is implicitly finished (1 < 2)
- ✅ Event 2 shows correct ongoing status
- ✅ Feedback modal only appears when event is actually finished
- ✅ Consistent behavior across all APIs

## Consistency Across APIs

Now all three APIs use the same implicit finished logic:

1. **Admin API** (`api/admin/index.mjs` - `get-event-finished`)
2. **Participant API** (`api/participant.mjs` - `check-feedback-submitted`)
3. **Frontend** (uses fresh values from API responses)

All follow the rule: **If event_id < current_event_id → automatically finished**

## Testing Checklist

- [ ] Refresh page while in event 1 (current event = 1) → Should show ongoing
- [ ] Refresh page while in event 2 (current event = 2) → Should show ongoing
- [ ] Refresh page for event 1 while current event = 2 → Should show finished
- [ ] Feedback modal only appears when event is explicitly marked finished
- [ ] No automatic feedback modal on page refresh for ongoing events

## Files Modified

1. `app/routes/welcome.tsx` - Use fresh event_id from API response
2. `api/participant.mjs` - Added implicit finished logic to check-feedback-submitted

IMPACT: Page refresh now correctly checks the current event's finished status instead of using stale state values, preventing incorrect feedback modals and event status confusion.
