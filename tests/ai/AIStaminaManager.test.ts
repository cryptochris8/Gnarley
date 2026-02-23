import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIStaminaManager } from '../../entities/ai/AIStaminaManager';
import type { AIPlayerContext } from '../../entities/ai/AIStaminaManager';
import type { SoccerAIRole } from '../../entities/ai/AIRoleDefinitions';

/**
 * Helper to create a mock AIPlayerContext with sensible defaults.
 * All methods are vi.fn() stubs that can be overridden per test.
 */
function createMockContext(overrides: Partial<AIPlayerContext> = {}): AIPlayerContext {
  return {
    aiRole: 'striker',
    position: { x: 10, y: 1, z: 5 },
    username: 'test-ai',

    passBall: vi.fn().mockReturnValue(true),
    distanceBetween: vi.fn((pos1, pos2) => {
      const dx = pos1.x - pos2.x;
      const dy = (pos1.y ?? 0) - (pos2.y ?? 0);
      const dz = pos1.z - pos2.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }),
    isClosestTeammateToPosition: vi.fn().mockReturnValue(true),
    getRoleBasedPosition: vi.fn().mockReturnValue({ x: 15, y: 1, z: 0 }),

    ...overrides,
  };
}

describe('AIStaminaManager', () => {
  let staminaManager: AIStaminaManager;

  beforeEach(() => {
    staminaManager = new AIStaminaManager();
  });

  // ── shouldConserveStamina ──────────────────────────────────────────
  describe('shouldConserveStamina', () => {
    // ── Role-specific thresholds ──
    it('goalkeeper: conserves at stamina < 20', () => {
      expect(staminaManager.shouldConserveStamina(19, 'goalkeeper')).toBe(true);
      expect(staminaManager.shouldConserveStamina(20, 'goalkeeper')).toBe(false);
      expect(staminaManager.shouldConserveStamina(21, 'goalkeeper')).toBe(false);
    });

    it('striker: conserves at stamina < 40', () => {
      expect(staminaManager.shouldConserveStamina(39, 'striker')).toBe(true);
      expect(staminaManager.shouldConserveStamina(40, 'striker')).toBe(false);
      expect(staminaManager.shouldConserveStamina(41, 'striker')).toBe(false);
    });

    it('central-midfielder-1: conserves at stamina < 35', () => {
      expect(staminaManager.shouldConserveStamina(34, 'central-midfielder-1')).toBe(true);
      expect(staminaManager.shouldConserveStamina(35, 'central-midfielder-1')).toBe(false);
      expect(staminaManager.shouldConserveStamina(36, 'central-midfielder-1')).toBe(false);
    });

    it('central-midfielder-2: conserves at stamina < 35', () => {
      expect(staminaManager.shouldConserveStamina(34, 'central-midfielder-2')).toBe(true);
      expect(staminaManager.shouldConserveStamina(35, 'central-midfielder-2')).toBe(false);
    });

    it('left-back: conserves at stamina < 25', () => {
      expect(staminaManager.shouldConserveStamina(24, 'left-back')).toBe(true);
      expect(staminaManager.shouldConserveStamina(25, 'left-back')).toBe(false);
      expect(staminaManager.shouldConserveStamina(26, 'left-back')).toBe(false);
    });

    it('right-back: conserves at stamina < 25', () => {
      expect(staminaManager.shouldConserveStamina(24, 'right-back')).toBe(true);
      expect(staminaManager.shouldConserveStamina(25, 'right-back')).toBe(false);
    });

    // ── Edge cases ──
    it('returns true when stamina is 0 for all roles', () => {
      const allRoles: SoccerAIRole[] = [
        'goalkeeper', 'left-back', 'right-back',
        'central-midfielder-1', 'central-midfielder-2', 'striker',
      ];

      for (const role of allRoles) {
        expect(staminaManager.shouldConserveStamina(0, role)).toBe(true);
      }
    });

    it('returns false when stamina is 100 for all roles', () => {
      const allRoles: SoccerAIRole[] = [
        'goalkeeper', 'left-back', 'right-back',
        'central-midfielder-1', 'central-midfielder-2', 'striker',
      ];

      for (const role of allRoles) {
        expect(staminaManager.shouldConserveStamina(100, role)).toBe(false);
      }
    });

    it('returns false at exactly the threshold value', () => {
      // At the threshold, stamina is NOT less than threshold, so returns false
      expect(staminaManager.shouldConserveStamina(20, 'goalkeeper')).toBe(false);
      expect(staminaManager.shouldConserveStamina(40, 'striker')).toBe(false);
      expect(staminaManager.shouldConserveStamina(35, 'central-midfielder-1')).toBe(false);
      expect(staminaManager.shouldConserveStamina(25, 'left-back')).toBe(false);
    });

    it('returns true at one below threshold', () => {
      expect(staminaManager.shouldConserveStamina(19, 'goalkeeper')).toBe(true);
      expect(staminaManager.shouldConserveStamina(39, 'striker')).toBe(true);
      expect(staminaManager.shouldConserveStamina(34, 'central-midfielder-1')).toBe(true);
      expect(staminaManager.shouldConserveStamina(24, 'left-back')).toBe(true);
    });

    it('handles fractional stamina values', () => {
      expect(staminaManager.shouldConserveStamina(19.9, 'goalkeeper')).toBe(true);
      expect(staminaManager.shouldConserveStamina(19.99, 'goalkeeper')).toBe(true);
      expect(staminaManager.shouldConserveStamina(20.01, 'goalkeeper')).toBe(false);
    });

    it('handles negative stamina values', () => {
      expect(staminaManager.shouldConserveStamina(-5, 'striker')).toBe(true);
    });

    it('striker has the highest conservation threshold', () => {
      // Striker conserves at < 40, which is the highest threshold
      const allRoles: SoccerAIRole[] = [
        'goalkeeper', 'left-back', 'right-back',
        'central-midfielder-1', 'central-midfielder-2', 'striker',
      ];

      for (const role of allRoles) {
        const threshold = staminaManager.getConservationThreshold(role);
        expect(threshold).toBeLessThanOrEqual(40);
      }
    });

    it('goalkeeper has the lowest conservation threshold', () => {
      const allRoles: SoccerAIRole[] = [
        'goalkeeper', 'left-back', 'right-back',
        'central-midfielder-1', 'central-midfielder-2', 'striker',
      ];

      for (const role of allRoles) {
        const threshold = staminaManager.getConservationThreshold(role);
        expect(threshold).toBeGreaterThanOrEqual(20);
      }
    });
  });

  // ── getConservationThreshold ───────────────────────────────────────
  describe('getConservationThreshold', () => {
    it('returns 20 for goalkeeper', () => {
      expect(staminaManager.getConservationThreshold('goalkeeper')).toBe(20);
    });

    it('returns 40 for striker', () => {
      expect(staminaManager.getConservationThreshold('striker')).toBe(40);
    });

    it('returns 35 for central-midfielder-1', () => {
      expect(staminaManager.getConservationThreshold('central-midfielder-1')).toBe(35);
    });

    it('returns 35 for central-midfielder-2', () => {
      expect(staminaManager.getConservationThreshold('central-midfielder-2')).toBe(35);
    });

    it('returns 25 for left-back', () => {
      expect(staminaManager.getConservationThreshold('left-back')).toBe(25);
    });

    it('returns 25 for right-back', () => {
      expect(staminaManager.getConservationThreshold('right-back')).toBe(25);
    });

    it('returns 30 for unknown role (default)', () => {
      expect(staminaManager.getConservationThreshold('unknown' as SoccerAIRole)).toBe(30);
    });

    it('threshold values are consistent with shouldConserveStamina', () => {
      const allRoles: SoccerAIRole[] = [
        'goalkeeper', 'left-back', 'right-back',
        'central-midfielder-1', 'central-midfielder-2', 'striker',
      ];

      for (const role of allRoles) {
        const threshold = staminaManager.getConservationThreshold(role);
        // At threshold - 1, should conserve
        expect(staminaManager.shouldConserveStamina(threshold - 1, role)).toBe(true);
        // At threshold, should NOT conserve
        expect(staminaManager.shouldConserveStamina(threshold, role)).toBe(false);
      }
    });
  });

  // ── handleStaminaConservation ──────────────────────────────────────
  describe('handleStaminaConservation', () => {
    // ── hasBall = true ──
    describe('when player has ball', () => {
      it('tries to pass the ball', () => {
        const passFn = vi.fn().mockReturnValue(true);
        const context = createMockContext({ passBall: passFn });
        const ballPos = { x: 20, y: 1, z: 10 };

        staminaManager.handleStaminaConservation(context, ballPos, true, 15);

        expect(passFn).toHaveBeenCalled();
      });

      it('returns current position after successful pass', () => {
        const myPos = { x: 10, y: 1, z: 5 };
        const context = createMockContext({
          position: myPos,
          passBall: vi.fn().mockReturnValue(true),
        });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 30, y: 1, z: 0 }, true, 10
        );

        expect(result.x).toBe(myPos.x);
        expect(result.y).toBe(myPos.y);
        expect(result.z).toBe(myPos.z);
      });

      it('returns current position even when pass fails (holds position)', () => {
        const myPos = { x: 10, y: 1, z: 5 };
        const context = createMockContext({
          position: myPos,
          passBall: vi.fn().mockReturnValue(false),
        });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 30, y: 1, z: 0 }, true, 10
        );

        expect(result.x).toBe(myPos.x);
        expect(result.y).toBe(myPos.y);
        expect(result.z).toBe(myPos.z);
      });

      it('does not check distance to ball when has ball', () => {
        const distFn = vi.fn().mockReturnValue(100);
        const context = createMockContext({ distanceBetween: distFn });

        staminaManager.handleStaminaConservation(
          context, { x: 100, y: 1, z: 100 }, true, 10
        );

        // distanceBetween should NOT be called when hasBall is true
        expect(distFn).not.toHaveBeenCalled();
      });
    });

    // ── hasBall = false ──
    describe('when player does not have ball', () => {
      it('pursues ball when close, random allows it, and is closest teammate', () => {
        // Force Math.random to return a low value (always allows pursuit)
        vi.spyOn(Math, 'random').mockReturnValue(0.01);

        const myPos = { x: 10, y: 1, z: 0 };
        const ballPos = { x: 14, y: 1, z: 0 }; // distance = 4, < 8

        const context = createMockContext({
          position: myPos,
          aiRole: 'striker', // High pursuit tendency
          isClosestTeammateToPosition: vi.fn().mockReturnValue(true),
        });

        const result = staminaManager.handleStaminaConservation(
          context, ballPos, false, 50
        );

        // Should return ball position when pursuing
        expect(result.x).toBe(ballPos.x);
        expect(result.y).toBe(ballPos.y);
        expect(result.z).toBe(ballPos.z);

        vi.restoreAllMocks();
      });

      it('does not pursue when ball is far away (> 8 units)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.01);

        const myPos = { x: 0, y: 1, z: 0 };
        const ballPos = { x: 50, y: 1, z: 0 }; // distance = 50, > 8

        const formationPos = { x: 15, y: 1, z: 0 };
        const context = createMockContext({
          position: myPos,
          getRoleBasedPosition: vi.fn().mockReturnValue(formationPos),
          isClosestTeammateToPosition: vi.fn().mockReturnValue(true),
        });

        const result = staminaManager.handleStaminaConservation(
          context, ballPos, false, 50
        );

        // Should NOT return ball position - should move toward formation
        expect(result.x).not.toBe(ballPos.x);

        vi.restoreAllMocks();
      });

      it('does not pursue when not closest teammate', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.01);

        const myPos = { x: 10, y: 1, z: 0 };
        const ballPos = { x: 14, y: 1, z: 0 }; // close enough

        const formationPos = { x: 20, y: 1, z: 5 };
        const context = createMockContext({
          position: myPos,
          isClosestTeammateToPosition: vi.fn().mockReturnValue(false),
          getRoleBasedPosition: vi.fn().mockReturnValue(formationPos),
        });

        const result = staminaManager.handleStaminaConservation(
          context, ballPos, false, 50
        );

        // Should NOT return ball position
        expect(result.x).not.toBe(ballPos.x);

        vi.restoreAllMocks();
      });

      it('holds position when close to formation (< 3 units)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99); // Prevent pursuit

        const myPos = { x: 10, y: 1, z: 5 };
        const formationPos = { x: 11, y: 1, z: 5.5 }; // distance ~1.1, < 3

        const context = createMockContext({
          position: myPos,
          isClosestTeammateToPosition: vi.fn().mockReturnValue(false),
          getRoleBasedPosition: vi.fn().mockReturnValue(formationPos),
        });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 50, y: 1, z: 50 }, false, 30
        );

        // Should hold current position for recovery
        expect(result.x).toBe(myPos.x);
        expect(result.y).toBe(myPos.y);
        expect(result.z).toBe(myPos.z);

        vi.restoreAllMocks();
      });

      it('moves toward formation position when far from it', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99); // Prevent pursuit

        const myPos = { x: 0, y: 1, z: 0 };
        const formationPos = { x: 20, y: 1, z: 0 }; // distance = 20, > 3

        const context = createMockContext({
          position: myPos,
          isClosestTeammateToPosition: vi.fn().mockReturnValue(false),
          getRoleBasedPosition: vi.fn().mockReturnValue(formationPos),
        });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 50, y: 1, z: 50 }, false, 30
        );

        // Should move in the direction of formation, but limited to 2 units
        expect(result.x).toBeGreaterThan(myPos.x);
        expect(result.x).toBeLessThanOrEqual(myPos.x + 2);
        expect(result.y).toBe(myPos.y);

        vi.restoreAllMocks();
      });

      it('limits movement to 2 units per step', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);

        const myPos = { x: 0, y: 1, z: 0 };
        const formationPos = { x: 100, y: 1, z: 0 }; // Very far

        const context = createMockContext({
          position: myPos,
          isClosestTeammateToPosition: vi.fn().mockReturnValue(false),
          getRoleBasedPosition: vi.fn().mockReturnValue(formationPos),
        });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 50, y: 1, z: 50 }, false, 30
        );

        // Movement should be capped at 2 units
        const dx = result.x - myPos.x;
        const dz = result.z - myPos.z;
        const moveDistance = Math.sqrt(dx * dx + dz * dz);

        expect(moveDistance).toBeCloseTo(2, 1);

        vi.restoreAllMocks();
      });

      it('moves in correct direction toward formation', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);

        const myPos = { x: 0, y: 1, z: 0 };
        const formationPos = { x: 0, y: 1, z: 20 }; // Directly along Z axis

        const context = createMockContext({
          position: myPos,
          isClosestTeammateToPosition: vi.fn().mockReturnValue(false),
          getRoleBasedPosition: vi.fn().mockReturnValue(formationPos),
        });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 50, y: 1, z: 50 }, false, 30
        );

        // Should move along Z axis (x stays ~0, z increases)
        expect(result.x).toBeCloseTo(0, 5);
        expect(result.z).toBeGreaterThan(0);

        vi.restoreAllMocks();
      });

      it('holds position when formation is very close (< 0.1 distance)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);

        const myPos = { x: 10, y: 1, z: 5 };
        const formationPos = { x: 10.01, y: 1, z: 5.01 }; // distance ~0.014

        const context = createMockContext({
          position: myPos,
          isClosestTeammateToPosition: vi.fn().mockReturnValue(false),
          getRoleBasedPosition: vi.fn().mockReturnValue(formationPos),
        });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 50, y: 1, z: 50 }, false, 30
        );

        // Should hold position (distance < 0.1 check in the else branch)
        // Actually distance < 3 triggers the first branch (hold position)
        expect(result.x).toBe(myPos.x);
        expect(result.y).toBe(myPos.y);
        expect(result.z).toBe(myPos.z);

        vi.restoreAllMocks();
      });
    });

    // ── Stamina-dependent behavior ──
    describe('stamina-dependent behavior', () => {
      it('very low stamina reduces pursuit tendency significantly', () => {
        // With 1% stamina, staminaFactor = max(0.1, 0.01) = 0.1
        // adjustedPursuit = 0.6 * 0.1 = 0.06
        // Math.random() is called first for logging (line 85: if random < 0.02),
        // then for pursuit (line 118: if random < adjustedPursuitTendency)
        // We need the pursuit random to be > 0.06 to prevent pursuit
        const randomSpy = vi.spyOn(Math, 'random');
        randomSpy
          .mockReturnValueOnce(0.5)   // First call: logging check (0.5 > 0.02, no log)
          .mockReturnValueOnce(0.1);  // Second call: pursuit check (0.1 > 0.06, no pursuit)

        const myPos = { x: 10, y: 1, z: 0 };
        const ballPos = { x: 14, y: 1, z: 0 }; // Close enough (dist=4 < 8)

        const formationPos = { x: 20, y: 1, z: 0 };
        const context = createMockContext({
          position: myPos,
          aiRole: 'striker', // pursuitTendency = 0.6
          isClosestTeammateToPosition: vi.fn().mockReturnValue(true),
          getRoleBasedPosition: vi.fn().mockReturnValue(formationPos),
        });

        const result = staminaManager.handleStaminaConservation(
          context, ballPos, false, 1
        );

        // With pursuit denied by random check, should move to formation, not pursue
        expect(result.x).not.toBe(ballPos.x);

        vi.restoreAllMocks();
      });

      it('higher stamina allows more aggressive pursuit', () => {
        // With 80% stamina, staminaFactor = 0.8, adjustedPursuit = 0.6 * 0.8 = 0.48
        vi.spyOn(Math, 'random').mockReturnValue(0.1); // Low enough to pass 0.48

        const myPos = { x: 10, y: 1, z: 0 };
        const ballPos = { x: 14, y: 1, z: 0 }; // Close

        const context = createMockContext({
          position: myPos,
          aiRole: 'striker',
          isClosestTeammateToPosition: vi.fn().mockReturnValue(true),
        });

        const result = staminaManager.handleStaminaConservation(
          context, ballPos, false, 80
        );

        // Should pursue ball
        expect(result.x).toBe(ballPos.x);

        vi.restoreAllMocks();
      });

      it('stamina factor is clamped to minimum 0.1', () => {
        // Even at 0% stamina, staminaFactor should be Math.max(0.1, 0/100) = 0.1
        // For striker: adjustedPursuit = 0.6 * 0.1 = 0.06
        vi.spyOn(Math, 'random').mockReturnValue(0.01); // Very low -> should pass 0.06

        const myPos = { x: 10, y: 1, z: 0 };
        const ballPos = { x: 14, y: 1, z: 0 };

        const context = createMockContext({
          position: myPos,
          aiRole: 'striker',
          isClosestTeammateToPosition: vi.fn().mockReturnValue(true),
        });

        const result = staminaManager.handleStaminaConservation(
          context, ballPos, false, 0
        );

        // With random=0.01 < 0.06, should still pursue
        expect(result.x).toBe(ballPos.x);

        vi.restoreAllMocks();
      });
    });

    // ── Return value structure ──
    describe('return value', () => {
      it('always returns an object with x, y, z', () => {
        const context = createMockContext();
        const ballPos = { x: 20, y: 1, z: 10 };

        const result = staminaManager.handleStaminaConservation(
          context, ballPos, false, 50
        );

        expect(result).toHaveProperty('x');
        expect(result).toHaveProperty('y');
        expect(result).toHaveProperty('z');
        expect(typeof result.x).toBe('number');
        expect(typeof result.y).toBe('number');
        expect(typeof result.z).toBe('number');
      });

      it('preserves y coordinate from context position', () => {
        const context = createMockContext({
          position: { x: 10, y: 3.5, z: 5 },
        });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 20, y: 1, z: 10 }, true, 30
        );

        expect(result.y).toBe(3.5);
      });

      it('returns a new object, not the context position reference', () => {
        const myPos = { x: 10, y: 1, z: 5 };
        const context = createMockContext({ position: myPos });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 20, y: 1, z: 10 }, true, 30
        );

        // Should be equal in values but a different object
        expect(result).toEqual(myPos);
        expect(result).not.toBe(myPos);
      });
    });

    // ── Calls to context methods ──
    describe('context method calls', () => {
      it('calls getRoleBasedPosition when not pursuing', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);

        const getRoleFn = vi.fn().mockReturnValue({ x: 15, y: 1, z: 0 });
        const context = createMockContext({
          getRoleBasedPosition: getRoleFn,
          isClosestTeammateToPosition: vi.fn().mockReturnValue(false),
        });

        staminaManager.handleStaminaConservation(
          context, { x: 50, y: 1, z: 50 }, false, 50
        );

        expect(getRoleFn).toHaveBeenCalled();

        vi.restoreAllMocks();
      });

      it('calls isClosestTeammateToPosition when ball is close', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.01);

        const closestFn = vi.fn().mockReturnValue(false);
        const context = createMockContext({
          position: { x: 10, y: 1, z: 0 },
          aiRole: 'striker',
          isClosestTeammateToPosition: closestFn,
          getRoleBasedPosition: vi.fn().mockReturnValue({ x: 15, y: 1, z: 0 }),
        });

        const ballPos = { x: 14, y: 1, z: 0 }; // dist = 4, < 8

        staminaManager.handleStaminaConservation(context, ballPos, false, 50);

        expect(closestFn).toHaveBeenCalledWith(ballPos);

        vi.restoreAllMocks();
      });

      it('calls distanceBetween to check ball distance and formation distance', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);

        const distFn = vi.fn().mockReturnValue(20);
        const context = createMockContext({
          distanceBetween: distFn,
          isClosestTeammateToPosition: vi.fn().mockReturnValue(false),
          getRoleBasedPosition: vi.fn().mockReturnValue({ x: 30, y: 1, z: 0 }),
        });

        staminaManager.handleStaminaConservation(
          context, { x: 40, y: 1, z: 0 }, false, 50
        );

        // Should call distanceBetween at least twice:
        // 1. to check distanceToBall
        // 2. to check distanceToFormation
        expect(distFn).toHaveBeenCalledTimes(2);

        vi.restoreAllMocks();
      });
    });

    // ── Diagonal movement ──
    describe('diagonal movement toward formation', () => {
      it('moves diagonally when formation is offset in both x and z', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);

        const myPos = { x: 0, y: 1, z: 0 };
        const formationPos = { x: 20, y: 1, z: 20 }; // 45 degrees

        const context = createMockContext({
          position: myPos,
          isClosestTeammateToPosition: vi.fn().mockReturnValue(false),
          getRoleBasedPosition: vi.fn().mockReturnValue(formationPos),
        });

        const result = staminaManager.handleStaminaConservation(
          context, { x: 50, y: 1, z: 50 }, false, 30
        );

        // Both x and z should increase (moving diagonally)
        expect(result.x).toBeGreaterThan(0);
        expect(result.z).toBeGreaterThan(0);

        // Total movement should be capped at 2 units
        const dx = result.x - myPos.x;
        const dz = result.z - myPos.z;
        const totalMove = Math.sqrt(dx * dx + dz * dz);
        expect(totalMove).toBeCloseTo(2, 1);

        // At 45 degrees, x and z components should be equal
        expect(result.x).toBeCloseTo(result.z, 5);

        vi.restoreAllMocks();
      });
    });
  });
});
