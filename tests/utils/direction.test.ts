import { describe, it, expect } from 'vitest';
import { getDirectionFromRotation } from '../../utils/direction';

describe('direction utilities', () => {
  // ── getDirectionFromRotation ──────────────────────────────────
  describe('getDirectionFromRotation', () => {
    it('returns forward direction for identity quaternion', () => {
      const rotation = { x: 0, y: 0, z: 0, w: 1 };
      const dir = getDirectionFromRotation(rotation);
      // angle = 2 * atan2(0, 1) = 0, so sin(0) = 0, cos(0) = 1
      expect(dir.x).toBeCloseTo(0, 5);
      expect(dir.y).toBe(0);
      expect(dir.z).toBeCloseTo(1, 5);
    });

    it('returns correct direction for 90-degree Y rotation', () => {
      // 90 degrees = pi/2 around Y. Quaternion: y = sin(pi/4), w = cos(pi/4)
      const halfAngle = Math.PI / 4;
      const rotation = { x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) };
      const dir = getDirectionFromRotation(rotation);
      // angle = 2 * atan2(sin(pi/4), cos(pi/4)) = pi/2
      // sin(pi/2) = 1, cos(pi/2) = 0
      expect(dir.x).toBeCloseTo(1, 5);
      expect(dir.z).toBeCloseTo(0, 3);
    });

    it('returns opposite direction for 180-degree rotation', () => {
      // 180 degrees = pi around Y. Quaternion: y = sin(pi/2) = 1, w = cos(pi/2) = 0
      const rotation = { x: 0, y: 1, z: 0, w: 0 };
      const dir = getDirectionFromRotation(rotation);
      // angle = 2 * atan2(1, 0) = pi
      // sin(pi) ≈ 0, cos(pi) = -1
      expect(dir.x).toBeCloseTo(0, 3);
      expect(dir.z).toBeCloseTo(-1, 3);
    });

    it('Y component is always 0', () => {
      const rotation = { x: 0, y: 0.5, z: 0, w: 0.866 };
      const dir = getDirectionFromRotation(rotation);
      expect(dir.y).toBe(0);
    });

    it('returns unit-length direction vector on XZ plane', () => {
      const rotation = { x: 0, y: 0.383, z: 0, w: 0.924 };
      const dir = getDirectionFromRotation(rotation);
      const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
      expect(len).toBeCloseTo(1, 3);
    });
  });
});
