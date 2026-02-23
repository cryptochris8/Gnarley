import { describe, it, expect } from 'vitest';
import {
  distanceSquared,
  distanceSquaredXZ,
  distance,
  distanceXZ,
  isWithinDistance,
  isWithinDistanceXZ,
  findClosest,
  findWithinRadius,
  directionTo,
  clamp,
  lerp,
  lerpVector,
  dot,
  magnitude,
  magnitudeSquared,
  normalize,
  sqrtDistance,
} from '../../utils/MathUtils';

describe('MathUtils', () => {
  // ── distanceSquared ───────────────────────────────────────────
  describe('distanceSquared', () => {
    it('returns 0 for identical points', () => {
      const p = { x: 5, y: 3, z: 7 };
      expect(distanceSquared(p, p)).toBe(0);
    });

    it('calculates squared distance correctly for simple case', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 0 };
      expect(distanceSquared(a, b)).toBe(25); // 9 + 16 + 0
    });

    it('calculates 3D squared distance', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 6, z: 3 };
      expect(distanceSquared(a, b)).toBe(25); // 9 + 16 + 0
    });

    it('is symmetric', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 7, y: 8, z: 9 };
      expect(distanceSquared(a, b)).toBe(distanceSquared(b, a));
    });

    it('handles negative coordinates', () => {
      const a = { x: -5, y: -5, z: -5 };
      const b = { x: 5, y: 5, z: 5 };
      expect(distanceSquared(a, b)).toBe(300); // 100 + 100 + 100
    });
  });

  // ── distanceSquaredXZ ─────────────────────────────────────────
  describe('distanceSquaredXZ', () => {
    it('ignores Y component', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 100, z: 4 };
      expect(distanceSquaredXZ(a, b)).toBe(25); // 9 + 16
    });

    it('returns 0 for same XZ, different Y', () => {
      const a = { x: 5, y: 0, z: 10 };
      const b = { x: 5, y: 50, z: 10 };
      expect(distanceSquaredXZ(a, b)).toBe(0);
    });
  });

  // ── distance ──────────────────────────────────────────────────
  describe('distance', () => {
    it('returns 0 for identical points', () => {
      const p = { x: 1, y: 2, z: 3 };
      expect(distance(p, p)).toBe(0);
    });

    it('calculates correct distance for 3-4-5 triangle', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 0 };
      expect(distance(a, b)).toBe(5);
    });

    it('returns sqrt of distanceSquared', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 6, z: 3 };
      expect(distance(a, b)).toBe(Math.sqrt(distanceSquared(a, b)));
    });
  });

  // ── distanceXZ ────────────────────────────────────────────────
  describe('distanceXZ', () => {
    it('ignores Y for horizontal distance', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 999, z: 4 };
      expect(distanceXZ(a, b)).toBe(5);
    });
  });

  // ── isWithinDistance ───────────────────────────────────────────
  describe('isWithinDistance', () => {
    it('returns true when exactly at threshold', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 5, y: 0, z: 0 };
      expect(isWithinDistance(a, b, 5)).toBe(true);
    });

    it('returns true when closer than threshold', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 0, z: 0 };
      expect(isWithinDistance(a, b, 5)).toBe(true);
    });

    it('returns false when farther than threshold', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 6, y: 0, z: 0 };
      expect(isWithinDistance(a, b, 5)).toBe(false);
    });

    it('returns true for same point', () => {
      const p = { x: 10, y: 20, z: 30 };
      expect(isWithinDistance(p, p, 0)).toBe(true);
    });
  });

  // ── isWithinDistanceXZ ────────────────────────────────────────
  describe('isWithinDistanceXZ', () => {
    it('ignores Y difference', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 100, z: 4 };
      expect(isWithinDistanceXZ(a, b, 5)).toBe(true);
    });

    it('returns false for out-of-range XZ', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 10, y: 0, z: 10 };
      expect(isWithinDistanceXZ(a, b, 5)).toBe(false);
    });
  });

  // ── findClosest ───────────────────────────────────────────────
  describe('findClosest', () => {
    it('returns null for empty array', () => {
      expect(findClosest({ x: 0, y: 0, z: 0 }, [])).toBeNull();
    });

    it('returns single candidate', () => {
      const target = { x: 0, y: 0, z: 0 };
      const entity = { position: { x: 5, y: 0, z: 0 } };
      expect(findClosest(target, [entity])).toBe(entity);
    });

    it('finds the closest among multiple candidates', () => {
      const target = { x: 0, y: 0, z: 0 };
      const far = { position: { x: 10, y: 0, z: 0 }, id: 'far' };
      const close = { position: { x: 2, y: 0, z: 0 }, id: 'close' };
      const mid = { position: { x: 5, y: 0, z: 0 }, id: 'mid' };
      expect(findClosest(target, [far, close, mid])).toBe(close);
    });

    it('returns first candidate when equidistant', () => {
      const target = { x: 0, y: 0, z: 0 };
      const a = { position: { x: 5, y: 0, z: 0 }, id: 'a' };
      const b = { position: { x: -5, y: 0, z: 0 }, id: 'b' };
      expect(findClosest(target, [a, b])).toBe(a);
    });
  });

  // ── findWithinRadius ──────────────────────────────────────────
  describe('findWithinRadius', () => {
    it('returns empty array for no matches', () => {
      const target = { x: 0, y: 0, z: 0 };
      const far = { position: { x: 100, y: 0, z: 0 } };
      expect(findWithinRadius(target, [far], 5)).toEqual([]);
    });

    it('returns all entities within radius', () => {
      const target = { x: 0, y: 0, z: 0 };
      const near1 = { position: { x: 2, y: 0, z: 0 } };
      const near2 = { position: { x: 0, y: 3, z: 0 } };
      const far = { position: { x: 100, y: 0, z: 0 } };
      const result = findWithinRadius(target, [near1, near2, far], 5);
      expect(result).toHaveLength(2);
      expect(result).toContain(near1);
      expect(result).toContain(near2);
    });

    it('includes entities exactly at radius', () => {
      const target = { x: 0, y: 0, z: 0 };
      const atEdge = { position: { x: 5, y: 0, z: 0 } };
      expect(findWithinRadius(target, [atEdge], 5)).toHaveLength(1);
    });

    it('returns empty for empty candidates', () => {
      expect(findWithinRadius({ x: 0, y: 0, z: 0 }, [], 100)).toEqual([]);
    });
  });

  // ── directionTo ───────────────────────────────────────────────
  describe('directionTo', () => {
    it('returns zero vector for same points', () => {
      const p = { x: 5, y: 5, z: 5 };
      const dir = directionTo(p, p);
      expect(dir.x).toBe(0);
      expect(dir.y).toBe(0);
      expect(dir.z).toBe(0);
    });

    it('returns unit vector along X axis', () => {
      const from = { x: 0, y: 0, z: 0 };
      const to = { x: 10, y: 0, z: 0 };
      const dir = directionTo(from, to);
      expect(dir.x).toBeCloseTo(1, 5);
      expect(dir.y).toBeCloseTo(0, 5);
      expect(dir.z).toBeCloseTo(0, 5);
    });

    it('returns normalized direction vector', () => {
      const from = { x: 0, y: 0, z: 0 };
      const to = { x: 3, y: 4, z: 0 };
      const dir = directionTo(from, to);
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      expect(len).toBeCloseTo(1, 5);
    });

    it('handles negative direction', () => {
      const from = { x: 10, y: 0, z: 0 };
      const to = { x: 0, y: 0, z: 0 };
      const dir = directionTo(from, to);
      expect(dir.x).toBeCloseTo(-1, 5);
    });
  });

  // ── clamp ─────────────────────────────────────────────────────
  describe('clamp', () => {
    it('returns value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('clamps to min', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('clamps to max', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('handles equal min and max', () => {
      expect(clamp(5, 3, 3)).toBe(3);
    });

    it('handles value equal to min', () => {
      expect(clamp(0, 0, 10)).toBe(0);
    });

    it('handles value equal to max', () => {
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  // ── lerp ──────────────────────────────────────────────────────
  describe('lerp', () => {
    it('returns start at t=0', () => {
      expect(lerp(10, 20, 0)).toBe(10);
    });

    it('returns end at t=1', () => {
      expect(lerp(10, 20, 1)).toBe(20);
    });

    it('returns midpoint at t=0.5', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('handles negative values', () => {
      expect(lerp(-10, 10, 0.5)).toBe(0);
    });

    it('extrapolates beyond t=1', () => {
      expect(lerp(0, 10, 2)).toBe(20);
    });
  });

  // ── lerpVector ────────────────────────────────────────────────
  describe('lerpVector', () => {
    it('returns start vector at t=0', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 10, y: 20, z: 30 };
      const result = lerpVector(a, b, 0);
      expect(result.x).toBe(1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(3);
    });

    it('returns end vector at t=1', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 10, y: 20, z: 30 };
      const result = lerpVector(a, b, 1);
      expect(result.x).toBe(10);
      expect(result.y).toBe(20);
      expect(result.z).toBe(30);
    });

    it('interpolates each component at t=0.5', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 10, y: 20, z: 30 };
      const result = lerpVector(a, b, 0.5);
      expect(result.x).toBe(5);
      expect(result.y).toBe(10);
      expect(result.z).toBe(15);
    });
  });

  // ── dot ───────────────────────────────────────────────────────
  describe('dot', () => {
    it('returns 0 for perpendicular vectors', () => {
      expect(dot({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0);
    });

    it('returns positive for same direction', () => {
      expect(dot({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(1);
    });

    it('returns negative for opposite direction', () => {
      expect(dot({ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })).toBe(-1);
    });

    it('calculates full 3D dot product', () => {
      expect(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32); // 4+10+18
    });
  });

  // ── magnitude ─────────────────────────────────────────────────
  describe('magnitude', () => {
    it('returns 0 for zero vector', () => {
      expect(magnitude({ x: 0, y: 0, z: 0 })).toBe(0);
    });

    it('returns correct length for unit axis vectors', () => {
      expect(magnitude({ x: 1, y: 0, z: 0 })).toBe(1);
      expect(magnitude({ x: 0, y: 1, z: 0 })).toBe(1);
      expect(magnitude({ x: 0, y: 0, z: 1 })).toBe(1);
    });

    it('returns correct 3D length', () => {
      expect(magnitude({ x: 3, y: 4, z: 0 })).toBe(5);
    });
  });

  // ── magnitudeSquared ──────────────────────────────────────────
  describe('magnitudeSquared', () => {
    it('returns 0 for zero vector', () => {
      expect(magnitudeSquared({ x: 0, y: 0, z: 0 })).toBe(0);
    });

    it('returns squared length', () => {
      expect(magnitudeSquared({ x: 3, y: 4, z: 0 })).toBe(25);
    });
  });

  // ── normalize ─────────────────────────────────────────────────
  describe('normalize', () => {
    it('returns zero vector for zero input', () => {
      const result = normalize({ x: 0, y: 0, z: 0 });
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });

    it('normalizes to unit length', () => {
      const result = normalize({ x: 3, y: 4, z: 0 });
      const len = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2);
      expect(len).toBeCloseTo(1, 5);
    });

    it('preserves direction', () => {
      const result = normalize({ x: 10, y: 0, z: 0 });
      expect(result.x).toBeCloseTo(1, 5);
      expect(result.y).toBeCloseTo(0, 5);
      expect(result.z).toBeCloseTo(0, 5);
    });

    it('handles negative components', () => {
      const result = normalize({ x: -6, y: 0, z: 0 });
      expect(result.x).toBeCloseTo(-1, 5);
    });
  });

  // ── sqrtDistance ───────────────────────────────────────────────
  describe('sqrtDistance', () => {
    it('returns 0 for 0', () => {
      expect(sqrtDistance(0)).toBe(0);
    });

    it('converts squared distance to actual distance', () => {
      expect(sqrtDistance(25)).toBe(5);
      expect(sqrtDistance(100)).toBe(10);
    });
  });
});
