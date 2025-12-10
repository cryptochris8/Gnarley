---
description: Quick reference for common file locations and key constants
---

Provide a quick reference summary for the Hytopia Soccer game:

## Quick File Locations

**Core Game**:
- Main: `index.ts`
- Game State: `state/gameState.ts`
- Game Modes: `state/gameModes.ts`
- Config: `state/gameConfig.ts`

**AI System**:
- AI Player: `entities/AIPlayerEntity.ts`
- Soccer Agent: `entities/SoccerAgent.ts`
- Behavior Tree: `entities/BehaviorTree.ts`

**Physics**:
- Ball: `utils/ball.ts`
- Config: `state/gameConfig.ts` (BALL_CONFIG)

**Player**:
- Base: `entities/SoccerPlayerEntity.ts`
- Controller: `controllers/SoccerPlayerController.ts`

**Audio**:
- Crowd: `utils/fifaCrowdManager.ts`
- Music: `index.ts` (lines 136-176)

## Key Constants

**Field Boundaries**:
- X: -37 to 52 (89 units)
- Z: -33 to 26 (59 units)
- Y: 0 to 15

**Goal Positions**:
- Red goal: X = -37
- Blue goal: X = 52
- Center: X = 7, Z = -3

**AI Decision Intervals**:
- Goalkeeper: 150ms
- Field players: 500ms

**Timing**:
- Half duration: 300 seconds (5 min)
- Match duration: 600 seconds (10 min)
- Halftime: 120 seconds (manual)

**AI Roles** (6 per team):
1. Goalkeeper
2. Left-back
3. Right-back
4. Central-midfielder-1
5. Central-midfielder-2
6. Striker

For full details, use `/game-arch` to view the complete architecture summary.
