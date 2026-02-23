import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIDecisionMaker } from '../../entities/ai/AIDecisionMaker';
import type { DecisionContext } from '../../entities/ai/AIDecisionMaker';
import {
  ROLE_DEFINITIONS,
  getPursuitDistanceForRole,
  POSITION_DISCIPLINE_FACTOR,
} from '../../entities/ai/AIRoleDefinitions';
import type { SoccerAIRole } from '../../entities/ai/AIRoleDefinitions';
import {
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_FIELD_CENTER_Z,
} from '../../state/gameConfig';

/**
 * Helper to create a mock DecisionContext with sensible defaults.
 * All methods are vi.fn() stubs that can be overridden per test.
 */
function createMockContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    position: { x: 0, y: 1, z: 0 },
    aiRole: 'striker',
    team: 'red',
    username: 'test-ai',

    distanceBetween: vi.fn((pos1, pos2) => {
      const dx = pos1.x - pos2.x;
      const dy = (pos1.y ?? 0) - (pos2.y ?? 0);
      const dz = pos1.z - pos2.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }),
    getVisibleTeammates: vi.fn().mockReturnValue([]),
    isClosestTeammateToPosition: vi.fn().mockReturnValue(true),
    getRoleBasedPosition: vi.fn().mockReturnValue({ x: 5, y: 1, z: 0 }),
    shootBall: vi.fn().mockReturnValue(true),
    passBall: vi.fn().mockReturnValue(true),
    tackleBall: vi.fn(),
    shouldPursueBasedOnTeamCoordination: vi.fn().mockReturnValue(false),

    ...overrides,
  };
}

describe('AIDecisionMaker', () => {
  let decisionMaker: AIDecisionMaker;

  beforeEach(() => {
    decisionMaker = new AIDecisionMaker();
  });

  // ── isLooseBallInArea ──────────────────────────────────────────────
  describe('isLooseBallInArea', () => {
    it('returns true when ball is within preferred area', () => {
      const area = ROLE_DEFINITIONS.striker.preferredArea;
      const context = createMockContext({ aiRole: 'striker' });
      const ballPos = {
        x: (area.minX + area.maxX) / 2,
        y: 1,
        z: (area.minZ + area.maxZ) / 2,
      };

      expect(decisionMaker.isLooseBallInArea(context, ballPos)).toBe(true);
    });

    it('returns false when ball is outside preferred area (x too low)', () => {
      const area = ROLE_DEFINITIONS.striker.preferredArea;
      const context = createMockContext({ aiRole: 'striker' });
      const ballPos = { x: area.minX - 10, y: 1, z: 0 };

      expect(decisionMaker.isLooseBallInArea(context, ballPos)).toBe(false);
    });

    it('returns false when ball is outside preferred area (x too high)', () => {
      const area = ROLE_DEFINITIONS.striker.preferredArea;
      const context = createMockContext({ aiRole: 'striker' });
      const ballPos = { x: area.maxX + 10, y: 1, z: 0 };

      expect(decisionMaker.isLooseBallInArea(context, ballPos)).toBe(false);
    });

    it('returns false when ball is outside preferred area (z too low)', () => {
      const area = ROLE_DEFINITIONS.striker.preferredArea;
      const context = createMockContext({ aiRole: 'striker' });
      const ballPos = { x: 10, y: 1, z: area.minZ - 10 };

      expect(decisionMaker.isLooseBallInArea(context, ballPos)).toBe(false);
    });

    it('returns false when ball is outside preferred area (z too high)', () => {
      const area = ROLE_DEFINITIONS.striker.preferredArea;
      const context = createMockContext({ aiRole: 'striker' });
      const ballPos = { x: 10, y: 1, z: area.maxZ + 10 };

      expect(decisionMaker.isLooseBallInArea(context, ballPos)).toBe(false);
    });

    it('returns true when ball is exactly on area boundary', () => {
      const area = ROLE_DEFINITIONS.striker.preferredArea;
      const context = createMockContext({ aiRole: 'striker' });
      const ballPos = { x: area.minX, y: 1, z: area.minZ };

      expect(decisionMaker.isLooseBallInArea(context, ballPos)).toBe(true);
    });

    it('returns true when ball is on max boundary', () => {
      const area = ROLE_DEFINITIONS.striker.preferredArea;
      const context = createMockContext({ aiRole: 'striker' });
      const ballPos = { x: area.maxX, y: 1, z: area.maxZ };

      expect(decisionMaker.isLooseBallInArea(context, ballPos)).toBe(true);
    });

    it('uses correct area for goalkeeper role', () => {
      const area = ROLE_DEFINITIONS.goalkeeper.preferredArea;
      const context = createMockContext({ aiRole: 'goalkeeper' });

      // Ball inside goalkeeper area
      const insideBall = { x: 0, y: 1, z: 0 };
      expect(decisionMaker.isLooseBallInArea(context, insideBall)).toBe(true);

      // Ball far from goalkeeper area
      const outsideBall = { x: 40, y: 1, z: 0 };
      expect(decisionMaker.isLooseBallInArea(context, outsideBall)).toBe(false);
    });

    it('uses correct area for left-back role', () => {
      const area = ROLE_DEFINITIONS['left-back'].preferredArea;
      const context = createMockContext({ aiRole: 'left-back' });

      // Ball on left side within left-back area
      const insideBall = { x: 0, y: 1, z: -15 };
      expect(decisionMaker.isLooseBallInArea(context, insideBall)).toBe(true);

      // Ball on right side outside left-back area
      const outsideBall = { x: 0, y: 1, z: 20 };
      expect(decisionMaker.isLooseBallInArea(context, outsideBall)).toBe(false);
    });

    it('works for each role with their center position', () => {
      const allRoles: SoccerAIRole[] = [
        'goalkeeper', 'left-back', 'right-back',
        'central-midfielder-1', 'central-midfielder-2', 'striker',
      ];

      for (const role of allRoles) {
        const area = ROLE_DEFINITIONS[role].preferredArea;
        const context = createMockContext({ aiRole: role });
        const center = {
          x: (area.minX + area.maxX) / 2,
          y: 1,
          z: (area.minZ + area.maxZ) / 2,
        };

        expect(decisionMaker.isLooseBallInArea(context, center)).toBe(true);
      }
    });
  });

  // ── isBallTooFarToChase ────────────────────────────────────────────
  describe('isBallTooFarToChase', () => {
    it('returns true when distance exceeds pursuitDistance * 1.5', () => {
      const context = createMockContext({
        aiRole: 'striker',
        position: { x: 0, y: 1, z: 0 },
      });
      const pursuitDist = getPursuitDistanceForRole('striker');
      const tooFar = pursuitDist * 1.5 + 1;

      // Ball at x=tooFar, distance will be tooFar
      const ballPos = { x: tooFar, y: 1, z: 0 };

      expect(decisionMaker.isBallTooFarToChase(context, ballPos)).toBe(true);
    });

    it('returns false when distance is within pursuitDistance * 1.5', () => {
      const context = createMockContext({
        aiRole: 'striker',
        position: { x: 0, y: 1, z: 0 },
      });
      const pursuitDist = getPursuitDistanceForRole('striker');
      // Place ball well within range
      const ballPos = { x: pursuitDist * 0.5, y: 1, z: 0 };

      expect(decisionMaker.isBallTooFarToChase(context, ballPos)).toBe(false);
    });

    it('returns false when distance equals pursuitDistance * 1.5 exactly', () => {
      const pursuitDist = getPursuitDistanceForRole('striker');
      const exactDistance = pursuitDist * 1.5;

      // Use a mock distanceBetween that returns the exact threshold
      const context = createMockContext({
        aiRole: 'striker',
        distanceBetween: vi.fn().mockReturnValue(exactDistance),
      });

      // At exactly the threshold, distance > maxChaseDistance is false
      expect(decisionMaker.isBallTooFarToChase(context, { x: 0, y: 0, z: 0 })).toBe(false);
    });

    it('uses role-specific pursuit distances', () => {
      // Goalkeeper has much shorter pursuit distance than striker
      const gkDist = getPursuitDistanceForRole('goalkeeper') * 1.5;
      const stDist = getPursuitDistanceForRole('striker') * 1.5;

      // A ball at distance 15 should be too far for GK but not for striker
      const distanceMock = vi.fn().mockReturnValue(15);

      const gkContext = createMockContext({
        aiRole: 'goalkeeper',
        distanceBetween: distanceMock,
      });
      const stContext = createMockContext({
        aiRole: 'striker',
        distanceBetween: distanceMock,
      });

      const ballPos = { x: 15, y: 1, z: 0 };

      // GK pursuit: 6 * 1.5 = 9, so 15 > 9 -> true
      expect(decisionMaker.isBallTooFarToChase(gkContext, ballPos)).toBe(true);
      // Striker pursuit: 18 * 1.5 = 27, so 15 > 27 -> false
      expect(decisionMaker.isBallTooFarToChase(stContext, ballPos)).toBe(false);
    });

    it('calls distanceBetween with context position and ball position', () => {
      const distMock = vi.fn().mockReturnValue(5);
      const myPos = { x: 10, y: 1, z: 5 };
      const ballPos = { x: 20, y: 1, z: 10 };
      const context = createMockContext({
        position: myPos,
        distanceBetween: distMock,
      });

      decisionMaker.isBallTooFarToChase(context, ballPos);

      expect(distMock).toHaveBeenCalledWith(myPos, ballPos);
    });
  });

  // ── shouldStopPursuit ──────────────────────────────────────────────
  describe('shouldStopPursuit', () => {
    it('delegates to isBallTooFarToChase', () => {
      const context = createMockContext({
        aiRole: 'striker',
        distanceBetween: vi.fn().mockReturnValue(100), // Very far
      });

      const result = decisionMaker.shouldStopPursuit(context, { x: 0, y: 0, z: 0 });
      expect(result).toBe(true);
    });

    it('returns false when ball is close', () => {
      const context = createMockContext({
        aiRole: 'striker',
        distanceBetween: vi.fn().mockReturnValue(2), // Very close
      });

      expect(decisionMaker.shouldStopPursuit(context, { x: 0, y: 0, z: 0 })).toBe(false);
    });

    it('returns same value as isBallTooFarToChase for same inputs', () => {
      const distMock = vi.fn().mockReturnValue(20);
      const context = createMockContext({
        aiRole: 'central-midfielder-1',
        distanceBetween: distMock,
      });
      const ballPos = { x: 20, y: 1, z: 0 };

      const tooFar = decisionMaker.isBallTooFarToChase(context, ballPos);
      const stopPursuit = decisionMaker.shouldStopPursuit(context, ballPos);

      expect(stopPursuit).toBe(tooFar);
    });
  });

  // ── isClosestTeammateToPosition ────────────────────────────────────
  describe('isClosestTeammateToPosition', () => {
    it('returns true when no teammates exist', () => {
      const context = createMockContext({
        getVisibleTeammates: vi.fn().mockReturnValue([]),
      });

      expect(decisionMaker.isClosestTeammateToPosition(context, { x: 10, y: 1, z: 5 })).toBe(true);
    });

    it('returns true when AI is closer than all teammates', () => {
      const context = createMockContext({
        position: { x: 5, y: 1, z: 0 },
        getVisibleTeammates: vi.fn().mockReturnValue([
          { position: { x: 20, y: 1, z: 0 } },
          { position: { x: 30, y: 1, z: 0 } },
        ]),
      });

      const targetPos = { x: 6, y: 1, z: 0 };
      expect(decisionMaker.isClosestTeammateToPosition(context, targetPos)).toBe(true);
    });

    it('returns false when a teammate is closer', () => {
      const targetPos = { x: 10, y: 1, z: 0 };

      const context = createMockContext({
        position: { x: 0, y: 1, z: 0 },
        getVisibleTeammates: vi.fn().mockReturnValue([
          { position: { x: 9, y: 1, z: 0 } }, // This teammate is at distance 1, we are at distance 10
        ]),
      });

      expect(decisionMaker.isClosestTeammateToPosition(context, targetPos)).toBe(false);
    });

    it('returns true when AI is equidistant with teammate (no teammate is strictly closer)', () => {
      // distanceBetween returns same value for AI and teammate
      const distMock = vi.fn().mockReturnValue(10);
      const context = createMockContext({
        distanceBetween: distMock,
        getVisibleTeammates: vi.fn().mockReturnValue([
          { position: { x: 0, y: 0, z: 0 } },
        ]),
      });

      // Both return 10, so no teammate is < myDistance, returns true
      expect(decisionMaker.isClosestTeammateToPosition(context, { x: 0, y: 0, z: 0 })).toBe(true);
    });

    it('calls distanceBetween for each teammate', () => {
      const distMock = vi.fn().mockReturnValue(50);
      const teammates = [
        { position: { x: 1, y: 1, z: 1 } },
        { position: { x: 2, y: 2, z: 2 } },
        { position: { x: 3, y: 3, z: 3 } },
      ];
      const context = createMockContext({
        distanceBetween: distMock,
        getVisibleTeammates: vi.fn().mockReturnValue(teammates),
      });

      decisionMaker.isClosestTeammateToPosition(context, { x: 10, y: 1, z: 10 });

      // 1 call for myDistance + 3 calls for teammates = 4
      expect(distMock).toHaveBeenCalledTimes(4);
    });

    it('returns false as soon as any teammate is closer (short-circuits)', () => {
      let callCount = 0;
      const distMock = vi.fn((pos1: any, pos2: any) => {
        callCount++;
        // First call is myDistance (returns 20)
        // Second call is first teammate (returns 5, which is < 20)
        if (callCount === 1) return 20;
        return 5;
      });

      const context = createMockContext({
        distanceBetween: distMock,
        getVisibleTeammates: vi.fn().mockReturnValue([
          { position: { x: 1, y: 1, z: 1 } },
          { position: { x: 2, y: 2, z: 2 } },
        ]),
      });

      const result = decisionMaker.isClosestTeammateToPosition(context, { x: 0, y: 0, z: 0 });
      expect(result).toBe(false);
      // Should short-circuit: 1 for myDistance + 1 for first teammate = 2
      expect(distMock).toHaveBeenCalledTimes(2);
    });
  });

  // ── getRoleBasedPosition ───────────────────────────────────────────
  describe('getRoleBasedPosition', () => {
    it('returns a position with x, y, z properties', () => {
      const context = createMockContext({ aiRole: 'striker' });
      const ballPos = { x: 10, y: 1, z: 5 };
      const result = decisionMaker.getRoleBasedPosition(context, ballPos);

      expect(result).toHaveProperty('x');
      expect(result).toHaveProperty('y');
      expect(result).toHaveProperty('z');
    });

    it('preserves y from context position', () => {
      const context = createMockContext({
        aiRole: 'striker',
        position: { x: 0, y: 3.5, z: 0 },
      });
      const result = decisionMaker.getRoleBasedPosition(context, { x: 10, y: 1, z: 5 });

      expect(result.y).toBe(3.5);
    });

    it('result is clamped within preferred area bounds', () => {
      const area = ROLE_DEFINITIONS.goalkeeper.preferredArea;
      const context = createMockContext({ aiRole: 'goalkeeper' });

      // Ball far outside goalkeeper area should still produce position within area
      const farBall = { x: 100, y: 1, z: 100 };
      const result = decisionMaker.getRoleBasedPosition(context, farBall);

      expect(result.x).toBeGreaterThanOrEqual(area.minX);
      expect(result.x).toBeLessThanOrEqual(area.maxX);
      expect(result.z).toBeGreaterThanOrEqual(area.minZ);
      expect(result.z).toBeLessThanOrEqual(area.maxZ);
    });

    it('result is influenced by ball position based on discipline factor', () => {
      const context = createMockContext({ aiRole: 'striker' });
      const area = ROLE_DEFINITIONS.striker.preferredArea;
      const disciplineFactor = POSITION_DISCIPLINE_FACTOR.striker;

      const centerX = (area.minX + area.maxX) / 2;
      const centerZ = (area.minZ + area.maxZ) / 2;

      // Ball at center of area
      const ballAtCenter = { x: centerX, y: 1, z: centerZ };
      const resultCenter = decisionMaker.getRoleBasedPosition(context, ballAtCenter);

      // Ball offset to the right
      const ballRight = { x: centerX + 20, y: 1, z: centerZ };
      // Clear cache for new ball position
      const dm2 = new AIDecisionMaker();
      const resultRight = dm2.getRoleBasedPosition(context, ballRight);

      // With ball influence (1 - discipline), the position should shift toward the ball
      // Striker has discipline 0.62, so ball influence is 0.38
      // The right-offset ball should produce a position shifted right (higher x)
      if (disciplineFactor < 1) {
        expect(resultRight.x).toBeGreaterThanOrEqual(resultCenter.x);
      }
    });

    it('goalkeeper with high discipline stays near area center', () => {
      const area = ROLE_DEFINITIONS.goalkeeper.preferredArea;
      const centerX = (area.minX + area.maxX) / 2;
      const centerZ = (area.minZ + area.maxZ) / 2;
      const discipline = POSITION_DISCIPLINE_FACTOR.goalkeeper; // 0.95

      const context = createMockContext({
        aiRole: 'goalkeeper',
        position: { x: 0, y: 1, z: 0 },
      });

      // Even with ball far away, goalkeeper should stay close to center
      const farBall = { x: 40, y: 1, z: 15 };
      const result = decisionMaker.getRoleBasedPosition(context, farBall);

      // With 0.95 discipline, the target should be very close to area center
      const expectedX = centerX * discipline + farBall.x * (1 - discipline);
      const clampedX = Math.max(area.minX, Math.min(area.maxX, expectedX));
      expect(result.x).toBeCloseTo(clampedX, 1);
    });

    it('caches result for same ball position (rounded)', () => {
      const context = createMockContext({ aiRole: 'striker' });

      // Two calls with very close ball positions (within rounding)
      const ball1 = { x: 10.01, y: 1, z: 5.04 };
      const ball2 = { x: 10.02, y: 1, z: 5.03 };

      const result1 = decisionMaker.getRoleBasedPosition(context, ball1);
      const result2 = decisionMaker.getRoleBasedPosition(context, ball2);

      // Both round to x=10.0, z=5.0 so cache key is the same
      expect(result1).toBe(result2); // Same reference from cache
    });

    it('returns different result for significantly different ball positions', () => {
      const context = createMockContext({ aiRole: 'striker' });

      const ball1 = { x: 0, y: 1, z: 0 };
      const ball2 = { x: 40, y: 1, z: 10 };

      const result1 = decisionMaker.getRoleBasedPosition(context, ball1);
      const result2 = decisionMaker.getRoleBasedPosition(context, ball2);

      // Different ball positions should yield different target positions
      expect(result1.x === result2.x && result1.z === result2.z).toBe(false);
    });
  });

  // ── makeRoleDecision ───────────────────────────────────────────────
  describe('makeRoleDecision', () => {
    it('routes left-back role to leftBackDecision', () => {
      const context = createMockContext({ aiRole: 'left-back', team: 'red' });
      const ballPos = { x: 10, y: 1, z: -15 };

      const result = decisionMaker.makeRoleDecision(context, null, ballPos, false);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('x');
      expect(result).toHaveProperty('y');
      expect(result).toHaveProperty('z');
    });

    it('routes right-back role to rightBackDecision', () => {
      const context = createMockContext({ aiRole: 'right-back', team: 'blue' });
      const ballPos = { x: 5, y: 1, z: 10 };

      const result = decisionMaker.makeRoleDecision(context, null, ballPos, false);
      expect(result).toBeDefined();
    });

    it('routes central-midfielder-1 role correctly', () => {
      const context = createMockContext({ aiRole: 'central-midfielder-1', team: 'red' });
      const ballPos = { x: 10, y: 1, z: 0 };

      const result = decisionMaker.makeRoleDecision(context, null, ballPos, false);
      expect(result).toBeDefined();
    });

    it('routes central-midfielder-2 role correctly', () => {
      const context = createMockContext({ aiRole: 'central-midfielder-2', team: 'blue' });
      const ballPos = { x: 10, y: 1, z: 0 };

      const result = decisionMaker.makeRoleDecision(context, null, ballPos, false);
      expect(result).toBeDefined();
    });

    it('routes striker role and returns position when ball entity is provided', () => {
      const context = createMockContext({ aiRole: 'striker', team: 'red' });
      const mockBall = { id: 'ball-1' } as any;
      const ballPos = { x: 30, y: 1, z: 5 };

      const result = decisionMaker.makeRoleDecision(context, mockBall, ballPos, false);
      expect(result).toBeDefined();
    });

    it('striker returns context.position when ball entity is null', () => {
      const myPos = { x: 15, y: 1, z: -5 };
      const context = createMockContext({ aiRole: 'striker', position: myPos });
      const ballPos = { x: 30, y: 1, z: 5 };

      const result = decisionMaker.makeRoleDecision(context, null, ballPos, false);
      expect(result).toEqual(myPos);
    });

    it('falls back to getRoleBasedPosition for unknown roles (throws if role not in ROLE_DEFINITIONS)', () => {
      const context = createMockContext({ aiRole: 'unknown-role' as SoccerAIRole });
      const ballPos = { x: 10, y: 1, z: 5 };

      // The default case calls getRoleBasedPosition which looks up ROLE_DEFINITIONS,
      // and an unknown role is not defined there, so it throws
      expect(() => {
        decisionMaker.makeRoleDecision(context, null, ballPos, false);
      }).toThrow();
    });

    // ── hasBall behavior per role ──
    it('left-back with ball tries to pass', () => {
      const passFn = vi.fn().mockReturnValue(true);
      const context = createMockContext({
        aiRole: 'left-back',
        team: 'red',
        passBall: passFn,
      });
      const ballPos = { x: 10, y: 1, z: -15 };

      decisionMaker.makeRoleDecision(context, null, ballPos, true);
      expect(passFn).toHaveBeenCalled();
    });

    it('right-back with ball tries to pass', () => {
      const passFn = vi.fn().mockReturnValue(true);
      const context = createMockContext({
        aiRole: 'right-back',
        team: 'red',
        passBall: passFn,
      });
      const ballPos = { x: 10, y: 1, z: 10 };

      decisionMaker.makeRoleDecision(context, null, ballPos, true);
      expect(passFn).toHaveBeenCalled();
    });

    it('central-midfielder with ball near goal tries to shoot first', () => {
      const shootFn = vi.fn().mockReturnValue(true);
      const context = createMockContext({
        aiRole: 'central-midfielder-1',
        team: 'red',
        // Position close to opponent goal (blue goal is at -37, red attacks toward -37)
        position: { x: AI_GOAL_LINE_X_BLUE + 15, y: 1, z: 0 },
        shootBall: shootFn,
      });
      const ballPos = { x: AI_GOAL_LINE_X_BLUE + 15, y: 1, z: 0 };

      decisionMaker.makeRoleDecision(context, null, ballPos, true);
      expect(shootFn).toHaveBeenCalled();
    });

    it('central-midfielder with ball far from goal passes instead', () => {
      const shootFn = vi.fn().mockReturnValue(false);
      const passFn = vi.fn().mockReturnValue(true);
      const context = createMockContext({
        aiRole: 'central-midfielder-1',
        team: 'red',
        // Position far from opponent goal
        position: { x: AI_GOAL_LINE_X_RED, y: 1, z: 0 },
        shootBall: shootFn,
        passBall: passFn,
      });
      const ballPos = { x: AI_GOAL_LINE_X_RED, y: 1, z: 0 };

      decisionMaker.makeRoleDecision(context, null, ballPos, true);
      // Distance to opponent goal (blue at -37) from red goal line (52) is 89, > 20
      expect(passFn).toHaveBeenCalled();
    });

    it('striker with ball tries to shoot', () => {
      const shootFn = vi.fn().mockReturnValue(true);
      const context = createMockContext({
        aiRole: 'striker',
        team: 'red',
        shootBall: shootFn,
      });
      const mockBall = { id: 'ball-1' } as any;
      const ballPos = { x: 10, y: 1, z: 0 };

      decisionMaker.makeRoleDecision(context, mockBall, ballPos, true);
      expect(shootFn).toHaveBeenCalled();
    });

    it('striker tries pass when shoot fails', () => {
      const shootFn = vi.fn().mockReturnValue(false);
      const passFn = vi.fn().mockReturnValue(true);
      const context = createMockContext({
        aiRole: 'striker',
        team: 'red',
        shootBall: shootFn,
        passBall: passFn,
      });
      const mockBall = { id: 'ball-1' } as any;
      const ballPos = { x: 10, y: 1, z: 0 };

      decisionMaker.makeRoleDecision(context, mockBall, ballPos, true);
      expect(shootFn).toHaveBeenCalled();
      expect(passFn).toHaveBeenCalled();
    });

    it('striker without ball uses team coordination for pursuit', () => {
      const pursueFn = vi.fn().mockReturnValue(true);
      const context = createMockContext({
        aiRole: 'striker',
        team: 'red',
        shouldPursueBasedOnTeamCoordination: pursueFn,
      });
      const mockBall = { id: 'ball-1' } as any;
      const ballPos = { x: 20, y: 1, z: 5 };

      const result = decisionMaker.makeRoleDecision(context, mockBall, ballPos, false);
      expect(pursueFn).toHaveBeenCalledWith(ballPos);
      // When pursuing, returns ball position
      expect(result).toEqual(ballPos);
    });

    // ── Team-specific goal line selection ──
    it('uses correct goal lines for red team', () => {
      const shootFn = vi.fn().mockReturnValue(true);
      const context = createMockContext({
        aiRole: 'striker',
        team: 'red',
        position: { x: 0, y: 1, z: 0 },
        shootBall: shootFn,
      });
      const mockBall = { id: 'ball-1' } as any;

      decisionMaker.makeRoleDecision(context, mockBall, { x: 0, y: 1, z: 0 }, true);

      // Red team shoots toward blue goal line (-37)
      const shootTarget = shootFn.mock.calls[0][0];
      expect(shootTarget.x).toBe(AI_GOAL_LINE_X_BLUE);
    });

    it('uses correct goal lines for blue team', () => {
      const shootFn = vi.fn().mockReturnValue(true);
      const context = createMockContext({
        aiRole: 'striker',
        team: 'blue',
        position: { x: 0, y: 1, z: 0 },
        shootBall: shootFn,
      });
      const mockBall = { id: 'ball-1' } as any;

      decisionMaker.makeRoleDecision(context, mockBall, { x: 0, y: 1, z: 0 }, true);

      // Blue team shoots toward red goal line (52)
      const shootTarget = shootFn.mock.calls[0][0];
      expect(shootTarget.x).toBe(AI_GOAL_LINE_X_RED);
    });
  });

  // ── shouldPursueBasedOnTeamCoordination ────────────────────────────
  describe('shouldPursueBasedOnTeamCoordination', () => {
    it('returns false when ball is beyond pursuit distance', () => {
      const context = createMockContext({
        aiRole: 'goalkeeper',
        position: { x: 0, y: 1, z: 0 },
        // Real distance function
        distanceBetween: vi.fn((a, b) => Math.sqrt((a.x-b.x)**2 + (a.z-b.z)**2)),
      });

      // GK pursuit distance is 6, so ball at 100 is way too far
      const result = decisionMaker.shouldPursueBasedOnTeamCoordination(
        context,
        { x: 100, y: 1, z: 0 }
      );

      expect(result).toBe(false);
    });

    it('returns true when AI is closest to ball and within pursuit distance', () => {
      // We need Math.random to return a value that passes probability check
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // Very low, will pass any probability

      const context = createMockContext({
        aiRole: 'striker',
        position: { x: 0, y: 1, z: 0 },
        getVisibleTeammates: vi.fn().mockReturnValue([]),
        distanceBetween: vi.fn((a, b) => Math.sqrt((a.x-b.x)**2 + (a.z-b.z)**2)),
      });

      // Ball close to AI (within striker pursuit distance of 18)
      const result = decisionMaker.shouldPursueBasedOnTeamCoordination(
        context,
        { x: 5, y: 1, z: 0 }
      );

      expect(result).toBe(true);

      vi.restoreAllMocks();
    });

    it('returns false when a teammate is closer to the ball', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      const context = createMockContext({
        aiRole: 'striker',
        position: { x: 10, y: 1, z: 0 },
        getVisibleTeammates: vi.fn().mockReturnValue([
          { position: { x: 3, y: 1, z: 0 } }, // This teammate is closer to ball at (2,1,0)
        ]),
        distanceBetween: vi.fn((a, b) => Math.sqrt((a.x-b.x)**2 + (a.z-b.z)**2)),
      });

      const result = decisionMaker.shouldPursueBasedOnTeamCoordination(
        context,
        { x: 2, y: 1, z: 0 }
      );

      expect(result).toBe(false);

      vi.restoreAllMocks();
    });
  });
});
