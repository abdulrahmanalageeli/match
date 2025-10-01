# Fix: Event Finished Status Defaulting to True

## Problem
Event ID 2 in admin panel kept showing as "finished" despite being ongoing. New events would immediately appear as finished even though they should default to ongoing.

## Root Cause
The boolean logic for checking `event_finished` status was inverted in multiple places:

**Wrong Logic:**
```javascript
const finished = data?.event_finished !== false
```

This means:
- `null` → `true` (finished) ❌
- `undefined` → `true` (finished) ❌
- `true` → `true` (finished) ✅
- `false` → `false` (ongoing) ✅

So when a new event is created with no match_results records, or when the `event_finished` column is `null`, it would default to **finished = true** instead of **ongoing = false**.

## Correct Logic
Events should default to **ongoing (false)** unless explicitly marked as finished:

**Correct Logic:**
```javascript
const finished = data?.event_finished === true
```

This means:
- `null` → `false` (ongoing) ✅
- `undefined` → `false` (ongoing) ✅
- `true` → `true` (finished) ✅
- `false` → `false` (ongoing) ✅

## Changes Made

### 1. API Endpoint (`api/admin/index.mjs`)

**Fixed `get-event-finished` action:**
```javascript
// Before (WRONG)
const finished = data?.event_finished !== false // Default to false if null/undefined
console.log(`Event ${event_id} finished status retrieved: ${finished}`)

// After (CORRECT)
const finished = data?.event_finished === true // Default to false (ongoing) if null/undefined
console.log(`Event ${event_id} finished status retrieved: ${finished} (raw value: ${data?.event_finished})`)
```

**Benefits:**
- Added raw value logging for debugging
- Correct default behavior (ongoing unless explicitly finished)

### 2. Admin Panel (`app/routes/admin.tsx`)

**Fixed initial load (line 203):**
```javascript
// Before (WRONG)
setEventFinished(eventFinishedData.finished !== false) // Default to false if not set

// After (CORRECT)
setEventFinished(eventFinishedData.finished === true) // Default to false (ongoing) if not set
```

**Fixed event ID change (line 338):**
```javascript
// Before (WRONG)
setEventFinished(eventFinishedData.finished !== false)

// After (CORRECT)
setEventFinished(eventFinishedData.finished === true) // Default to false (ongoing) for new events
```

## Impact

### Before Fix:
1. Create new event (event_id 2)
2. No match_results records exist yet → `event_finished` is `null`
3. API returns `finished = true` (because `null !== false` is `true`)
4. Admin panel shows event as "finished" ❌
5. Participants can't see results properly

### After Fix:
1. Create new event (event_id 2)
2. No match_results records exist yet → `event_finished` is `null`
3. API returns `finished = false` (because `null === true` is `false`)
4. Admin panel shows event as "ongoing" ✅
5. Event behaves correctly as ongoing

## Event Lifecycle

### Correct Flow:
1. **Create Event**: `event_finished = null` → Shows as **ongoing** ✅
2. **Generate Matches**: `event_finished = null` (unchanged) → Still **ongoing** ✅
3. **Admin Marks Finished**: `event_finished = true` → Shows as **finished** ✅
4. **Participants See Results**: Event is finished, results modal appears ✅

### Event Finished Toggle:
- **Ongoing → Finished**: Sets `event_finished = true` for all match_results with that event_id
- **Finished → Ongoing**: Sets `event_finished = false` for all match_results with that event_id

## Database Behavior

The `event_finished` column in `match_results` table:
- **Type**: Boolean
- **Default**: `null` (when records are first created)
- **Values**: `null`, `false`, or `true`

**Interpretation:**
- `null` or `false` → Event is **ongoing**
- `true` → Event is **finished**

## Testing Checklist

- [ ] Create new event → Should show as "ongoing" (not finished)
- [ ] Generate matches for new event → Should remain "ongoing"
- [ ] Toggle event to "finished" → Should show as "finished"
- [ ] Toggle back to "ongoing" → Should show as "ongoing"
- [ ] Refresh admin panel → Status should persist correctly
- [ ] Participants should see results only when event is marked finished

## Files Modified

1. `api/admin/index.mjs` - Fixed `get-event-finished` action logic
2. `app/routes/admin.tsx` - Fixed event finished state initialization (2 locations)

## Related Features

This fix affects:
- Admin event status toggle
- Participant results visibility
- Event lifecycle management
- Multi-event support

IMPACT: Events now correctly default to "ongoing" status instead of "finished", preventing confusion and ensuring proper event lifecycle management.
