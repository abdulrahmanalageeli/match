# Delta Caching System - Usage Guide

## Overview

The Delta Caching system provides **smart incremental caching** that only recalculates compatibility for participants who have updated their survey data, dramatically reducing API costs and processing time.

## 🎯 Key Features

- ✅ **Tracks Last Cache Timestamp** per event
- ✅ **Identifies Updated Participants** automatically
- ✅ **Caches Only Changed Pairs** (not everything)
- ✅ **Records Cache Sessions** with metrics
- ✅ **Cache Freshness Monitoring** 
- ✅ **Separate from Original Pre-Cache** (doesn't break existing functionality)

---

## 📋 Database Setup

### 1. Run the SQL Migration

Execute `database/delta_cache_metadata.sql` in your Supabase SQL editor:

```sql
-- This creates:
-- • cache_metadata table
-- • Helper functions (get_last_precache_timestamp, record_cache_session)
-- • View v_cache_freshness
-- • Indexes on participants.survey_data_updated_at
-- • Additional columns in compatibility_cache table
```

### 2. Verify Schema

Check that these exist:
- ✅ `cache_metadata` table
- ✅ `v_cache_freshness` view
- ✅ `get_last_precache_timestamp()` function
- ✅ `record_cache_session()` function
- ✅ `compatibility_cache.participant_a_cached_at` column
- ✅ `compatibility_cache.participant_b_cached_at` column

---

## 🔌 API Endpoints

### 1. Delta Pre-Cache (Smart Caching)

**Endpoint:** `/api/admin/trigger-match`

**Action:** `delta-pre-cache`

**Request:**
```javascript
POST /api/admin/trigger-match
{
  "action": "delta-pre-cache",
  "eventId": 1,
  "skipAI": false  // Optional, default false
}
```

**Response:**
```javascript
{
  "success": true,
  "cached_count": 45,
  "already_cached": 12,
  "skipped": 3,
  "participants_needing_cache": 5,
  "total_eligible": 50,
  "pairs_checked": 245,
  "ai_calls_made": 45,
  "last_cache_timestamp": "2025-11-12T00:30:00Z",
  "duration_seconds": "8.45",
  "message": "Delta cached 45 pairs for 5 updated participants"
}
```

**How It Works:**
1. Gets last cache timestamp for the event
2. Finds participants updated after that timestamp
3. Caches only pairs involving updated participants
4. Records session metadata for future delta runs

---

### 2. Get Cache Freshness Status

**Endpoint:** `/api/admin`

**Action:** `get-cache-freshness`

**Request:**
```javascript
POST /api/admin
{
  "action": "get-cache-freshness",
  "event_id": 1
}
```

**Response:**
```javascript
{
  "success": true,
  "event_id": 1,
  "last_precache_timestamp": "2025-11-12T01:00:00Z",
  "total_participants_cached": 50,
  "total_pairs_cached": 1225,
  "total_participants_in_event": 52,
  "participants_needing_recache": 3,
  "cache_status": "STALE - 3 participants updated",
  "last_cache_time": "2025-11-12T01:00:00Z",
  "hours_since_cache": 2.5
}
```

---

### 3. Get Participants Needing Cache

**Endpoint:** `/api/admin`

**Action:** `get-participants-needing-cache`

**Request:**
```javascript
POST /api/admin
{
  "action": "get-participants-needing-cache",
  "event_id": 1,
  "last_cache_timestamp": "2025-11-12T00:00:00Z"  // Optional
}
```

**Response:**
```javascript
{
  "success": true,
  "event_id": 1,
  "last_cache_timestamp": "2025-11-12T00:00:00Z",
  "participants": [
    {
      "assigned_number": 1001,
      "survey_data_updated_at": "2025-11-12T02:30:00Z",
      "name": "Ahmed",
      "gender": "male",
      "age": 28
    },
    {
      "assigned_number": 1005,
      "survey_data_updated_at": "2025-11-12T01:45:00Z",
      "name": "Sara",
      "gender": "female",
      "age": 25
    }
  ],
  "count": 2
}
```

---

### 4. Get Cache History

**Endpoint:** `/api/admin`

**Action:** `get-cache-history`

**Request:**
```javascript
POST /api/admin
{
  "action": "get-cache-history",
  "event_id": 1,
  "limit": 10  // Optional, default 10
}
```

**Response:**
```javascript
{
  "success": true,
  "event_id": 1,
  "sessions": [
    {
      "id": "uuid...",
      "event_id": 1,
      "last_precache_timestamp": "2025-11-12T02:00:00Z",
      "total_participants_cached": 5,
      "total_pairs_cached": 45,
      "cache_session_duration_ms": 8450,
      "ai_calls_made": 45,
      "cache_hit_rate": 21.5,
      "created_at": "2025-11-12T02:00:00Z",
      "notes": "Delta cache: 5 participants updated since 2025-11-12T00:00:00Z"
    }
  ],
  "count": 1
}
```

---

### 5. Get Last Cache Timestamp

**Endpoint:** `/api/admin`

**Action:** `get-last-cache-timestamp`

**Request:**
```javascript
POST /api/admin
{
  "action": "get-last-cache-timestamp",
  "event_id": 1
}
```

**Response:**
```javascript
{
  "success": true,
  "event_id": 1,
  "last_cache_timestamp": "2025-11-12T01:00:00Z"
}
```

---

### 6. Invalidate Stale Cache

**Endpoint:** `/api/admin`

**Action:** `invalidate-stale-cache`

**Request:**
```javascript
POST /api/admin
{
  "action": "invalidate-stale-cache",
  "participant_number": 1001
}
```

**Response:**
```javascript
{
  "success": true,
  "participant_number": 1001,
  "invalidated_entries": 49
}
```

---

## 🔄 Workflow Examples

### Initial Cache (First Time)

```javascript
// Step 1: Run delta-pre-cache for the first time
// This will cache ALL participants since no timestamp exists
POST /api/admin/trigger-match
{
  "action": "delta-pre-cache",
  "eventId": 1
}

// Response: All 1225 pairs cached (50 participants)
```

### Subsequent Updates (Delta Mode)

```javascript
// Participant #1001 updates their survey
// survey_data_updated_at is automatically set by database trigger

// Step 2: Run delta-pre-cache again
POST /api/admin/trigger-match
{
  "action": "delta-pre-cache",
  "eventId": 1
}

// Response: Only 49 pairs cached (participant #1001 × all others)
// Saves ~96% of processing time and AI costs!
```

### Check Before Caching

```javascript
// Step 1: Check cache status
POST /api/admin
{
  "action": "get-cache-freshness",
  "event_id": 1
}

// Response shows: "STALE - 3 participants updated"

// Step 2: Run delta cache
POST /api/admin/trigger-match
{
  "action": "delta-pre-cache",
  "eventId": 1
}

// Only caches pairs for those 3 updated participants
```

---

## 💡 Comparison: Original vs Delta

### Original Pre-Cache
```javascript
POST /api/admin/trigger-match
{
  "action": "pre-cache",
  "eventId": 1,
  "count": 50,
  "cacheAll": true
}
```
- ✅ Caches specified count of pairs
- ✅ No tracking of what changed
- ✅ Always recaches from scratch
- ❌ Wastes API calls on unchanged participants
- ❌ No session history

### Delta Pre-Cache
```javascript
POST /api/admin/trigger-match
{
  "action": "delta-pre-cache",
  "eventId": 1
}
```
- ✅ **Smart**: Only caches changed participants
- ✅ **Efficient**: Tracks last cache timestamp
- ✅ **Metrics**: Records session history
- ✅ **Fast**: Skips already-cached pairs
- ✅ **Cost-Effective**: Minimizes AI API calls

---

## 📊 Efficiency Gains

### Example Scenario

**Event with 50 participants:**
- Total possible pairs: **1,225**
- 1 participant updates survey

**Original Pre-Cache:**
- Pairs checked: 1,225
- AI calls: 1,225 (if all new)
- Time: ~20 minutes
- Cost: $12.25 (at $0.01/call)

**Delta Pre-Cache:**
- Pairs checked: 49 (only pairs involving updated participant)
- AI calls: 49
- Time: ~1 minute
- Cost: $0.49
- **Savings: 96% time, 96% cost!**

---

## 🔧 Database Queries for Monitoring

### Check Cache Status
```sql
SELECT * FROM v_cache_freshness WHERE event_id = 1;
```

### Find Participants Needing Cache
```sql
SELECT * FROM get_participants_needing_cache(1);
```

### View Cache History
```sql
SELECT * FROM cache_metadata 
WHERE event_id = 1 
ORDER BY last_precache_timestamp DESC 
LIMIT 10;
```

### Check Stale Cache Entries
```sql
SELECT 
  cc.*,
  pa.survey_data_updated_at as p_a_current_timestamp,
  pb.survey_data_updated_at as p_b_current_timestamp
FROM compatibility_cache cc
JOIN participants pa ON pa.assigned_number = cc.participant_a_number
JOIN participants pb ON pb.assigned_number = cc.participant_b_number
WHERE 
  cc.participant_a_cached_at < pa.survey_data_updated_at
  OR cc.participant_b_cached_at < pb.survey_data_updated_at;
```

---

## ⚠️ Important Notes

1. **survey_data_updated_at is automatic**: Database triggers update this timestamp whenever survey_data changes

2. **First run caches everything**: Delta mode detects no previous timestamp and caches all pairs

3. **Compatible with original pre-cache**: Both actions can coexist

4. **Session metadata is optional**: Cache works even if metadata recording fails

5. **Content-based hashing still applies**: Even in delta mode, content hash prevents duplicate caching

---

## 🚀 Best Practices

1. **Run delta-pre-cache after survey updates**
   - After participants edit surveys
   - Before generating matches
   - Daily maintenance schedule

2. **Monitor cache freshness**
   - Check `get-cache-freshness` before matching
   - Set up alerts for stale cache (>24 hours)

3. **Use original pre-cache for**
   - Full cache rebuild
   - Testing/development
   - Initial event setup

4. **Use delta-pre-cache for**
   - Production incremental updates
   - Cost optimization
   - Daily operations

---

## 🎯 Frontend Integration Example

```typescript
// Check if cache needs update
const freshnessResponse = await fetch('/api/admin', {
  method: 'POST',
  body: JSON.stringify({
    action: 'get-cache-freshness',
    event_id: currentEventId
  })
})

const { cache_status, participants_needing_recache } = await freshnessResponse.json()

if (cache_status !== 'FRESH') {
  // Show admin notification
  console.log(`⚠️ Cache stale: ${participants_needing_recache} participants need recaching`)
  
  // Run delta cache
  const cacheResponse = await fetch('/api/admin/trigger-match', {
    method: 'POST',
    body: JSON.stringify({
      action: 'delta-pre-cache',
      eventId: currentEventId
    })
  })
  
  const result = await cacheResponse.json()
  console.log(`✅ Cached ${result.cached_count} pairs in ${result.duration_seconds}s`)
}
```

---

## 📈 Monitoring Dashboard Ideas

Create an admin dashboard showing:
- Cache freshness status
- Participants needing recache
- Last cache session metrics
- Cache efficiency trends
- Cost savings visualization

---

**Implemented**: 2025-11-12  
**Version**: 1.0  
**Status**: Production Ready
