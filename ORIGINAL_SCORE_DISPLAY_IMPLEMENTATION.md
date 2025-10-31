# Original Score Display Implementation

## Overview
Updated the system to show original compatibility scores (before humor/early openness bonuses) in all user-facing displays while showing the bonused score with original score tooltip in admin views.

## Changes Made

### 1. ParticipantResultsModal.tsx (Admin View)
**Purpose**: Show bonused score with hover tooltip revealing original score

**Implementation**:
- Added hover tooltip to compatibility score badge
- Tooltip displays original score calculation
- Only shows for matches with bonuses ('full' or 'partial')
- Shows both original and bonused scores for transparency

**Tooltip Content**:
```
النتيجة الأصلية (قبل المكافأة):
[Original Score]%

النتيجة بعد المكافأة: [Bonused Score]%
```

**Calculation**:
```typescript
Math.round(participant.compatibility_score / (
  participant.humor_early_openness_bonus === 'full' ? 1.15 : 1.05
))
```

### 2. results.tsx (Participant Results Page)
**Purpose**: Show ONLY original score (without bonus) to participants

**Changes**:
- Added `humor_early_openness_bonus` field to `MatchResult` interface
- Created `getOriginalScore()` helper function
- Updated all score displays to use original score
- Updated progress bars to reflect original score

**Helper Function**:
```typescript
const getOriginalScore = (match: MatchResult): number => {
  if (!match.humor_early_openness_bonus || match.humor_early_openness_bonus === 'none') {
    return match.score
  }
  const multiplier = match.humor_early_openness_bonus === 'full' ? 1.15 : 1.05
  return Math.round(match.score / multiplier)
}
```

**Updated Displays**:
- Match card score badges
- Detailed compatibility score display
- Progress bar width
- Color coding based on original score

### 3. welcome.tsx (Round Feedback Page)
**Purpose**: Show ONLY original score during feedback submission

**Changes**:
- Added `humorBonus` state variable
- Created `getOriginalScore()` helper function
- Updated `MatchResultEntry` type to include `humor_early_openness_bonus`
- Stored bonus field when fetching matches
- Updated CircularProgressBar to display original score

**State Management**:
```typescript
const [humorBonus, setHumorBonus] = useState<'full' | 'partial' | 'none'>('none')

const getOriginalScore = (): number => {
  if (!compatibilityScore || humorBonus === 'none') return compatibilityScore || 0
  const multiplier = humorBonus === 'full' ? 1.15 : 1.05
  return Math.round(compatibilityScore / multiplier)
}
```

**Data Flow**:
```typescript
// When fetching matches
setCompatibilityScore(currentRoundMatch.score)
setHumorBonus(currentRoundMatch.humor_early_openness_bonus || 'none')

// When displaying
<CircularProgressBar progress={getOriginalScore()} />
```

## Bonus Multipliers

### Full Bonus (×1.15)
- Both humor styles match AND both openness levels match
- Represents complete interaction style compatibility

### Partial Bonus (×1.05)
- Either humor styles match OR openness levels match
- Represents partial interaction style compatibility

### No Bonus (×1.0)
- Neither humor nor openness match
- Standard compatibility score

## Calculation Examples

**Example 1: Full Bonus**
- Bonused Score: 92%
- Multiplier: 1.15
- Original Score: 92 / 1.15 = 80%

**Example 2: Partial Bonus**
- Bonused Score: 84%
- Multiplier: 1.05
- Original Score: 84 / 1.05 = 80%

**Example 3: No Bonus**
- Bonused Score: 80%
- Multiplier: 1.0
- Original Score: 80%

## User Experience

### Admin View (ParticipantResultsModal)
- **Default Display**: Shows bonused score (what was stored in database)
- **Hover Interaction**: Reveals original score before bonus was applied
- **Bonus Indicator**: Flame/Sparkles icon shows bonus type
- **Transparency**: Admins can see both scores for analysis

### Participant View (results.tsx, welcome.tsx)
- **Display**: Shows ONLY original score (before bonus)
- **Rationale**: Participants see their "true" compatibility without algorithmic bonuses
- **Consistency**: Same score shown during feedback and in results history
- **Fairness**: Bonuses are internal algorithm optimizations, not shown to users

## Technical Benefits

1. **Transparency**: Admins can analyze both original and bonused scores
2. **Fairness**: Participants see unmodified compatibility scores
3. **Consistency**: Same calculation method across all displays
4. **Maintainability**: Centralized helper functions for score calculation
5. **Flexibility**: Easy to adjust bonus display logic if needed

## Database Schema

The `humor_early_openness_bonus` column stores:
- `'full'`: Both humor and openness match (×1.15)
- `'partial'`: One of humor or openness matches (×1.05)
- `'none'`: No bonus applied (×1.0)

The `compatibility_score` column stores the **bonused score** (after multiplier applied).

## UI Components Updated

1. **ParticipantResultsModal.tsx**: Admin results modal with hover tooltips
2. **results.tsx**: Participant results history page
3. **welcome.tsx**: Round feedback submission page

## Testing Checklist

- [ ] Admin modal shows bonused score with hover tooltip
- [ ] Tooltip displays correct original score calculation
- [ ] Bonus indicators (flame/sparkles) appear correctly
- [ ] Participant results page shows original scores
- [ ] Feedback page shows original score in circular progress
- [ ] Progress bars reflect original scores accurately
- [ ] Color coding works with original scores
- [ ] No bonus matches display correctly (no division)

## Future Enhancements

Possible improvements:
- Add bonus explanation in participant view (educational)
- Show bonus breakdown in admin analytics
- Export reports with both original and bonused scores
- Historical comparison of bonus effectiveness
- A/B testing different bonus multipliers

## Notes

- The bonus is applied at the matching algorithm level
- Database stores the final bonused score
- UI calculations reverse the bonus for display purposes
- Admin sees both scores for transparency
- Participants only see original scores for fairness
