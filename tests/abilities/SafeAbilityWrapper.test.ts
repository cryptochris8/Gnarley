import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock hytopia SDK to prevent real SDK initialization
vi.mock('hytopia', () => ({
  Entity: class {},
  Vector3: class { constructor(public x = 0, public y = 0, public z = 0) {} },
  RigidBodyType: { DYNAMIC: 0, FIXED: 1, KINEMATIC_POSITION: 2, KINEMATIC_VELOCITY: 3 },
  ColliderShape: { BLOCK: 0, BALL: 1, CAPSULE: 2 },
  CollisionGroup: { BLOCK: 1, ENTITY: 2 },
  BlockType: {},
  PlayerEntity: class {},
  DefaultPlayerEntity: class {},
  Quaternion: class { constructor(public x = 0, public y = 0, public z = 0, public w = 1) {} },
  EntityEvent: {},
  EntityModelAnimationLoopMode: { LOOP: 0, ONCE: 1 },
  PlayerEvent: {},
  Player: class {},
}));

// Mock SoccerPlayerEntity to break the import chain (SafeAbilityWrapper imports it directly)
vi.mock('../../entities/SoccerPlayerEntity', () => ({
  default: class MockSoccerPlayerEntity {},
}));

import { SafeAbilityWrapper } from '../../abilities/SafeAbilityWrapper';

// ----- Helpers ---------------------------------------------------------------

function createMockAbility() {
  return {
    use: vi.fn(),
    getIcon: vi.fn().mockReturnValue('test'),
  };
}

/**
 * A plain-object source entity mock.
 * NOT a SoccerPlayerEntity instance, so the `instanceof` check in
 * validateEntity will skip player-specific validations and return true.
 */
function createMockSourceEntity() {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    isSpawned: true,
    world: {},
  } as any;
}

function validOrigin() {
  return { x: 1, y: 2, z: 3 };
}

function validDirection() {
  return { x: 0, y: 0, z: 1 };
}

// ----- Tests -----------------------------------------------------------------

describe('SafeAbilityWrapper', () => {
  // ── Null / undefined ability ──────────────────────────────────
  describe('null ability guard', () => {
    it('returns false for null ability', () => {
      const result = SafeAbilityWrapper.safeExecute(
        null,
        validOrigin(),
        validDirection(),
        createMockSourceEntity(),
      );
      expect(result).toBe(false);
    });

    it('returns false for undefined ability', () => {
      const result = SafeAbilityWrapper.safeExecute(
        undefined,
        validOrigin(),
        validDirection(),
        createMockSourceEntity(),
      );
      expect(result).toBe(false);
    });
  });

  // ── Null / undefined source ───────────────────────────────────
  describe('null source guard', () => {
    it('returns false for null source', () => {
      const result = SafeAbilityWrapper.safeExecute(
        createMockAbility() as any,
        validOrigin(),
        validDirection(),
        null as any,
      );
      expect(result).toBe(false);
    });

    it('returns false for undefined source', () => {
      const result = SafeAbilityWrapper.safeExecute(
        createMockAbility() as any,
        validOrigin(),
        validDirection(),
        undefined as any,
      );
      expect(result).toBe(false);
    });
  });

  // ── Vector validation ─────────────────────────────────────────
  describe('vector validation', () => {
    it('returns false when origin contains NaN', () => {
      const result = SafeAbilityWrapper.safeExecute(
        createMockAbility() as any,
        { x: NaN, y: 0, z: 0 },
        validDirection(),
        createMockSourceEntity(),
      );
      expect(result).toBe(false);
    });

    it('returns false when direction contains NaN', () => {
      const result = SafeAbilityWrapper.safeExecute(
        createMockAbility() as any,
        validOrigin(),
        { x: 0, y: NaN, z: 0 },
        createMockSourceEntity(),
      );
      expect(result).toBe(false);
    });

    it('returns false for null origin', () => {
      const result = SafeAbilityWrapper.safeExecute(
        createMockAbility() as any,
        null as any,
        validDirection(),
        createMockSourceEntity(),
      );
      expect(result).toBe(false);
    });

    it('returns false for null direction', () => {
      const result = SafeAbilityWrapper.safeExecute(
        createMockAbility() as any,
        validOrigin(),
        null as any,
        createMockSourceEntity(),
      );
      expect(result).toBe(false);
    });

    it('returns false when origin has non-numeric values', () => {
      const result = SafeAbilityWrapper.safeExecute(
        createMockAbility() as any,
        { x: 'bad' as any, y: 0, z: 0 },
        validDirection(),
        createMockSourceEntity(),
      );
      expect(result).toBe(false);
    });
  });

  // ── Successful execution ──────────────────────────────────────
  describe('successful execution', () => {
    it('returns true when all parameters are valid', () => {
      const ability = createMockAbility();
      const result = SafeAbilityWrapper.safeExecute(
        ability as any,
        validOrigin(),
        validDirection(),
        createMockSourceEntity(),
      );
      expect(result).toBe(true);
    });

    it('calls ability.use() on success', () => {
      const ability = createMockAbility();
      SafeAbilityWrapper.safeExecute(
        ability as any,
        validOrigin(),
        validDirection(),
        createMockSourceEntity(),
      );
      expect(ability.use).toHaveBeenCalledTimes(1);
    });

    it('passes cloned vectors to ability.use() (not the original references)', () => {
      const ability = createMockAbility();
      const origin = validOrigin();
      const direction = validDirection();

      SafeAbilityWrapper.safeExecute(
        ability as any,
        origin,
        direction,
        createMockSourceEntity(),
      );

      const callArgs = ability.use.mock.calls[0];
      const passedOrigin = callArgs[0];
      const passedDirection = callArgs[1];

      // Values should match
      expect(passedOrigin).toEqual(origin);
      expect(passedDirection).toEqual(direction);

      // References should differ (cloned via spread)
      expect(passedOrigin).not.toBe(origin);
      expect(passedDirection).not.toBe(direction);
    });
  });

  // ── Exception handling ────────────────────────────────────────
  describe('exception handling', () => {
    it('returns false if ability.use() throws', () => {
      const ability = createMockAbility();
      ability.use.mockImplementation(() => {
        throw new Error('Ability execution failed');
      });

      const result = SafeAbilityWrapper.safeExecute(
        ability as any,
        validOrigin(),
        validDirection(),
        createMockSourceEntity(),
      );
      expect(result).toBe(false);
    });

    it('does not propagate the exception', () => {
      const ability = createMockAbility();
      ability.use.mockImplementation(() => {
        throw new Error('Crash!');
      });

      expect(() =>
        SafeAbilityWrapper.safeExecute(
          ability as any,
          validOrigin(),
          validDirection(),
          createMockSourceEntity(),
        ),
      ).not.toThrow();
    });
  });
});
