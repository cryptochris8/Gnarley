import { describe, it, expect } from 'vitest';
import { PassCalculator } from '../../utils/PassCalculator';

describe('PassCalculator', () => {
  // ── calculatePassTravelTime ───────────────────────────────────
  describe('calculatePassTravelTime', () => {
    it('calculates travel time at default speed', () => {
      const time = PassCalculator.calculatePassTravelTime(9);
      expect(time).toBe(2); // 9 / 4.5
    });

    it('calculates travel time at custom speed', () => {
      const time = PassCalculator.calculatePassTravelTime(20, 10);
      expect(time).toBe(2); // 20 / 10
    });

    it('returns 0 for zero distance', () => {
      expect(PassCalculator.calculatePassTravelTime(0)).toBe(0);
    });

    it('returns positive for positive distance', () => {
      expect(PassCalculator.calculatePassTravelTime(15)).toBeGreaterThan(0);
    });
  });

  // ── predictTeammatePosition ───────────────────────────────────
  describe('predictTeammatePosition', () => {
    it('returns current position for stationary teammate', () => {
      const pos = { x: 10, y: 2, z: 5 };
      const vel = { x: 0, y: 0, z: 0 };
      const result = PassCalculator.predictTeammatePosition(pos, vel, 2);
      expect(result.x).toBe(10);
      expect(result.y).toBe(2);
      expect(result.z).toBe(5);
    });

    it('predicts position based on velocity and travel time', () => {
      const pos = { x: 10, y: 2, z: 5 };
      const vel = { x: 3, y: 0, z: -2 };
      const result = PassCalculator.predictTeammatePosition(pos, vel, 2);
      expect(result.x).toBe(16); // 10 + 3*2
      expect(result.y).toBe(2); // Y preserved
      expect(result.z).toBe(1); // 5 + (-2)*2
    });

    it('preserves Y position regardless of Y velocity', () => {
      const pos = { x: 0, y: 5, z: 0 };
      const vel = { x: 1, y: 10, z: 1 };
      const result = PassCalculator.predictTeammatePosition(pos, vel, 3);
      expect(result.y).toBe(5);
    });
  });

  // ── calculateSafetyMargin ─────────────────────────────────────
  describe('calculateSafetyMargin', () => {
    it('returns SHORT margin for short distance (field player)', () => {
      expect(PassCalculator.calculateSafetyMargin(5)).toBe(0.5);
    });

    it('returns MEDIUM margin for medium distance (field player)', () => {
      expect(PassCalculator.calculateSafetyMargin(15)).toBe(0.8);
    });

    it('returns LONG margin for long distance (field player)', () => {
      expect(PassCalculator.calculateSafetyMargin(25)).toBe(1.2);
    });

    it('returns larger SHORT margin for goalkeeper', () => {
      expect(PassCalculator.calculateSafetyMargin(5, true)).toBe(0.6);
    });

    it('returns larger MEDIUM margin for goalkeeper', () => {
      expect(PassCalculator.calculateSafetyMargin(15, true)).toBe(1.0);
    });

    it('returns larger LONG margin for goalkeeper', () => {
      expect(PassCalculator.calculateSafetyMargin(25, true)).toBe(1.5);
    });

    it('returns MEDIUM at boundary threshold (10 units)', () => {
      expect(PassCalculator.calculateSafetyMargin(10)).toBe(0.8);
    });

    it('returns LONG at boundary threshold (20 units)', () => {
      const result = PassCalculator.calculateSafetyMargin(20);
      // 20 is NOT > 20, so should be MEDIUM
      expect(result).toBe(0.8);
    });
  });

  // ── calculateLeadPosition ─────────────────────────────────────
  describe('calculateLeadPosition', () => {
    it('returns current position for stationary target', () => {
      const pos = { x: 20, y: 2, z: 10 };
      const vel = { x: 0, y: 0, z: 0 };
      const result = PassCalculator.calculateLeadPosition(pos, vel, 4.5, 10);
      expect(result.x).toBe(20);
      expect(result.z).toBe(10);
    });

    it('leads moving target in movement direction', () => {
      const pos = { x: 20, y: 2, z: 10 };
      const vel = { x: 5, y: 0, z: 0 };
      const result = PassCalculator.calculateLeadPosition(pos, vel, 4.5, 15);
      // Target should be ahead of current position in X direction
      expect(result.x).toBeGreaterThan(pos.x);
    });

    it('preserves Y coordinate', () => {
      const pos = { x: 20, y: 5, z: 10 };
      const vel = { x: 3, y: 10, z: 2 };
      const result = PassCalculator.calculateLeadPosition(pos, vel, 4.5, 10);
      expect(result.y).toBe(5);
    });

    it('applies safety margin for moving targets', () => {
      const pos = { x: 0, y: 0, z: 0 };
      const vel = { x: 5, y: 0, z: 0 };
      const leadPos = PassCalculator.calculateLeadPosition(pos, vel, 4.5, 15);
      const predictedPos = PassCalculator.predictTeammatePosition(pos, vel, 15 / 4.5);
      // Lead position should be slightly ahead of predicted due to safety margin
      expect(leadPos.x).toBeGreaterThan(predictedPos.x);
    });

    it('uses goalkeeper margins when configured', () => {
      const pos = { x: 0, y: 0, z: 0 };
      const vel = { x: 5, y: 0, z: 0 };
      const fieldLead = PassCalculator.calculateLeadPosition(pos, vel, 4.5, 15);
      const gkLead = PassCalculator.calculateLeadPosition(pos, vel, 4.5, 15, { isGoalkeeper: true });
      // GK margin is larger, so lead should be further ahead
      expect(gkLead.x).toBeGreaterThan(fieldLead.x);
    });
  });

  // ── isValidPassPosition ───────────────────────────────────────
  describe('isValidPassPosition', () => {
    it('returns true when no bounds specified', () => {
      expect(PassCalculator.isValidPassPosition({ x: 999, y: 0, z: 999 })).toBe(true);
    });

    it('returns true for position within bounds', () => {
      const bounds = { minX: -37, maxX: 52, minZ: -33, maxZ: 26 };
      expect(PassCalculator.isValidPassPosition({ x: 0, y: 0, z: 0 }, bounds)).toBe(true);
    });

    it('returns false for position outside X bounds', () => {
      const bounds = { minX: -37, maxX: 52, minZ: -33, maxZ: 26 };
      expect(PassCalculator.isValidPassPosition({ x: 60, y: 0, z: 0 }, bounds)).toBe(false);
    });

    it('returns false for position outside Z bounds', () => {
      const bounds = { minX: -37, maxX: 52, minZ: -33, maxZ: 26 };
      expect(PassCalculator.isValidPassPosition({ x: 0, y: 0, z: 30 }, bounds)).toBe(false);
    });

    it('returns true for position at boundary edges', () => {
      const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
      expect(PassCalculator.isValidPassPosition({ x: 0, y: 0, z: 0 }, bounds)).toBe(true);
      expect(PassCalculator.isValidPassPosition({ x: 10, y: 0, z: 10 }, bounds)).toBe(true);
    });
  });

  // ── calculatePassDirection ────────────────────────────────────
  describe('calculatePassDirection', () => {
    it('returns zero for same position', () => {
      const p = { x: 5, y: 0, z: 5 };
      const result = PassCalculator.calculatePassDirection(p, p);
      expect(result.x).toBe(0);
      expect(result.z).toBe(0);
      expect(result.distance).toBe(0);
    });

    it('returns normalized direction and distance', () => {
      const from = { x: 0, y: 0, z: 0 };
      const to = { x: 3, y: 0, z: 4 };
      const result = PassCalculator.calculatePassDirection(from, to);
      expect(result.x).toBeCloseTo(0.6, 5);
      expect(result.z).toBeCloseTo(0.8, 5);
      expect(result.distance).toBeCloseTo(5, 5);
    });

    it('correctly calculates pure X direction', () => {
      const from = { x: 0, y: 0, z: 0 };
      const to = { x: 10, y: 0, z: 0 };
      const result = PassCalculator.calculatePassDirection(from, to);
      expect(result.x).toBeCloseTo(1, 5);
      expect(result.z).toBeCloseTo(0, 5);
      expect(result.distance).toBeCloseTo(10, 5);
    });

    it('correctly calculates pure Z direction', () => {
      const from = { x: 0, y: 0, z: 0 };
      const to = { x: 0, y: 0, z: -15 };
      const result = PassCalculator.calculatePassDirection(from, to);
      expect(result.x).toBeCloseTo(0, 5);
      expect(result.z).toBeCloseTo(-1, 5);
      expect(result.distance).toBeCloseTo(15, 5);
    });
  });
});
