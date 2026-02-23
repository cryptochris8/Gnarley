import { describe, it, expect } from 'vitest';
import { getStartPosition } from '../../utils/positions';
import {
  SAFE_SPAWN_Y,
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_FIELD_CENTER_Z,
} from '../../state/gameConfig';
import type { SoccerAIRole } from '../../entities/ai/AIRoleDefinitions';

describe('getStartPosition', () => {
  const roles: SoccerAIRole[] = [
    'goalkeeper',
    'left-back',
    'right-back',
    'central-midfielder-1',
    'central-midfielder-2',
    'striker',
  ];

  describe('all positions use SAFE_SPAWN_Y', () => {
    for (const role of roles) {
      it(`${role} red team spawns at Y=${SAFE_SPAWN_Y}`, () => {
        expect(getStartPosition('red', role).y).toBe(SAFE_SPAWN_Y);
      });

      it(`${role} blue team spawns at Y=${SAFE_SPAWN_Y}`, () => {
        expect(getStartPosition('blue', role).y).toBe(SAFE_SPAWN_Y);
      });
    }
  });

  describe('goalkeeper positioning', () => {
    it('red goalkeeper spawns near red goal line', () => {
      const pos = getStartPosition('red', 'goalkeeper');
      expect(pos.x).toBe(AI_GOAL_LINE_X_RED - 1);
      expect(pos.z).toBe(AI_FIELD_CENTER_Z);
    });

    it('blue goalkeeper spawns near blue goal line', () => {
      const pos = getStartPosition('blue', 'goalkeeper');
      expect(pos.x).toBe(AI_GOAL_LINE_X_BLUE + 1);
      expect(pos.z).toBe(AI_FIELD_CENTER_Z);
    });
  });

  describe('team mirroring', () => {
    it('red team positions are on positive X side (near X=52)', () => {
      for (const role of roles) {
        const pos = getStartPosition('red', role);
        // Red team defends X=52, so they should be in the positive X region
        expect(pos.x).toBeGreaterThan(-10);
      }
    });

    it('blue team positions are on negative X side (near X=-37)', () => {
      for (const role of roles) {
        const pos = getStartPosition('blue', role);
        // Blue team defends X=-37, so they should be in the negative X region
        expect(pos.x).toBeLessThan(30);
      }
    });
  });

  describe('striker positioning', () => {
    it('red striker spawns center Z at forward position', () => {
      const pos = getStartPosition('red', 'striker');
      expect(pos.z).toBe(AI_FIELD_CENTER_Z);
    });

    it('blue striker spawns center Z at forward position', () => {
      const pos = getStartPosition('blue', 'striker');
      expect(pos.z).toBe(AI_FIELD_CENTER_Z);
    });
  });

  describe('defender lateral spread', () => {
    it('left-back and right-back have different Z positions', () => {
      const lb = getStartPosition('red', 'left-back');
      const rb = getStartPosition('red', 'right-back');
      expect(lb.z).not.toBe(rb.z);
      expect(lb.x).toBe(rb.x); // Same X (same defensive line)
    });
  });

  describe('midfielder lateral spread', () => {
    it('two midfielders have different Z positions', () => {
      const cm1 = getStartPosition('red', 'central-midfielder-1');
      const cm2 = getStartPosition('red', 'central-midfielder-2');
      expect(cm1.z).not.toBe(cm2.z);
      expect(cm1.x).toBe(cm2.x); // Same X (same midfield line)
    });
  });

  describe('depth ordering', () => {
    it('red team: GK deepest, striker most forward (smallest X)', () => {
      const gk = getStartPosition('red', 'goalkeeper');
      const def = getStartPosition('red', 'left-back');
      const mid = getStartPosition('red', 'central-midfielder-1');
      const str = getStartPosition('red', 'striker');
      expect(gk.x).toBeGreaterThan(def.x);
      expect(def.x).toBeGreaterThan(mid.x);
      expect(mid.x).toBeGreaterThan(str.x);
    });

    it('blue team: GK deepest, striker most forward (largest X)', () => {
      const gk = getStartPosition('blue', 'goalkeeper');
      const def = getStartPosition('blue', 'left-back');
      const mid = getStartPosition('blue', 'central-midfielder-1');
      const str = getStartPosition('blue', 'striker');
      expect(gk.x).toBeLessThan(def.x);
      expect(def.x).toBeLessThan(mid.x);
      expect(mid.x).toBeLessThan(str.x);
    });
  });

  describe('default fallback', () => {
    it('unknown role returns goal-line default', () => {
      const pos = getStartPosition('red', 'unknown-role' as SoccerAIRole);
      expect(pos.x).toBe(AI_GOAL_LINE_X_RED - 1);
      expect(pos.z).toBe(AI_FIELD_CENTER_Z);
      expect(pos.y).toBe(SAFE_SPAWN_Y);
    });
  });
});
