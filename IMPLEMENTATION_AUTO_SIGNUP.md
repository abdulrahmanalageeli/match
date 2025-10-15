# Auto Signup for Next Events - Implementation Summary

## Overview
Added a comprehensive "always sign me up for next events" feature that allows participants to opt-in to automatic registration for all future events without needing to manually sign up each time.

## Database Changes

### New Column: `auto_signup_next_event`
- **Type**: `boolean NOT NULL DEFAULT false`
- **Purpose**: Stores participant preference for automatic signup to all future events
- **Location**: `participants` table
- **SQL File**: `sql/add_auto_signup_next_event.sql`

### Database Features
- **Default Value**: `false` (participants must opt-in)
- **NOT NULL Constraint**: Ensures data integrity
- **Index**: Optimized index for querying participants with auto-signup enabled
- **Comment**: Clear documentation of column purpose

## Frontend Changes (welcome.tsx)

### New State Variable
```typescript
const [autoSignupNextEvent, setAutoSignupNextEvent] = useState(false);
```

### UI Implementation - Checkbox Added to All 3 Popups

#### 1. Next Event Signup Popup (Token-based)
- **Location**: Lines 4346-4365
- **ID**: `auto-signup-next-popup`
- **Styling**: Cyan-themed box with sparkle emoji
- **Text**: "✨ سجلني تلقائياً في جميع الأحداث القادمة"
- **Description**: "لن تحتاج للتسجيل يدوياً في كل حدث - سيتم تسجيلك تلقائياً"

#### 2. Returning Participant Signup Popup (Phone-based)
- **Location**: Lines 4559-4578
- **ID**: `auto-signup-returning-popup`
- **Same styling and text as above**

#### 3. Dialog-based Next Event Popup
- **Location**: Lines 8519-8538
- **ID**: `auto-signup-dialog-popup`
- **Same styling and text as above**

### State Management
- **Checkbox State**: Synced across all three popups using single `autoSignupNextEvent` state
- **Reset Logic**: Checkbox is reset to `false` when popups are closed or cancelled
- **API Integration**: Checkbox value sent to backend in both signup actions

## Backend Changes (api/participant.mjs)

### Updated Actions

#### 1. `phone-lookup-signup` Action
**Changes:**
- Added `auto_signup_next_event` parameter extraction (line 980)
- Added to `updateData` object (line 1055)
- Added logging for auto-signup preference (line 1058)

**Update Logic:**
```javascript
const updateData = {
  signup_for_next_event: true,
  next_event_signup_timestamp: new Date().toISOString(),
  auto_signup_next_event: auto_signup_next_event === true ? true : false
}
```

#### 2. `auto-signup-next-event` Action
**Changes:**
- Added `auto_signup_next_event` parameter extraction (line 1157)
- Added to `updateData` object (line 1190)
- Added logging for auto-signup preference (line 1193)

**Same update logic as above**

### Logging
Both actions now log:
```
✨ Auto signup for all future events: YES/NO
```

## User Experience Flow

### For New Returning Participants (Phone Lookup)
1. User enters phone number in "سجلت من قبل؟" popup
2. System finds their previous participant record
3. Popup shows with gender preferences and interaction style questions
4. **NEW**: Checkbox appears: "✨ سجلني تلقائياً في جميع الأحداث القادمة"
5. User can check the box to enable auto-signup
6. On submit, `auto_signup_next_event` is saved to database

### For Existing Participants (Token-based)
1. User with saved token sees next event signup popup
2. Popup shows with preference options
3. **NEW**: Checkbox appears for auto-signup
4. User can enable auto-signup for all future events
5. Preference is saved when they confirm signup

## Technical Details

### Checkbox Styling
- **Theme**: Cyan color scheme to distinguish from other options
- **Icon**: ✨ Sparkle emoji for visual appeal
- **Layout**: Flex layout with checkbox and label
- **Responsive**: Works on all screen sizes
- **Dark Mode**: Proper theming for both light and dark modes

### Data Flow
```
Frontend (welcome.tsx)
  ↓ autoSignupNextEvent state
  ↓ User checks/unchecks checkbox
  ↓ Submit button clicked
  ↓ API call with auto_signup_next_event parameter
  ↓
Backend (participant.mjs)
  ↓ Extract auto_signup_next_event from request
  ↓ Add to updateData object
  ↓ Update participants table
  ↓ Log preference
  ↓ Return success response
```

### Database Update
```sql
UPDATE participants 
SET 
  signup_for_next_event = true,
  next_event_signup_timestamp = NOW(),
  auto_signup_next_event = <checkbox_value>,
  -- plus gender preferences and interaction styles
WHERE id = <participant_id>
```

## Future Usage

### Admin Workflow
When creating a new event, admins can:
1. Query participants where `auto_signup_next_event = true`
2. Automatically include them in the new event
3. No manual signup required from participants

### Query Example
```sql
SELECT * FROM participants 
WHERE auto_signup_next_event = true 
AND event_id = <previous_event_id>
```

## Benefits

1. **User Convenience**: Participants don't need to manually sign up for each event
2. **Improved Retention**: Easier for regular participants to stay engaged
3. **Admin Efficiency**: Bulk signup of returning participants
4. **Clear Opt-in**: Users explicitly choose to enable auto-signup
5. **Flexible**: Users can enable/disable at any signup opportunity

## Files Modified

1. **SQL**: `sql/add_auto_signup_next_event.sql` (NEW)
2. **Frontend**: `app/routes/welcome.tsx`
   - Added state variable (line 348)
   - Added checkbox to 3 popups (lines 4346-4365, 4559-4578, 8519-8538)
   - Updated API calls to include parameter (lines 1984, 2153)
   - Updated reset logic in close handlers
3. **Backend**: `api/participant.mjs`
   - Updated `phone-lookup-signup` action (lines 980, 1055, 1058)
   - Updated `auto-signup-next-event` action (lines 1157, 1190, 1193)

## Testing Checklist

- [ ] SQL migration runs successfully
- [ ] Checkbox appears in all 3 next event signup popups
- [ ] Checkbox state persists during popup interaction
- [ ] Checkbox resets when popup is closed/cancelled
- [ ] API receives correct `auto_signup_next_event` value
- [ ] Database column is updated correctly
- [ ] Logging shows correct auto-signup preference
- [ ] Works in both light and dark modes
- [ ] Responsive on mobile devices
- [ ] Arabic text displays correctly (RTL)

## Arabic Text Used

- **Checkbox Label**: "✨ سجلني تلقائياً في جميع الأحداث القادمة"
  - Translation: "✨ Sign me up automatically for all future events"
- **Description**: "لن تحتاج للتسجيل يدوياً في كل حدث - سيتم تسجيلك تلقائياً"
  - Translation: "You won't need to register manually for each event - you'll be registered automatically"

## Implementation Complete ✅

All changes have been implemented and are ready for testing and deployment.
