# Page Visibility API Fix for Sync Issues

## Problem
Users reported that when they closed their screen or the browser went to sleep during rounds or other website functions, the website would no longer be in sync with the server. For example, if an admin ended a round, participants wouldn't know unless they manually refreshed the page.

## Root Cause
When users:
- Lock/unlock their screen
- Switch browser tabs away and back
- Turn off/on their mobile device screen
- Put their computer to sleep and wake it up

JavaScript's `setInterval` timers can be **throttled or completely paused** by the browser to save resources. This caused the polling system (which runs every 2 seconds) to stop updating, leaving the UI out of sync with the server state.

## Solution
Implemented the **Page Visibility API** to detect when users return to the page and force an immediate sync with the server.

### Technical Implementation

**File Modified:** `app/routes/welcome.tsx`

**Changes Made:**

1. **Restructured polling function** to be callable on-demand (not just via interval)
2. **Added Page Visibility API listener** that triggers when page becomes visible
3. **Force immediate sync** when user returns to the page

```typescript
// Page Visibility API: Force sync when user returns to the page
const handleVisibilityChange = () => {
  if (!document.hidden) {
    console.log("👁️ Page became visible - forcing immediate sync to catch up with server state")
    pollEventState() // Immediate sync when page becomes visible again
  }
}

document.addEventListener('visibilitychange', handleVisibilityChange)

// Cleanup on unmount
return () => {
  clearInterval(interval)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
}
```

### How It Works

1. **Normal Operation:** Polling continues every 2 seconds as before
2. **Screen Lock/Tab Switch:** Browser may throttle or pause the interval timer
3. **User Returns:** `visibilitychange` event fires when page becomes visible
4. **Immediate Sync:** `pollEventState()` is called immediately to catch up with server state
5. **UI Updates:** All state changes (phase transitions, timer updates, etc.) are applied instantly

### Benefits

✅ **Instant Sync:** Users see updated state immediately when returning to the page  
✅ **No Manual Refresh:** No need for users to refresh the page manually  
✅ **Works Everywhere:** Handles all scenarios (screen lock, tab switch, sleep mode)  
✅ **Minimal Overhead:** Only triggers when page becomes visible (not constantly)  
✅ **Backward Compatible:** Doesn't break existing polling behavior  

### Browser Support

The Page Visibility API is supported in all modern browsers:
- Chrome 13+
- Firefox 10+
- Safari 7+
- Edge (all versions)
- Mobile browsers (iOS Safari, Chrome Mobile, etc.)

### Testing Scenarios

To test the fix:

1. **Screen Lock Test:**
   - Join an event during a round
   - Lock your screen (Windows: Win+L, Mac: Cmd+Ctrl+Q)
   - Have admin end the round
   - Unlock screen → Should immediately show feedback form

2. **Tab Switch Test:**
   - Join an event during a round
   - Switch to another browser tab
   - Have admin end the round
   - Switch back → Should immediately show feedback form

3. **Mobile Sleep Test:**
   - Open app on mobile during a round
   - Turn off screen
   - Have admin end the round
   - Turn on screen → Should immediately show feedback form

### Console Logging

When the fix triggers, you'll see this log message:
```
👁️ Page became visible - forcing immediate sync to catch up with server state
```

This helps with debugging and confirms the feature is working.

## Impact

**Before Fix:**
- Users had to manually refresh to see updates after screen lock/sleep
- Confusion about event state
- Missed round transitions
- Poor user experience

**After Fix:**
- Automatic sync when returning to page
- Always up-to-date with server state
- Seamless user experience
- No manual intervention needed

## Related Code

The polling function handles:
- Phase transitions (registration → form → round → waiting)
- Timer synchronization (global timers, conversation timers)
- Event state updates (announcements, emergency pause)
- Match data updates
- Feedback/results display for finished events

All of these now sync immediately when users return to the page.
