# Tier 1 Gameplay Improvements - Implementation Guide

## Status: ✅ ALL IMPLEMENTED

**Build Status:** Successful (81 modules bundled)
**Last Updated:** After refactoring Phase 4.1

## Overview
These improvements are 100% supported by the Hytopia SDK and will noticeably improve game enjoyment.

---

## 1. Goal Celebrations (Screen Flash + Shake + Enhanced Audio)

### What it does:
- Screen flashes white briefly when a goal is scored
- Camera shakes for dramatic effect
- Enhanced audio celebration sequence
- Scorer name announcement

### Files Modified:
- `assets/ui/index.html` - Add CSS animations for flash/shake
- `src/handlers/GameEventHandlers.ts` - Trigger celebration on goal
- `utils/fifaCrowdManager.ts` - Enhanced goal audio sequence

### Implementation:
```typescript
// Server sends celebration trigger
player.ui.sendData({
  type: 'goal-celebration',
  team: 'red',
  scorer: 'PlayerName'
});

// Client CSS handles flash/shake animations
```

---

## 2. Stamina Bar UI

### What it does:
- Visual stamina bar on screen
- Changes color based on stamina level (green → yellow → red)
- Shows regeneration feedback

### Files Modified:
- `assets/ui/index.html` - Add stamina bar HTML/CSS
- `entities/SoccerPlayerEntity.ts` - Already sends stamina data via `sendEnhancedUIUpdate()`

### Data Format:
```typescript
player.ui.sendData({
  type: "game-state",
  stamina: 75, // percentage
  // ... other data
});
```

---

## 3. Enable Enhanced Arcade Power-ups

### What it does:
- Enables the already-coded power-ups in arcade mode:
  - Time Slow - Slow other players
  - Ball Magnet - Ball follows you
  - Crystal Barrier - Create barriers
  - Tidal Wave - Push wave effect
  - Reality Warp - Teleport portals
  - Honey Trap - Slow zones

### Files Modified:
- `abilities/itemTypes.ts` - Uncomment from ALL_POWERUP_OPTIONS
- `state/arcadeEnhancements.ts` - Enable spawning enhanced power-ups

### Current Status:
Power-ups are fully defined but commented out in `ALL_POWERUP_OPTIONS` array.

---

## 4. Shot Power Charge Meter

### What it does:
- Hold shoot button to charge power
- Visual meter shows charge level
- Release to shoot with charged power
- Max charge = maximum power shot

### Files Modified:
- `assets/ui/index.html` - Add power meter UI
- `controllers/SoccerPlayerController.ts` - Track charge time
- Server sends charge updates to UI

### Data Format:
```typescript
player.ui.sendData({
  type: "shot-charging",
  power: 0.75 // 0-1 scale
});
```

---

## 5. "On Fire" Momentum Indicator

### What it does:
- Visual indicator when player/team is on a scoring streak
- Fire effect around player name or UI element
- Triggered after 2+ consecutive goals

### Files Modified:
- `assets/ui/index.html` - Add fire indicator UI
- `services/ScoringService.ts` - Already tracks momentum
- `src/handlers/GameEventHandlers.ts` - Send momentum state to UI

### Momentum Tracking (Already Exists):
```typescript
// From ScoringService.ts
public isOnStreak(team: "red" | "blue", minGoals: number = 2): boolean {
  return this.teamMomentum[team].consecutiveGoals >= minGoals;
}
```

---

## SDK APIs Used

### UI System
- `player.ui.load('ui/index.html')` - Load overlay UI
- `player.ui.sendData({...})` - Send data to client
- Client: `hytopia.onData(callback)` - Receive data

### Camera (for shake)
- `player.camera.setOffset({ x, y, z })` - Apply offset for shake
- Reset to `{ x: 0, y: 0, z: 0 }` after shake

### Audio
- `new Audio({ uri, volume, loop }).play(world)` - Play sounds
- `audio.setVolume(0-1)` - Dynamic volume control

### Persistence (for stats)
- `player.getPersistedData()` - Read saved data
- `player.setPersistedData({...})` - Save data

---

## CSS Animation Examples

### Screen Flash
```css
.screen-flash {
  animation: flash 0.3s ease-out;
}

@keyframes flash {
  0% { background: rgba(255, 255, 255, 0.8); }
  100% { background: transparent; }
}
```

### Screen Shake
```css
.screen-shake {
  animation: shake 0.4s ease-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
```

### Fire Effect
```css
.on-fire {
  animation: fire-glow 0.5s ease-in-out infinite alternate;
  text-shadow: 0 0 10px #ff6600, 0 0 20px #ff3300;
}

@keyframes fire-glow {
  from { filter: brightness(1); }
  to { filter: brightness(1.3); }
}
```

---

## Implementation Priority

1. **Goal Celebrations** - Highest impact, touches multiple systems
2. **Stamina Bar** - Easy, data already being sent
3. **Shot Power Meter** - Adds skill ceiling
4. **Momentum Indicator** - Data already tracked
5. **Enhanced Power-ups** - Just uncomment and test

---

## Testing Checklist

- [x] Goal celebration triggers on both red and blue goals ✅
- [x] Screen flash is visible but not jarring (team-colored flash) ✅
- [x] Camera shake feels impactful but not disorienting ✅
- [x] Stamina bar updates smoothly (already existed) ✅
- [x] Stamina color changes at correct thresholds ✅
- [x] Shot power meter appears when holding shoot (already existed) ✅
- [x] Shot power affects ball speed appropriately ✅
- [x] "On Fire" indicator shows after 2 consecutive goals ✅
- [x] Enhanced power-ups enabled in arcade mode (TimeSlow, BallMagnet, CrystalBarrier) ✅
- [ ] Playtest all power-ups for balance

---

## Rollback Instructions

If any feature causes issues:

1. **Goal Celebrations**: Remove event listener in GameEventHandlers
2. **Stamina Bar**: Hide via CSS `display: none`
3. **Shot Power**: Revert SoccerPlayerController changes
4. **Momentum**: Remove UI element, backend still tracks
5. **Power-ups**: Re-comment in itemTypes.ts

---

## Future Tier 2 Improvements

After Tier 1 is complete:
- Chip shot mechanic
- Through ball passing
- XP/Progression system
- Basic leaderboard
- Goalkeeper AI improvements
- Curved shots (medium complexity)
