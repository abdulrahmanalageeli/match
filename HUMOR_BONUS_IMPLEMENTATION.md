# Humor and Early Openness Bonus Tracking Implementation

## Overview
Added `humor_early_openness_bonus` column to `match_results` table to track whether humor and early openness bonuses were applied to compatibility scores.

## Database Schema

### New Column
```sql
ALTER TABLE public.match_results 
ADD COLUMN IF NOT EXISTS humor_early_openness_bonus TEXT NULL;
```

### Valid Values
- `"full"` - Both humor (1.15x) AND early openness (1.05x) bonuses applied (multiplier = 1.15)
- `"partial"` - Only one bonus applied: either humor OR early openness (multiplier = 1.05)
- `"none"` - No bonus applied (multiplier = 1.0)

### Constraint
```sql
ALTER TABLE public.match_results
ADD CONSTRAINT check_humor_early_openness_bonus_valid 
CHECK (
  humor_early_openness_bonus IS NULL 
  OR humor_early_openness_bonus IN ('full', 'partial', 'none')
);
```

### Index
```sql
CREATE INDEX IF NOT EXISTS idx_match_results_humor_early_openness_bonus 
ON public.match_results USING btree (humor_early_openness_bonus) 
TABLESPACE pg_default
WHERE humor_early_openness_bonus IS NOT NULL;
```

## Matching Algorithm Integration

### Location
`api/admin/trigger-match.mjs`

### Implementation Points

#### 1. Compatibility Score Calculation (Line ~2578-2603)
When calculating compatibility for all pairs:
```javascript
// Determine bonus type based on humor multiplier
let bonusType = 'none'
if (humorMultiplier === 1.15) {
  bonusType = 'full' // Both humor and early openness match
} else if (humorMultiplier === 1.05) {
  bonusType = 'partial' // Only one matches (humor OR openness)
}

compatibilityScores.push({
  // ... other scores
  humorMultiplier: humorMultiplier,
  bonusType: bonusType,
  // ... rest of data
})
```

#### 2. Locked Matches (Line ~2710-2763)
For locked matches that are processed first:
```javascript
roundMatches.push({
  // ... match data
  humor_early_openness_bonus: compatibilityData?.bonusType || 'none'
})
```

#### 3. Regular Matches (Line ~2766-2821)
For compatibility-based matches:
```javascript
roundMatches.push({
  // ... match data
  humor_early_openness_bonus: pair.bonusType
})
```

#### 4. Manual Matches (Line ~2293-2313)
For admin-created manual matches:
```javascript
// Determine bonus type for manual match
let manualBonusType = 'none'
if (humorMultiplier === 1.15) {
  manualBonusType = 'full'
} else if (humorMultiplier === 1.05) {
  manualBonusType = 'partial'
}

const matchRecord = {
  // ... match data
  humor_early_openness_bonus: manualBonusType,
  // ... rest of data
}
```

## Bonus Logic Reference

### From `checkHumorMatch()` Function (Line 737-780)

**Full Bonus (1.15x):**
- Both humor styles match AND both openness levels match
- Example: Both participants have humor style "A" AND openness level "2"

**Partial Bonus (1.05x):**
- Either humor styles match OR openness levels match (but not both)
- Example: Humor matches but openness differs, or vice versa

**No Bonus (1.0x):**
- Neither humor nor openness match

## Benefits

1. **Transparency**: Admins can see which matches received bonuses
2. **Analytics**: Track how often bonuses are applied across events
3. **Debugging**: Understand why certain matches have higher scores
4. **Reporting**: Generate statistics on bonus application rates
5. **Audit Trail**: Historical record of bonus application

## Usage Examples

### Query matches with full bonus
```sql
SELECT participant_a_number, participant_b_number, compatibility_score
FROM match_results
WHERE humor_early_openness_bonus = 'full'
ORDER BY compatibility_score DESC;
```

### Count bonus distribution
```sql
SELECT 
  humor_early_openness_bonus,
  COUNT(*) as count,
  AVG(compatibility_score) as avg_score
FROM match_results
WHERE event_id = 2
GROUP BY humor_early_openness_bonus;
```

### Find matches with partial bonus
```sql
SELECT 
  participant_a_number, 
  participant_b_number,
  compatibility_score,
  mbti_compatibility_score,
  vibe_compatibility_score
FROM match_results
WHERE humor_early_openness_bonus = 'partial'
  AND round = 1;
```

## Migration Steps

1. **Run SQL migration**: Execute `sql/add_humor_early_openness_bonus_column.sql`
2. **Deploy updated API**: Deploy `api/admin/trigger-match.mjs` with new logic
3. **Verify**: Generate new matches and check column is populated
4. **Backfill (optional)**: For existing matches, could calculate retroactively if needed

## Notes

- Column is nullable to support existing records
- New matches will always have a value ('full', 'partial', or 'none')
- Organizer matches (#9999) will have 'none' as they don't use compatibility calculations
- The column tracks the RESULT of bonus application, not the individual humor/openness values
