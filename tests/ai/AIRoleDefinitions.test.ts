import { describe, it, expect } from 'vitest';
import {
  ROLE_DEFINITIONS,
  TEAMMATE_REPULSION_DISTANCE,
  TEAMMATE_REPULSION_STRENGTH,
  POSITION_DISCIPLINE_FACTOR,
  GOALKEEPER_PURSUIT_DISTANCE,
  DEFENDER_PURSUIT_DISTANCE,
  MIDFIELDER_PURSUIT_DISTANCE,
  STRIKER_PURSUIT_DISTANCE,
  ROLE_PURSUIT_PROBABILITY,
  POSITION_RECOVERY_MULTIPLIER,
  SHOT_ARC_FACTOR,
  PASS_ARC_FACTOR,
  PASS_FORCE,
  SHOT_FORCE,
  KICKOFF_SPACING_MULTIPLIER,
  CENTER_AVOIDANCE_RADIUS,
  getPursuitDistanceForRole,
} from '../../entities/ai/AIRoleDefinitions';
import type { SoccerAIRole } from '../../entities/ai/AIRoleDefinitions';

const ALL_ROLES: SoccerAIRole[] = [
  'goalkeeper',
  'left-back',
  'right-back',
  'central-midfielder-1',
  'central-midfielder-2',
  'striker',
];

describe('AIRoleDefinitions', () => {
  // ── Role Definitions ──────────────────────────────────────────
  describe('ROLE_DEFINITIONS', () => {
    it('has definitions for all 6 roles', () => {
      for (const role of ALL_ROLES) {
        expect(ROLE_DEFINITIONS[role]).toBeDefined();
      }
    });

    it('each role has required properties', () => {
      for (const role of ALL_ROLES) {
        const def = ROLE_DEFINITIONS[role];
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.primaryDuties.length).toBeGreaterThan(0);
        expect(def.defensiveContribution).toBeGreaterThanOrEqual(0);
        expect(def.offensiveContribution).toBeGreaterThanOrEqual(0);
        expect(def.preferredArea).toBeDefined();
        expect(def.pursuitTendency).toBeGreaterThanOrEqual(0);
        expect(def.pursuitTendency).toBeLessThanOrEqual(1);
      }
    });

    it('goalkeeper has highest defensive contribution', () => {
      expect(ROLE_DEFINITIONS.goalkeeper.defensiveContribution).toBe(10);
    });

    it('striker has highest offensive contribution', () => {
      expect(ROLE_DEFINITIONS.striker.offensiveContribution).toBe(10);
    });

    it('defenders have higher defensive than offensive', () => {
      const lb = ROLE_DEFINITIONS['left-back'];
      expect(lb.defensiveContribution).toBeGreaterThan(lb.offensiveContribution);
    });

    it('midfielders are balanced', () => {
      const cm = ROLE_DEFINITIONS['central-midfielder-1'];
      expect(Math.abs(cm.defensiveContribution - cm.offensiveContribution)).toBeLessThanOrEqual(2);
    });

    it('preferred areas are valid rectangles', () => {
      for (const role of ALL_ROLES) {
        const area = ROLE_DEFINITIONS[role].preferredArea;
        expect(area.minX).toBeLessThan(area.maxX);
        expect(area.minZ).toBeLessThan(area.maxZ);
      }
    });
  });

  // ── Position Discipline ───────────────────────────────────────
  describe('POSITION_DISCIPLINE_FACTOR', () => {
    it('has values for all roles', () => {
      for (const role of ALL_ROLES) {
        expect(POSITION_DISCIPLINE_FACTOR[role]).toBeDefined();
      }
    });

    it('all values are between 0 and 1', () => {
      for (const role of ALL_ROLES) {
        expect(POSITION_DISCIPLINE_FACTOR[role]).toBeGreaterThan(0);
        expect(POSITION_DISCIPLINE_FACTOR[role]).toBeLessThanOrEqual(1);
      }
    });

    it('goalkeeper is most disciplined', () => {
      const gkDiscipline = POSITION_DISCIPLINE_FACTOR.goalkeeper;
      for (const role of ALL_ROLES) {
        expect(gkDiscipline).toBeGreaterThanOrEqual(POSITION_DISCIPLINE_FACTOR[role]);
      }
    });

    it('striker is least disciplined', () => {
      const stDiscipline = POSITION_DISCIPLINE_FACTOR.striker;
      for (const role of ALL_ROLES) {
        expect(stDiscipline).toBeLessThanOrEqual(POSITION_DISCIPLINE_FACTOR[role]);
      }
    });
  });

  // ── Pursuit Distances ─────────────────────────────────────────
  describe('pursuit distances', () => {
    it('goalkeeper has shortest pursuit distance', () => {
      expect(GOALKEEPER_PURSUIT_DISTANCE).toBeLessThan(DEFENDER_PURSUIT_DISTANCE);
    });

    it('pursuit distances increase with offensive role', () => {
      expect(GOALKEEPER_PURSUIT_DISTANCE).toBeLessThan(DEFENDER_PURSUIT_DISTANCE);
      expect(DEFENDER_PURSUIT_DISTANCE).toBeLessThan(MIDFIELDER_PURSUIT_DISTANCE);
      expect(MIDFIELDER_PURSUIT_DISTANCE).toBeLessThan(STRIKER_PURSUIT_DISTANCE);
    });

    it('all pursuit distances are positive', () => {
      expect(GOALKEEPER_PURSUIT_DISTANCE).toBeGreaterThan(0);
      expect(DEFENDER_PURSUIT_DISTANCE).toBeGreaterThan(0);
      expect(MIDFIELDER_PURSUIT_DISTANCE).toBeGreaterThan(0);
      expect(STRIKER_PURSUIT_DISTANCE).toBeGreaterThan(0);
    });
  });

  // ── Pursuit Probabilities ─────────────────────────────────────
  describe('ROLE_PURSUIT_PROBABILITY', () => {
    it('all values between 0 and 1', () => {
      for (const role of ALL_ROLES) {
        expect(ROLE_PURSUIT_PROBABILITY[role]).toBeGreaterThan(0);
        expect(ROLE_PURSUIT_PROBABILITY[role]).toBeLessThanOrEqual(1);
      }
    });

    it('goalkeeper has lowest pursuit probability', () => {
      const gk = ROLE_PURSUIT_PROBABILITY.goalkeeper;
      for (const role of ALL_ROLES) {
        expect(gk).toBeLessThanOrEqual(ROLE_PURSUIT_PROBABILITY[role]);
      }
    });

    it('striker has highest pursuit probability', () => {
      const st = ROLE_PURSUIT_PROBABILITY.striker;
      for (const role of ALL_ROLES) {
        expect(st).toBeGreaterThanOrEqual(ROLE_PURSUIT_PROBABILITY[role]);
      }
    });
  });

  // ── Position Recovery ─────────────────────────────────────────
  describe('POSITION_RECOVERY_MULTIPLIER', () => {
    it('all values are greater than 1', () => {
      for (const role of ALL_ROLES) {
        expect(POSITION_RECOVERY_MULTIPLIER[role]).toBeGreaterThan(1);
      }
    });

    it('goalkeeper has fastest recovery', () => {
      const gk = POSITION_RECOVERY_MULTIPLIER.goalkeeper;
      for (const role of ALL_ROLES) {
        expect(gk).toBeGreaterThanOrEqual(POSITION_RECOVERY_MULTIPLIER[role]);
      }
    });
  });

  // ── Spacing Constants ─────────────────────────────────────────
  describe('spacing constants', () => {
    it('teammate repulsion distance is positive', () => {
      expect(TEAMMATE_REPULSION_DISTANCE).toBeGreaterThan(0);
    });

    it('teammate repulsion strength is positive', () => {
      expect(TEAMMATE_REPULSION_STRENGTH).toBeGreaterThan(0);
    });

    it('kickoff spacing multiplier is > 1', () => {
      expect(KICKOFF_SPACING_MULTIPLIER).toBeGreaterThan(1);
    });

    it('center avoidance radius is positive', () => {
      expect(CENTER_AVOIDANCE_RADIUS).toBeGreaterThan(0);
    });
  });

  // ── Shot / Pass Physics ───────────────────────────────────────
  describe('shot and pass physics', () => {
    it('shot arc is greater than pass arc (shots are higher)', () => {
      expect(SHOT_ARC_FACTOR).toBeGreaterThan(PASS_ARC_FACTOR);
    });

    it('shot force is greater than pass force', () => {
      expect(SHOT_FORCE).toBeGreaterThan(PASS_FORCE);
    });

    it('forces are positive', () => {
      expect(SHOT_FORCE).toBeGreaterThan(0);
      expect(PASS_FORCE).toBeGreaterThan(0);
    });
  });

  // ── getPursuitDistanceForRole ─────────────────────────────────
  describe('getPursuitDistanceForRole', () => {
    it('returns goalkeeper distance for goalkeeper', () => {
      expect(getPursuitDistanceForRole('goalkeeper')).toBe(GOALKEEPER_PURSUIT_DISTANCE);
    });

    it('returns defender distance for left-back', () => {
      expect(getPursuitDistanceForRole('left-back')).toBe(DEFENDER_PURSUIT_DISTANCE);
    });

    it('returns defender distance for right-back', () => {
      expect(getPursuitDistanceForRole('right-back')).toBe(DEFENDER_PURSUIT_DISTANCE);
    });

    it('returns midfielder distance for central-midfielder-1', () => {
      expect(getPursuitDistanceForRole('central-midfielder-1')).toBe(MIDFIELDER_PURSUIT_DISTANCE);
    });

    it('returns midfielder distance for central-midfielder-2', () => {
      expect(getPursuitDistanceForRole('central-midfielder-2')).toBe(MIDFIELDER_PURSUIT_DISTANCE);
    });

    it('returns striker distance for striker', () => {
      expect(getPursuitDistanceForRole('striker')).toBe(STRIKER_PURSUIT_DISTANCE);
    });
  });
});
