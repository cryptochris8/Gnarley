# Ball Stuck in Outer Areas - Fixes Applied

## Problem Description
Balls were stopping in outer areas of the field (but still in bounds) and neither human nor AI players would retrieve them.

## Root Causes Identified

1. **Ball Physics Too Aggressive**
   - LINEAR_DAMPING: 0.7 → Ball stopped too quickly
   - FRICTION: 0.4 → Too much resistance to movement

2. **AI Role Boundaries Too Restrictive**
   - Backs only covered X: -25 to 30 (field is -37 to 52)
   - Midfielders only covered X: -20 to 35
   - Left side covered Z: -30 (field is -33)
   - Right side covered Z: 23 (field is 26)
   - **Balls in outer corners/edges weren't covered by ANY role!**

3. **Auto-Possession Range Too Small**
   - Base: 2.0 units (hard for players to pick up stationary balls)
   - Moving balls: 3.0 units

4. **Ball Stationary Detection Slow**
   - 5 second delay before AI considered ball "stuck"

## Fixes Applied

### 1. Ball Physics - Reduced Damping (gameConfig.ts:75-89)
```typescript
FRICTION: 0.25          // REDUCED from 0.4
LINEAR_DAMPING: 0.4     // REDUCED from 0.7
ANGULAR_DAMPING: 2.5    // REDUCED from 3.0
```
**Effect**: Ball rolls further and stays in motion longer, less likely to stop in outer areas

### 2. AI Role Boundaries - Expanded Coverage (AIRoleDefinitions.ts:59-164)

**Left-Back:**
- minX: -40 (was -25) → Covers deep defensive areas
- maxX: 55 (was 30) → Can push forward when needed
- minZ: -35 (was -30) → Covers outer left boundary
- maxZ: -5 (was -8) → More central coverage
- pursuitTendency: 0.7 (was 0.6) → More aggressive

**Right-Back:**
- minX: -40 (was -25)
- maxX: 55 (was 30)
- minZ: -1 (was 2) → More central coverage
- maxZ: 30 (was 23) → Covers outer right boundary
- pursuitTendency: 0.7 (was 0.6)

**Central-Midfielder-1:**
- minX: -40 (was -20) → Full field width
- maxX: 55 (was 35) → Full field length
- minZ: -25 (was -20) → More coverage
- maxZ: 8 (was 5)
- pursuitTendency: 0.85 (was 0.75) → Much more aggressive

**Central-Midfielder-2:**
- minX: -40 (was -20)
- maxX: 55 (was 35)
- minZ: -14 (was -11)
- maxZ: 25 (was 20)
- pursuitTendency: 0.85 (was 0.75)

**Striker:**
- minX: -40 (was -10) → Can track back when needed
- maxX: 55 (was 45)
- minZ: -30 (was -18) → Wider coverage
- maxZ: 25 (was 12)
- pursuitTendency: 0.95 (was 0.85) → Most aggressive

**Effect**: AI players now cover the ENTIRE field, no dead zones in corners

### 3. Auto-Possession Range - Increased (ball.ts:497-506)
```typescript
PROXIMITY_POSSESSION_DISTANCE: 2.5  // INCREASED from 2.0
MAX_BALL_SPEED_FOR_PROXIMITY: 5.0   // INCREASED from 4.0

// For moving balls (passes):
PROXIMITY_POSSESSION_DISTANCE: 3.5  // INCREASED from 3.0
MAX_BALL_SPEED_FOR_PROXIMITY: 10.0  // INCREASED from 8.0
```
**Effect**: Players can pick up balls from further away, easier to retrieve stuck balls

### 4. Ball Stationary Detection - Faster Response (sharedState.ts:43)
```typescript
STATIONARY_TIME_LIMIT: 3000  // REDUCED from 5000ms (3 seconds instead of 5)
```
**Effect**: AI responds to stuck balls 2 seconds faster

## Testing Instructions

1. **Restart your server** to apply changes:
   ```bash
   npm run dev:windows
   # or
   npm run dev
   ```

2. **Test scenarios**:
   - Kick ball to outer corners of field
   - Kick ball along sidelines
   - Let ball stop near field boundaries
   - Watch if AI players now chase it within 3 seconds

3. **Expected behavior**:
   - Ball rolls further before stopping
   - AI players should chase balls in all field areas
   - Closer players auto-pick up balls more easily
   - No more permanently stuck balls

## Rollback Instructions

If these changes cause issues (ball too bouncy, AI too aggressive), you can adjust:

**Ball too bouncy?**
- Increase LINEAR_DAMPING back to 0.5-0.6 (not 0.7)
- Increase FRICTION back to 0.3-0.35 (not 0.4)

**AI too aggressive?**
- Reduce pursuitTendency values by 0.05-0.1
- Keep expanded preferredArea (that's not the problem)

**Auto-pickup too forgiving?**
- Reduce PROXIMITY_POSSESSION_DISTANCE by 0.2-0.3

## Files Modified

1. `state/gameConfig.ts` - Ball physics
2. `entities/ai/AIRoleDefinitions.ts` - AI role boundaries and pursuit
3. `state/sharedState.ts` - Ball stationary detection timing
4. `utils/ball.ts` - Auto-possession proximity ranges

## Notes

- These changes maintain gameplay balance while fixing the stuck ball issue
- AI roles still maintain formation discipline during normal play
- Emergency retrieval only activates for truly stuck balls
- Human players also benefit from increased auto-possession range
