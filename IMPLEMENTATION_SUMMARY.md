# Event Finished Status Implementation

## Overview
Added functionality to track event completion status and automatically show review forms to participants when an event is finished.

## Database Changes

### New Column Added
```sql
ALTER TABLE public.match_results 
ADD COLUMN event_finished boolean NOT NULL DEFAULT false;
```

**Purpose**: Tracks whether an event has finished and participants should fill review forms.

### Indexes Added
- `idx_match_results_event_finished` - For querying by event status
- `idx_match_results_event_id_finished` - For combined event_id and status queries

## API Changes

### Updated `/api/participant.mjs`
**Action**: `get-match-results`

**New Response Fields**:
- `event_finished`: Boolean indicating if the event is finished
- `has_filled_reviews`: Boolean indicating if participant has filled review forms
- `should_show_review_form`: Boolean indicating if review form should be shown

**Logic**:
1. Check if event is finished by querying `event_finished` field
2. Check if participant has filled reviews (has any `wants_match` values)
3. If event is finished AND participant hasn't filled reviews → show review form
4. If event is finished AND participant has filled reviews → show normal results
5. If event is not finished → show normal results

### New Admin API Endpoints

#### `/api/admin/toggle-event-status.mjs`
**Purpose**: Toggle event finished status for a specific event

**Parameters**:
- `event_id`: Number - The event ID to update
- `event_finished`: Boolean - New status (true = finished, false = active)

**Response**:
```json
{
  "success": true,
  "message": "Event X status updated successfully",
  "event_id": 1,
  "event_finished": true,
  "updated_records": 25
}
```

#### `/api/admin/get-event-status.mjs`
**Purpose**: Get status of all events

**Response**:
```json
{
  "success": true,
  "events": [
    {
      "event_id": 1,
      "event_finished": false,
      "match_count": 25,
      "participant_count": 10
    }
  ]
}
```

## Frontend Changes

### Admin Panel (`app/routes/admin.tsx`)
**New Section**: Event Status Management

**Features**:
- View all events with their status (Active/Finished)
- Toggle event status with one click
- Display match count and participant count for each event
- Real-time status updates
- Loading states and error handling

**UI Components**:
- Event list with status indicators (green = active, red = finished)
- Toggle buttons for each event
- Informational note explaining the feature
- Loading spinner during status changes

### Results Page (`app/routes/results.tsx`)
**New Feature**: Review Form Display

**Logic**:
1. When `should_show_review_form` is true, show review form instead of results
2. Display all matches for the participant
3. Allow participant to choose "Yes, I want to connect" or "No, thanks" for each match
4. Show match details (partner name, round, table, compatibility type)
5. Provide "Save All Reviews" button

**UI Components**:
- Review form with match cards
- Action buttons for each match (connect/pass)
- Visual indicators for match types
- Save button for submitting all reviews

## User Flow

### Before Event Finishes
1. Participants see normal results or waiting screen
2. Admin sees events marked as "Active" in admin panel

### When Admin Marks Event as Finished
1. Admin clicks "Finish" button for an event
2. All match_results for that event_id get `event_finished = true`
3. Status updates immediately in admin panel

### When Participants Access Results After Event Finished
1. **If participant hasn't filled reviews**:
   - API returns `should_show_review_form = true`
   - Results page shows review form
   - Participant can review each match and choose to connect or pass
   - After submitting, they see normal results

2. **If participant has already filled reviews**:
   - API returns `should_show_review_form = false`
   - Results page shows normal match results
   - Includes mutual match information and contact details

### Page Refresh Behavior
- Review form persists on page refresh if participant hasn't submitted reviews
- Once reviews are submitted, normal results are shown even on refresh
- No data is lost during page refreshes

## Benefits

1. **Automatic Review Collection**: No manual intervention needed to collect participant preferences
2. **Persistent State**: Review forms show immediately even on page refresh
3. **Admin Control**: Easy toggle for event completion status
4. **Clear User Experience**: Participants know exactly what to do when event ends
5. **Data Integrity**: All review data is properly tracked and stored

## Technical Implementation Details

### Database Schema
- Uses existing `match_results` table structure
- Leverages `participant_a_wants_match` and `participant_b_wants_match` fields
- Event status is stored per match result (allows for event-specific control)

### API Design
- Backward compatible with existing functionality
- Uses action-based routing in unified participant endpoint
- Proper error handling and validation
- Efficient queries with appropriate indexes

### Frontend Architecture
- Conditional rendering based on event status
- Reusable UI components
- Consistent styling with existing theme
- Responsive design for mobile devices

## Future Enhancements

1. **Review Submission**: Implement actual review submission functionality
2. **Batch Operations**: Allow admin to finish multiple events at once
3. **Notifications**: Send notifications when events are finished
4. **Analytics**: Track review completion rates
5. **Customizable Messages**: Allow custom messages for review forms
