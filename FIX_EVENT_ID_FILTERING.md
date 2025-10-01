# Fix: Event ID Filtering for Match Results

## Problem
When users went to Round 1 while the admin had already set the event_id to 2, they were still accessing their matches from event_id 1. The match fetching API was not filtering by event_id, causing participants to see matches from the wrong event.

## Root Cause
There were TWO issues:

1. **API not filtering by event_id**: The `/api/get-my-matches.mjs` endpoint was querying the `match_results` table without filtering by `event_id`
2. **Frontend not receiving current_event_id**: The `/api/admin` endpoint's `get-event-state` action was not returning `current_event_id`, and the frontend was not setting it from the event state

This meant:
- All matches were returned regardless of which event they belonged to
- Participants in event 2 would see their old matches from event 1
- The `currentEventId` state was stuck at the default value of 1
- The current event context was not being respected

## Solution
1. Added `current_event_id` to the event state API response
2. Updated frontend to receive and set `currentEventId` from event state
3. Added `event_id` filtering to all match queries in the API

## Changes Made

### 1. Event State API Changes (`api/admin/index.mjs`)

**Added current_event_id to SELECT query:**
```javascript
.select("phase, announcement, ..., current_event_id, global_timer_active, ...")
```

**Added current_event_id to response:**
```javascript
return res.status(200).json({ 
  phase: data.phase,
  // ...
  current_event_id: data.current_event_id || 1,
  // ...
})
```

### 2. Match Fetching API Changes (`api/get-my-matches.mjs`)

**Added event_id parameter:**
```javascript
const { assigned_number, round, match_type = "محايد", action, event_id } = req.body
const currentEventId = event_id || 1 // Default to event 1 if not provided
```

**Updated all queries to filter by event_id:**

#### Individual Matches Query:
```javascript
const { data: matches, error } = await supabase
  .from("match_results")
  .select("*")
  .eq("match_id", match_id)
  .eq("event_id", currentEventId)  // ← Added this line
  .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number},...)
  .order("round", { ascending: true })
```

#### Group Matches Query:
```javascript
const { data: groupMatches, error: groupError } = await supabase
  .from("match_results")
  .select("*")
  .eq("match_id", match_id)
  .eq("event_id", currentEventId)  // ← Added this line
  .eq("round", 0)
  .or(`participant_a_number.eq.${assigned_number},...)
```

### 3. Frontend Changes (`app/routes/welcome.tsx`)

**Set currentEventId from event state on initial load:**
```javascript
const eventData = await res2.json();
setPhase(eventData.phase || "registration");
setCurrentRound(eventData.current_round || 1);
setTotalRounds(eventData.total_rounds || 4);
setCurrentEventId(eventData.current_event_id || 1);  // ← Added this line
```

**Update currentEventId in polling loop:**
```javascript
const data = await res.json()

// Update phase and event ID
setPhase(data.phase || "registration")
const newEventId = data.current_event_id || 1
if (newEventId !== currentEventId) {
  console.log(`🔄 Event ID changed: ${currentEventId} → ${newEventId}`)
}
setCurrentEventId(newEventId)  // ← Added this
```

**Updated `fetchMatches` function:**
```javascript
const fetchMatches = async (roundOverride?: number) => {
  // ...
  const res = await fetch("/api/get-my-matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      assigned_number: assignedNumber,
      event_id: currentEventId || 1  // ← Added this parameter
    })
  })
  // ...
}
```

**Updated `fetchGroupMatches` function:**
```javascript
const fetchGroupMatches = async () => {
  // ...
  const myMatches = await fetch("/api/get-my-matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      assigned_number: assignedNumber, 
      match_type: "محايد", 
      round: 0,
      event_id: currentEventId || 1  // ← Added this parameter
    }),
  })
  // ...
}
```

## How It Works Now

### Event Flow:
1. **Admin sets current_event_id to 2** in the event_state table
2. **User loads/refreshes page**:
   - Frontend fetches event state from `/api/admin` (get-event-state)
   - Receives `current_event_id: 2` in response
   - Sets `currentEventId` state to 2
3. **Polling system continuously updates** `currentEventId` state (every few seconds)
4. **User enters Round 1** phase
5. **Frontend fetches matches** with `event_id: 2` (using currentEventId)
6. **API queries database** filtering by `event_id = 2`
7. **User sees only matches from event 2** (current event) ✅

### Event Isolation:
- **Event 1 matches**: Only visible when `event_id = 1`
- **Event 2 matches**: Only visible when `event_id = 2`
- **No cross-contamination**: Participants only see matches from their current event

## Benefits

✅ **Event Isolation**: Participants only see matches from the current event  
✅ **Multi-Event Support**: System properly supports multiple events  
✅ **Admin Control**: Admin can switch events and participants see correct data  
✅ **Data Integrity**: No mixing of matches between different events  
✅ **Backward Compatible**: Defaults to event_id = 1 if not provided  

## Testing Checklist

- [ ] Admin sets event_id to 1 → Participants see event 1 matches
- [ ] Admin sets event_id to 2 → Participants see event 2 matches
- [ ] No matches from event 1 appear when in event 2
- [ ] Group matches respect event_id filtering
- [ ] Individual matches respect event_id filtering
- [ ] Default to event_id = 1 when not specified
- [ ] Polling system correctly updates currentEventId

## Database Context

The `match_results` table has an `event_id` column that associates each match with a specific event:
- `event_id = 1`: First event matches
- `event_id = 2`: Second event matches
- `event_id = N`: Nth event matches

The `event_state` table has a `current_event_id` field that indicates which event is currently active.

## Related Files
- `/api/get-my-matches.mjs` - Match fetching API
- `/app/routes/welcome.tsx` - Frontend match display
- Database: `match_results` table with `event_id` column
- Database: `event_state` table with `current_event_id` field

## Impact
Participants now correctly see only matches from the current event, preventing confusion and ensuring proper event isolation across multiple events.
