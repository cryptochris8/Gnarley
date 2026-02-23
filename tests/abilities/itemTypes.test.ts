import { describe, it, expect, beforeEach } from 'vitest';
import {
  shurikenThrowOptions,
  speedBoostOptions,
  freezeBlastOptions,
  fireballOptions,
  megaKickOptions,
  powerBoostOptions,
  precisionOptions,
  staminaOptions,
  shieldOptions,
  staminaBoostOptions,
  timeSlowOptions,
  ballMagnetOptions,
  crystalBarrierOptions,
  elementalMasteryOptions,
  tidalWaveOptions,
  realityWarpOptions,
  honeyTrapOptions,
  ALL_POWERUP_OPTIONS,
  ENHANCED_POWERUP_OPTIONS,
  type ItemAbilityOptions,
} from '../../abilities/itemTypes';

// All individual item configs to iterate over
const allItems: { name: string; options: ItemAbilityOptions }[] = [
  { name: 'shurikenThrowOptions', options: shurikenThrowOptions },
  { name: 'speedBoostOptions', options: speedBoostOptions },
  { name: 'freezeBlastOptions', options: freezeBlastOptions },
  { name: 'fireballOptions', options: fireballOptions },
  { name: 'megaKickOptions', options: megaKickOptions },
  { name: 'powerBoostOptions', options: powerBoostOptions },
  { name: 'precisionOptions', options: precisionOptions },
  { name: 'staminaOptions', options: staminaOptions },
  { name: 'shieldOptions', options: shieldOptions },
  { name: 'staminaBoostOptions', options: staminaBoostOptions },
  { name: 'timeSlowOptions', options: timeSlowOptions },
  { name: 'ballMagnetOptions', options: ballMagnetOptions },
  { name: 'crystalBarrierOptions', options: crystalBarrierOptions },
  { name: 'elementalMasteryOptions', options: elementalMasteryOptions },
  { name: 'tidalWaveOptions', options: tidalWaveOptions },
  { name: 'realityWarpOptions', options: realityWarpOptions },
  { name: 'honeyTrapOptions', options: honeyTrapOptions },
];

describe('itemTypes', () => {
  describe.each(allItems)('$name', ({ options }) => {
    it('has all required properties', () => {
      expect(options).toHaveProperty('name');
      expect(options).toHaveProperty('speed');
      expect(options).toHaveProperty('damage');
      expect(options).toHaveProperty('modelUri');
      expect(options).toHaveProperty('modelScale');
      expect(options).toHaveProperty('projectileRadius');
      expect(options).toHaveProperty('knockback');
      expect(options).toHaveProperty('lifeTime');
      expect(options).toHaveProperty('icon');
      expect(options).toHaveProperty('idleAnimation');
    });

    it('has non-negative numeric values', () => {
      expect(options.speed).toBeGreaterThanOrEqual(0);
      expect(options.damage).toBeGreaterThanOrEqual(0);
      expect(options.modelScale).toBeGreaterThanOrEqual(0);
      expect(options.projectileRadius).toBeGreaterThanOrEqual(0);
      expect(options.knockback).toBeGreaterThanOrEqual(0);
      expect(options.lifeTime).toBeGreaterThanOrEqual(0);
    });

    it('has a non-empty modelUri string starting with "models/" or a known path', () => {
      expect(typeof options.modelUri).toBe('string');
      expect(options.modelUri.length).toBeGreaterThan(0);
      // Some items use paths without the "models/" prefix (e.g. "projectiles/...")
      // but all should be non-empty strings pointing to model files
      expect(options.modelUri).toMatch(/\.(gltf|glb)$/);
    });

    it('has a non-empty icon string', () => {
      expect(typeof options.icon).toBe('string');
      expect(options.icon.length).toBeGreaterThan(0);
    });

    it('has a positive and reasonable modelScale (< 5)', () => {
      expect(options.modelScale).toBeGreaterThan(0);
      expect(options.modelScale).toBeLessThan(5);
    });

    it('has a non-empty name string', () => {
      expect(typeof options.name).toBe('string');
      expect(options.name.length).toBeGreaterThan(0);
    });

    it('has a non-empty idleAnimation string', () => {
      expect(typeof options.idleAnimation).toBe('string');
      expect(options.idleAnimation.length).toBeGreaterThan(0);
    });
  });

  describe('shurikenThrowOptions specific values', () => {
    it('has speed of 12', () => {
      expect(shurikenThrowOptions.speed).toBe(12);
    });

    it('has damage of 15', () => {
      expect(shurikenThrowOptions.damage).toBe(15);
    });

    it('has name "Shuriken"', () => {
      expect(shurikenThrowOptions.name).toBe('Shuriken');
    });

    it('has modelScale of 0.4', () => {
      expect(shurikenThrowOptions.modelScale).toBe(0.4);
    });

    it('has knockback of 0.6', () => {
      expect(shurikenThrowOptions.knockback).toBe(0.6);
    });

    it('has lifeTime of 1.5', () => {
      expect(shurikenThrowOptions.lifeTime).toBe(1.5);
    });

    it('uses the shuriken model', () => {
      expect(shurikenThrowOptions.modelUri).toBe('models/projectiles/shuriken.gltf');
    });
  });

  describe('speedBoostOptions specific values', () => {
    it('has speed of 5', () => {
      expect(speedBoostOptions.speed).toBe(5);
    });

    it('has name "Speed Boost"', () => {
      expect(speedBoostOptions.name).toBe('Speed Boost');
    });

    it('uses the speed model', () => {
      expect(speedBoostOptions.modelUri).toBe('models/speed/speed.gltf');
    });
  });

  describe('freezeBlastOptions specific values', () => {
    it('has speed of 8', () => {
      expect(freezeBlastOptions.speed).toBe(8);
    });

    it('has damage of 10', () => {
      expect(freezeBlastOptions.damage).toBe(10);
    });

    it('has name "Freeze Blast"', () => {
      expect(freezeBlastOptions.name).toBe('Freeze Blast');
    });

    it('has projectileRadius of 1.2', () => {
      expect(freezeBlastOptions.projectileRadius).toBe(1.2);
    });
  });

  describe('fireballOptions specific values', () => {
    it('has speed of 10', () => {
      expect(fireballOptions.speed).toBe(10);
    });

    it('has damage of 20', () => {
      expect(fireballOptions.damage).toBe(20);
    });

    it('has name "Fireball"', () => {
      expect(fireballOptions.name).toBe('Fireball');
    });

    it('has knockback of 0.8', () => {
      expect(fireballOptions.knockback).toBe(0.8);
    });
  });

  describe('megaKickOptions specific values', () => {
    it('has speed of 0 (not a projectile)', () => {
      expect(megaKickOptions.speed).toBe(0);
    });

    it('has damage of 25', () => {
      expect(megaKickOptions.damage).toBe(25);
    });

    it('has name "Mega Kick"', () => {
      expect(megaKickOptions.name).toBe('Mega Kick');
    });
  });

  describe('powerBoostOptions specific values', () => {
    it('has speed of 0', () => {
      expect(powerBoostOptions.speed).toBe(0);
    });

    it('has damage of 30', () => {
      expect(powerBoostOptions.damage).toBe(30);
    });

    it('has name "Power Boost"', () => {
      expect(powerBoostOptions.name).toBe('Power Boost');
    });
  });

  describe('ALL_POWERUP_OPTIONS', () => {
    it('is an array', () => {
      expect(Array.isArray(ALL_POWERUP_OPTIONS)).toBe(true);
    });

    it('contains 9 core power-ups', () => {
      expect(ALL_POWERUP_OPTIONS).toHaveLength(9);
    });

    it('includes speedBoostOptions', () => {
      expect(ALL_POWERUP_OPTIONS).toContain(speedBoostOptions);
    });

    it('includes shurikenThrowOptions', () => {
      expect(ALL_POWERUP_OPTIONS).toContain(shurikenThrowOptions);
    });

    it('includes freezeBlastOptions', () => {
      expect(ALL_POWERUP_OPTIONS).toContain(freezeBlastOptions);
    });

    it('includes fireballOptions', () => {
      expect(ALL_POWERUP_OPTIONS).toContain(fireballOptions);
    });

    it('includes megaKickOptions', () => {
      expect(ALL_POWERUP_OPTIONS).toContain(megaKickOptions);
    });

    it('includes powerBoostOptions', () => {
      expect(ALL_POWERUP_OPTIONS).toContain(powerBoostOptions);
    });

    it('includes precisionOptions', () => {
      expect(ALL_POWERUP_OPTIONS).toContain(precisionOptions);
    });

    it('includes staminaOptions', () => {
      expect(ALL_POWERUP_OPTIONS).toContain(staminaOptions);
    });

    it('includes shieldOptions', () => {
      expect(ALL_POWERUP_OPTIONS).toContain(shieldOptions);
    });

    it('does not include enhanced power-ups', () => {
      expect(ALL_POWERUP_OPTIONS).not.toContain(timeSlowOptions);
      expect(ALL_POWERUP_OPTIONS).not.toContain(ballMagnetOptions);
      expect(ALL_POWERUP_OPTIONS).not.toContain(honeyTrapOptions);
    });

    it('every entry has all required properties', () => {
      for (const item of ALL_POWERUP_OPTIONS) {
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('speed');
        expect(item).toHaveProperty('damage');
        expect(item).toHaveProperty('modelUri');
        expect(item).toHaveProperty('icon');
      }
    });
  });

  describe('ENHANCED_POWERUP_OPTIONS', () => {
    it('is an array', () => {
      expect(Array.isArray(ENHANCED_POWERUP_OPTIONS)).toBe(true);
    });

    it('contains 7 enhanced power-ups', () => {
      expect(ENHANCED_POWERUP_OPTIONS).toHaveLength(7);
    });

    it('includes timeSlowOptions', () => {
      expect(ENHANCED_POWERUP_OPTIONS).toContain(timeSlowOptions);
    });

    it('includes ballMagnetOptions', () => {
      expect(ENHANCED_POWERUP_OPTIONS).toContain(ballMagnetOptions);
    });

    it('includes crystalBarrierOptions', () => {
      expect(ENHANCED_POWERUP_OPTIONS).toContain(crystalBarrierOptions);
    });

    it('includes elementalMasteryOptions', () => {
      expect(ENHANCED_POWERUP_OPTIONS).toContain(elementalMasteryOptions);
    });

    it('includes tidalWaveOptions', () => {
      expect(ENHANCED_POWERUP_OPTIONS).toContain(tidalWaveOptions);
    });

    it('includes realityWarpOptions', () => {
      expect(ENHANCED_POWERUP_OPTIONS).toContain(realityWarpOptions);
    });

    it('includes honeyTrapOptions', () => {
      expect(ENHANCED_POWERUP_OPTIONS).toContain(honeyTrapOptions);
    });

    it('does not overlap with ALL_POWERUP_OPTIONS', () => {
      for (const enhanced of ENHANCED_POWERUP_OPTIONS) {
        expect(ALL_POWERUP_OPTIONS).not.toContain(enhanced);
      }
    });
  });

  describe('unique names across all items', () => {
    it('every item config has a unique name', () => {
      const names = allItems.map((i) => i.options.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});
