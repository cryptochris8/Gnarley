import { describe, it, expect } from 'vitest';
import {
  GAME_CONFIG,
  getGameConfig,
  BALL_SPAWN_POSITION,
  SAFE_SPAWN_Y,
  FIELD_MIN_X,
  FIELD_MAX_X,
  FIELD_MIN_Y,
  FIELD_MAX_Y,
  FIELD_MIN_Z,
  FIELD_MAX_Z,
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_FIELD_CENTER_X,
  AI_FIELD_CENTER_Z,
  AI_DEFENSIVE_OFFSET_X,
  AI_MIDFIELD_OFFSET_X,
  AI_FORWARD_OFFSET_X,
  AI_WIDE_Z_BOUNDARY_MAX,
  AI_WIDE_Z_BOUNDARY_MIN,
  AI_MIDFIELD_Z_BOUNDARY_MAX,
  AI_MIDFIELD_Z_BOUNDARY_MIN,
  MAX_PLAYERS_PER_TEAM,
  GOAL_WIDTH,
  GOAL_HEIGHT,
  HALF_DURATION,
  TOTAL_HALVES,
  MATCH_DURATION,
  HALFTIME_DURATION,
  PASS_FORCE,
  STUN_DURATION,
  TACKLE_KNOCKBACK_FORCE,
  BALL_CONFIG,
  ABILITY_RESPAWN_TIME,
  ABILITY_PICKUP_POSITIONS,
} from '../../state/gameConfig';

describe('gameConfig', () => {
  // ── Field Dimensions ──────────────────────────────────────────
  describe('field dimensions', () => {
    it('field X range is valid (min < max)', () => {
      expect(FIELD_MIN_X).toBeLessThan(FIELD_MAX_X);
    });

    it('field Z range is valid (min < max)', () => {
      expect(FIELD_MIN_Z).toBeLessThan(FIELD_MAX_Z);
    });

    it('field Y range is valid', () => {
      expect(FIELD_MIN_Y).toBeLessThan(FIELD_MAX_Y);
    });

    it('goal lines are within field X boundaries', () => {
      expect(AI_GOAL_LINE_X_RED).toBeLessThanOrEqual(FIELD_MAX_X);
      expect(AI_GOAL_LINE_X_BLUE).toBeGreaterThanOrEqual(FIELD_MIN_X);
    });

    it('field center is between field boundaries', () => {
      expect(AI_FIELD_CENTER_X).toBeGreaterThan(FIELD_MIN_X);
      expect(AI_FIELD_CENTER_X).toBeLessThan(FIELD_MAX_X);
      expect(AI_FIELD_CENTER_Z).toBeGreaterThan(FIELD_MIN_Z);
      expect(AI_FIELD_CENTER_Z).toBeLessThan(FIELD_MAX_Z);
    });

    it('field center X is approximately midpoint', () => {
      const midpoint = (FIELD_MIN_X + FIELD_MAX_X) / 2;
      expect(Math.abs(AI_FIELD_CENTER_X - midpoint)).toBeLessThan(2);
    });
  });

  // ── Ball Spawn ────────────────────────────────────────────────
  describe('ball spawn', () => {
    it('spawns within field boundaries (X and Z)', () => {
      expect(BALL_SPAWN_POSITION.x).toBeGreaterThanOrEqual(FIELD_MIN_X);
      expect(BALL_SPAWN_POSITION.x).toBeLessThanOrEqual(FIELD_MAX_X);
      expect(BALL_SPAWN_POSITION.z).toBeGreaterThanOrEqual(FIELD_MIN_Z);
      expect(BALL_SPAWN_POSITION.z).toBeLessThanOrEqual(FIELD_MAX_Z);
    });

    it('spawns above ground level', () => {
      expect(BALL_SPAWN_POSITION.y).toBeGreaterThan(0);
    });

    it('spawns near center', () => {
      expect(Math.abs(BALL_SPAWN_POSITION.x - AI_FIELD_CENTER_X)).toBeLessThan(2);
    });
  });

  // ── AI Positioning ────────────────────────────────────────────
  describe('AI positioning constants', () => {
    it('defensive offset is smallest', () => {
      expect(AI_DEFENSIVE_OFFSET_X).toBeLessThan(AI_MIDFIELD_OFFSET_X);
    });

    it('midfield offset is between defensive and forward', () => {
      expect(AI_MIDFIELD_OFFSET_X).toBeGreaterThan(AI_DEFENSIVE_OFFSET_X);
      expect(AI_MIDFIELD_OFFSET_X).toBeLessThan(AI_FORWARD_OFFSET_X);
    });

    it('Z boundaries are symmetric enough for wide players', () => {
      expect(AI_WIDE_Z_BOUNDARY_MIN).toBeLessThan(0);
      expect(AI_WIDE_Z_BOUNDARY_MAX).toBeGreaterThan(0);
    });

    it('midfield Z boundaries are within wide boundaries', () => {
      expect(AI_MIDFIELD_Z_BOUNDARY_MIN).toBeGreaterThanOrEqual(AI_WIDE_Z_BOUNDARY_MIN);
      expect(AI_MIDFIELD_Z_BOUNDARY_MAX).toBeLessThanOrEqual(AI_WIDE_Z_BOUNDARY_MAX);
    });
  });

  // ── Game Timing ───────────────────────────────────────────────
  describe('game timing', () => {
    it('half duration is positive', () => {
      expect(HALF_DURATION).toBeGreaterThan(0);
    });

    it('total halves is 2', () => {
      expect(TOTAL_HALVES).toBe(2);
    });

    it('match duration equals total halves * half duration', () => {
      expect(MATCH_DURATION).toBe(TOTAL_HALVES * HALF_DURATION);
    });

    it('halftime is positive', () => {
      expect(HALFTIME_DURATION).toBeGreaterThan(0);
    });
  });

  // ── Ball Config ───────────────────────────────────────────────
  describe('ball config', () => {
    it('ball scale is positive and small', () => {
      expect(BALL_CONFIG.SCALE).toBeGreaterThan(0);
      expect(BALL_CONFIG.SCALE).toBeLessThan(1);
    });

    it('friction is between 0 and 1', () => {
      expect(BALL_CONFIG.FRICTION).toBeGreaterThanOrEqual(0);
      expect(BALL_CONFIG.FRICTION).toBeLessThanOrEqual(1);
    });

    it('damping values are positive', () => {
      expect(BALL_CONFIG.LINEAR_DAMPING).toBeGreaterThan(0);
      expect(BALL_CONFIG.ANGULAR_DAMPING).toBeGreaterThan(0);
    });

    it('impact forces are positive', () => {
      expect(BALL_CONFIG.HORIZONTAL_FORCE).toBeGreaterThan(0);
      expect(BALL_CONFIG.VERTICAL_FORCE).toBeGreaterThan(0);
      expect(BALL_CONFIG.UPWARD_BIAS).toBeGreaterThan(0);
    });
  });

  // ── Gameplay Constants ────────────────────────────────────────
  describe('gameplay constants', () => {
    it('pass force is positive', () => {
      expect(PASS_FORCE).toBeGreaterThan(0);
    });

    it('stun duration is in reasonable range (ms)', () => {
      expect(STUN_DURATION).toBeGreaterThan(0);
      expect(STUN_DURATION).toBeLessThan(10000);
    });

    it('tackle knockback force is positive', () => {
      expect(TACKLE_KNOCKBACK_FORCE).toBeGreaterThan(0);
    });

    it('max players per team is reasonable', () => {
      expect(MAX_PLAYERS_PER_TEAM).toBeGreaterThanOrEqual(1);
      expect(MAX_PLAYERS_PER_TEAM).toBeLessThanOrEqual(11);
    });

    it('goal dimensions are positive', () => {
      expect(GOAL_WIDTH).toBeGreaterThan(0);
      expect(GOAL_HEIGHT).toBeGreaterThan(0);
    });
  });

  // ── Abilities ─────────────────────────────────────────────────
  describe('ability config', () => {
    it('respawn time is positive', () => {
      expect(ABILITY_RESPAWN_TIME).toBeGreaterThan(0);
    });

    it('pickup positions are within field bounds', () => {
      for (const pos of ABILITY_PICKUP_POSITIONS) {
        expect(pos.x).toBeGreaterThanOrEqual(FIELD_MIN_X);
        expect(pos.x).toBeLessThanOrEqual(FIELD_MAX_X);
        expect(pos.z).toBeGreaterThanOrEqual(FIELD_MIN_Z);
        expect(pos.z).toBeLessThanOrEqual(FIELD_MAX_Z);
      }
    });

    it('pickup positions have positive Y', () => {
      for (const pos of ABILITY_PICKUP_POSITIONS) {
        expect(pos.y).toBeGreaterThan(0);
      }
    });
  });

  // ── Getter ────────────────────────────────────────────────────
  describe('getGameConfig', () => {
    it('returns the GAME_CONFIG object', () => {
      expect(getGameConfig()).toBe(GAME_CONFIG);
    });
  });

  // ── Safe Spawn Y ──────────────────────────────────────────────
  describe('safe spawn Y', () => {
    it('is above ground level', () => {
      expect(SAFE_SPAWN_Y).toBeGreaterThan(0);
    });
  });
});
