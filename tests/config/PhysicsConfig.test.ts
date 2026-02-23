import { describe, it, expect } from 'vitest';
import {
  MOVEMENT_PHYSICS,
  BALL_PHYSICS,
  GOALKEEPER_PHYSICS,
  POWER_MECHANICS,
  GAMEPLAY_MECHANICS,
  COLLISION_GROUPS,
  PHYSICS_CONFIG,
} from '../../config/PhysicsConfig';

describe('PhysicsConfig', () => {
  // ── Movement Physics ──────────────────────────────────────────
  describe('MOVEMENT_PHYSICS', () => {
    it('has positive proportional gain', () => {
      expect(MOVEMENT_PHYSICS.PROPORTIONAL_GAIN).toBeGreaterThan(0);
    });

    it('max velocity error is reasonable', () => {
      expect(MOVEMENT_PHYSICS.MAX_VELOCITY_ERROR).toBeGreaterThan(0);
      expect(MOVEMENT_PHYSICS.MAX_VELOCITY_ERROR).toBeLessThan(100);
    });

    it('damping factor is between 0 and 1', () => {
      expect(MOVEMENT_PHYSICS.DAMPING_FACTOR).toBeGreaterThan(0);
      expect(MOVEMENT_PHYSICS.DAMPING_FACTOR).toBeLessThanOrEqual(1);
    });

    it('max velocity prevents instability', () => {
      expect(MOVEMENT_PHYSICS.MAX_VELOCITY).toBeGreaterThan(0);
      expect(MOVEMENT_PHYSICS.MAX_VELOCITY).toBeLessThanOrEqual(50);
    });
  });

  // ── Ball Physics ──────────────────────────────────────────────
  describe('BALL_PHYSICS', () => {
    it('shot force is positive and reasonable', () => {
      expect(BALL_PHYSICS.SHOT_FORCE).toBeGreaterThan(0);
      expect(BALL_PHYSICS.SHOT_FORCE).toBeLessThan(50);
    });

    it('tackle force is stronger than shot force', () => {
      expect(BALL_PHYSICS.TACKLE_FORCE).toBeGreaterThan(BALL_PHYSICS.SHOT_FORCE);
    });

    it('tackle duration is in reasonable range (ms)', () => {
      expect(BALL_PHYSICS.TACKLE_DURATION).toBeGreaterThan(100);
      expect(BALL_PHYSICS.TACKLE_DURATION).toBeLessThan(5000);
    });

    it('ball stuck check interval is reasonable', () => {
      expect(BALL_PHYSICS.BALL_STUCK_CHECK_INTERVAL).toBeGreaterThan(500);
      expect(BALL_PHYSICS.BALL_STUCK_TIME_THRESHOLD).toBeGreaterThan(BALL_PHYSICS.BALL_STUCK_CHECK_INTERVAL);
    });
  });

  // ── Goalkeeper Physics ────────────────────────────────────────
  describe('GOALKEEPER_PHYSICS', () => {
    it('header range is positive', () => {
      expect(GOALKEEPER_PHYSICS.HEADER_RANGE).toBeGreaterThan(0);
    });

    it('high ball threshold is below max header height', () => {
      expect(GOALKEEPER_PHYSICS.HIGH_BALL_THRESHOLD).toBeLessThan(GOALKEEPER_PHYSICS.MAX_HEADER_HEIGHT);
    });

    it('jump boost is positive', () => {
      expect(GOALKEEPER_PHYSICS.JUMP_BOOST).toBeGreaterThan(0);
    });

    it('header force is stronger than horizontal force', () => {
      expect(GOALKEEPER_PHYSICS.HEADER_FORCE).toBeGreaterThan(GOALKEEPER_PHYSICS.HORIZONTAL_HEADER_FORCE);
    });
  });

  // ── Power Mechanics ───────────────────────────────────────────
  describe('POWER_MECHANICS', () => {
    it('max charge power exceeds base charge power', () => {
      expect(POWER_MECHANICS.MAX_CHARGE_POWER).toBeGreaterThan(POWER_MECHANICS.BASE_CHARGE_POWER);
    });

    it('pass power is positive', () => {
      expect(POWER_MECHANICS.BASE_PASS_POWER).toBeGreaterThan(0);
    });
  });

  // ── Gameplay Mechanics ────────────────────────────────────────
  describe('GAMEPLAY_MECHANICS', () => {
    it('optimal pass distance is positive', () => {
      expect(GAMEPLAY_MECHANICS.OPTIMAL_PASS_DISTANCE).toBeGreaterThan(0);
    });

    it('rotation update interval is in reasonable range', () => {
      expect(GAMEPLAY_MECHANICS.ROTATION_UPDATE_INTERVAL).toBeGreaterThanOrEqual(16);
      expect(GAMEPLAY_MECHANICS.ROTATION_UPDATE_INTERVAL).toBeLessThanOrEqual(500);
    });

    it('shot random factor is between 0 and 1', () => {
      expect(GAMEPLAY_MECHANICS.SHOT_RANDOM_FACTOR).toBeGreaterThanOrEqual(0);
      expect(GAMEPLAY_MECHANICS.SHOT_RANDOM_FACTOR).toBeLessThanOrEqual(1);
    });
  });

  // ── Collision Groups ──────────────────────────────────────────
  describe('COLLISION_GROUPS', () => {
    it('all groups are distinct power-of-2 values', () => {
      const groups = Object.values(COLLISION_GROUPS);
      const uniqueGroups = new Set(groups);
      expect(uniqueGroups.size).toBe(groups.length);

      for (const g of groups) {
        expect(g).toBeGreaterThan(0);
        // Check it's a power of 2
        expect(g & (g - 1)).toBe(0);
      }
    });
  });

  // ── Combined config ───────────────────────────────────────────
  describe('PHYSICS_CONFIG', () => {
    it('contains all subcategories', () => {
      expect(PHYSICS_CONFIG.MOVEMENT).toBeDefined();
      expect(PHYSICS_CONFIG.BALL).toBeDefined();
      expect(PHYSICS_CONFIG.GOALKEEPER).toBeDefined();
      expect(PHYSICS_CONFIG.POWER).toBeDefined();
      expect(PHYSICS_CONFIG.GAMEPLAY).toBeDefined();
      expect(PHYSICS_CONFIG.COLLISION_GROUPS).toBeDefined();
    });
  });
});
