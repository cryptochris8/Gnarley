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

// Mock SoccerPlayerEntity to break the import chain
vi.mock('../../entities/SoccerPlayerEntity', () => ({
  default: class MockSoccerPlayerEntity {},
}));

// Mock ItemThrowAbility (imported by AbilityHolder)
vi.mock('../../abilities/ItemThrowAbility', () => ({
  ItemThrowAbility: class {
    use = vi.fn();
    getIcon = vi.fn().mockReturnValue('shuriken-icon');
  },
}));

// Mock itemTypes (imported by AbilityHolder)
vi.mock('../../abilities/itemTypes', () => ({
  shurikenThrowOptions: {
    name: 'Shuriken',
    speed: 20,
    damage: 10,
    modelUri: 'mock.gltf',
    modelScale: 1,
    projectileRadius: 0.3,
    knockback: 5,
    lifeTime: 3000,
    icon: 'shuriken-icon',
    idleAnimation: 'idle',
  },
}));

import { AbilityHolder } from '../../abilities/AbilityHolder';

// ----- Helpers ---------------------------------------------------------------

function createMockPlayer() {
  return {
    ui: { sendData: vi.fn() },
  } as any;
}

function createMockAIPlayer() {
  return {
    ui: null,
  } as any;
}

function createMockAbility() {
  return {
    use: vi.fn(),
    getIcon: vi.fn().mockReturnValue('speed-boost'),
  };
}

// ----- Tests -----------------------------------------------------------------

describe('AbilityHolder', () => {
  // ── Constructor ───────────────────────────────────────────────
  describe('constructor', () => {
    it('starts with no ability', () => {
      const holder = new AbilityHolder(createMockPlayer());
      expect(holder.getAbility()).toBeNull();
      expect(holder.hasAbility()).toBe(false);
    });

    it('detects human player (isAIPlayer = false) when ui.sendData exists', () => {
      const player = createMockPlayer();
      const holder = new AbilityHolder(player);
      // Verify it is treated as a human player by checking that showAbilityUI
      // actually calls sendData (it would skip if isAIPlayer were true).
      const ability = createMockAbility();
      holder.setAbility(ability);
      holder.showAbilityUI(player);
      expect(player.ui.sendData).toHaveBeenCalled();
    });

    it('detects AI player (isAIPlayer = true) when ui is null', () => {
      const aiPlayer = createMockAIPlayer();
      const holder = new AbilityHolder(aiPlayer);
      // showAbilityUI should be a no-op for AI players
      const ability = createMockAbility();
      holder.setAbility(ability);
      // Use a human-like player object for the call so we can verify sendData is NOT called
      const humanPlayer = createMockPlayer();
      holder.showAbilityUI(humanPlayer);
      // Because isAIPlayer is true from the constructor, sendData should NOT be called
      expect(humanPlayer.ui.sendData).not.toHaveBeenCalled();
    });
  });

  // ── setAbility ────────────────────────────────────────────────
  describe('setAbility', () => {
    it('sets the ability so hasAbility returns true', () => {
      const holder = new AbilityHolder(createMockPlayer());
      const ability = createMockAbility();
      holder.setAbility(ability);
      expect(holder.hasAbility()).toBe(true);
    });

    it('getAbility returns the set ability', () => {
      const holder = new AbilityHolder(createMockPlayer());
      const ability = createMockAbility();
      holder.setAbility(ability);
      expect(holder.getAbility()).toBe(ability);
    });

    it('replaces an existing ability', () => {
      const holder = new AbilityHolder(createMockPlayer());
      const ability1 = createMockAbility();
      const ability2 = { use: vi.fn(), getIcon: vi.fn().mockReturnValue('fireball') };
      holder.setAbility(ability1);
      holder.setAbility(ability2);
      expect(holder.getAbility()).toBe(ability2);
    });
  });

  // ── removeAbility ─────────────────────────────────────────────
  describe('removeAbility', () => {
    it('removes the ability, setting it to null', () => {
      const holder = new AbilityHolder(createMockPlayer());
      holder.setAbility(createMockAbility());
      holder.removeAbility();
      expect(holder.getAbility()).toBeNull();
      expect(holder.hasAbility()).toBe(false);
    });

    it('is safe to call when no ability is set', () => {
      const holder = new AbilityHolder(createMockPlayer());
      expect(() => holder.removeAbility()).not.toThrow();
      expect(holder.getAbility()).toBeNull();
    });
  });

  // ── showAbilityUI ─────────────────────────────────────────────
  describe('showAbilityUI', () => {
    it('calls player.ui.sendData with type "ability-icon" for human players', () => {
      const player = createMockPlayer();
      const holder = new AbilityHolder(player);
      const ability = createMockAbility();
      holder.setAbility(ability);

      holder.showAbilityUI(player);

      expect(player.ui.sendData).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ability-icon',
          icon: 'speed-boost',
        }),
      );
    });

    it('includes the ability name and message in the sendData payload', () => {
      const player = createMockPlayer();
      const holder = new AbilityHolder(player);
      const ability = createMockAbility();
      holder.setAbility(ability);

      holder.showAbilityUI(player);

      const payload = player.ui.sendData.mock.calls[0][0];
      expect(payload.name).toBe('Speed Boost');
      expect(payload.message).toContain('Press F to use');
    });

    it('does NOT call sendData for AI players', () => {
      const aiPlayer = createMockAIPlayer();
      const holder = new AbilityHolder(aiPlayer);
      holder.setAbility(createMockAbility());

      // Even if we pass a player-like object, isAIPlayer flag prevents the call
      const humanPlayer = createMockPlayer();
      holder.showAbilityUI(humanPlayer);
      expect(humanPlayer.ui.sendData).not.toHaveBeenCalled();
    });
  });

  // ── hideAbilityUI ─────────────────────────────────────────────
  describe('hideAbilityUI', () => {
    it('sends "powerup-activated" when animated=true (default)', () => {
      const player = createMockPlayer();
      const holder = new AbilityHolder(player);
      holder.setAbility(createMockAbility());

      holder.hideAbilityUI(player); // animated defaults to true

      expect(player.ui.sendData).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'powerup-activated',
        }),
      );
    });

    it('sends "hide-ability-icon" when animated=false', () => {
      const player = createMockPlayer();
      const holder = new AbilityHolder(player);
      holder.setAbility(createMockAbility());

      holder.hideAbilityUI(player, false);

      expect(player.ui.sendData).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'hide-ability-icon',
        }),
      );
    });

    it('does NOT call sendData for AI players', () => {
      const aiPlayer = createMockAIPlayer();
      const holder = new AbilityHolder(aiPlayer);
      holder.setAbility(createMockAbility());

      const humanPlayer = createMockPlayer();
      holder.hideAbilityUI(humanPlayer, true);
      expect(humanPlayer.ui.sendData).not.toHaveBeenCalled();

      holder.hideAbilityUI(humanPlayer, false);
      expect(humanPlayer.ui.sendData).not.toHaveBeenCalled();
    });
  });

  // ── useAbility ────────────────────────────────────────────────
  describe('useAbility', () => {
    it('returns false if no ability is set', () => {
      const player = createMockPlayer();
      const holder = new AbilityHolder(player);
      expect(holder.useAbility(player)).toBe(false);
    });

    it('returns true if an ability is set', () => {
      const player = createMockPlayer();
      const holder = new AbilityHolder(player);
      holder.setAbility(createMockAbility());
      expect(holder.useAbility(player)).toBe(true);
    });

    it('sends "powerup-activated" to UI when used', () => {
      const player = createMockPlayer();
      const holder = new AbilityHolder(player);
      holder.setAbility(createMockAbility());

      holder.useAbility(player);

      expect(player.ui.sendData).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'powerup-activated',
        }),
      );
    });

    it('does not send UI data for AI players but still returns true', () => {
      const aiPlayer = createMockAIPlayer();
      const holder = new AbilityHolder(aiPlayer);
      holder.setAbility(createMockAbility());

      // useAbility checks player.ui directly (not isAIPlayer), so pass the aiPlayer
      const result = holder.useAbility(aiPlayer);
      // Should return true since ability exists, but no sendData call
      expect(result).toBe(true);
    });
  });

  // ── Error handling ────────────────────────────────────────────
  describe('error handling', () => {
    it('does not throw when player.ui is null', () => {
      const player = { ui: null } as any;
      expect(() => new AbilityHolder(player)).not.toThrow();
    });

    it('does not throw when player.ui is undefined', () => {
      const player = { ui: undefined } as any;
      expect(() => new AbilityHolder(player)).not.toThrow();
    });

    it('does not throw when calling showAbilityUI with null ui', () => {
      const player = { ui: null } as any;
      const holder = new AbilityHolder(player);
      holder.setAbility(createMockAbility());
      expect(() => holder.showAbilityUI(player)).not.toThrow();
    });

    it('does not throw when calling hideAbilityUI with null ui', () => {
      const player = { ui: null } as any;
      const holder = new AbilityHolder(player);
      holder.setAbility(createMockAbility());
      expect(() => holder.hideAbilityUI(player, true)).not.toThrow();
      expect(() => holder.hideAbilityUI(player, false)).not.toThrow();
    });

    it('does not throw when calling useAbility with null ui', () => {
      const player = { ui: null } as any;
      const holder = new AbilityHolder(player);
      holder.setAbility(createMockAbility());
      expect(() => holder.useAbility(player)).not.toThrow();
    });
  });
});
