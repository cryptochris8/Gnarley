import { describe, it, expect, beforeEach } from 'vitest';
import {
  GameMode,
  FIFA_MODE_CONFIG,
  ARCADE_MODE_CONFIG,
  TOURNAMENT_MODE_CONFIG,
  PENALTY_SHOOTOUT_CONFIG,
  getCurrentGameMode,
  getCurrentModeConfig,
  setGameMode,
  lockGameMode,
  unlockGameMode,
  isGameModeLocked,
  isFIFAMode,
  isArcadeMode,
  isTournamentMode,
  isPenaltyShootoutMode,
  ARCADE_BALL_CONFIG,
  POWER_UP_CONFIGS,
  ARCADE_PHYSICS_MULTIPLIERS,
} from '../../state/gameModes';

describe('gameModes', () => {
  beforeEach(() => {
    // Reset to FIFA and unlock all
    unlockGameMode('default');
    unlockGameMode('room1');
    unlockGameMode('room2');
    setGameMode(GameMode.FIFA);
  });

  // ── GameMode enum ─────────────────────────────────────────────
  describe('GameMode enum', () => {
    it('has four modes', () => {
      expect(GameMode.FIFA).toBe('fifa');
      expect(GameMode.ARCADE).toBe('arcade');
      expect(GameMode.TOURNAMENT).toBe('tournament');
      expect(GameMode.PENALTY_SHOOTOUT).toBe('penalty_shootout');
    });
  });

  // ── Mode configs ──────────────────────────────────────────────
  describe('FIFA_MODE_CONFIG', () => {
    it('has realistic physics', () => {
      expect(FIFA_MODE_CONFIG.realisticPhysics).toBe(true);
    });

    it('has no power-ups or special abilities', () => {
      expect(FIFA_MODE_CONFIG.powerUps).toBe(false);
      expect(FIFA_MODE_CONFIG.specialAbilities).toBe(false);
    });

    it('has crowd audio and commentary', () => {
      expect(FIFA_MODE_CONFIG.crowdAudio).toBe(true);
      expect(FIFA_MODE_CONFIG.announcerCommentary).toBe(true);
    });

    it('player speed is 1.0 (realistic)', () => {
      expect(FIFA_MODE_CONFIG.playerSpeed).toBe(1.0);
    });
  });

  describe('ARCADE_MODE_CONFIG', () => {
    it('has enhanced physics', () => {
      expect(ARCADE_MODE_CONFIG.enhancedPhysics).toBe(true);
    });

    it('has special abilities but no power-ups', () => {
      expect(ARCADE_MODE_CONFIG.specialAbilities).toBe(true);
      expect(ARCADE_MODE_CONFIG.powerUps).toBe(false);
    });

    it('has ability pickups', () => {
      expect(ARCADE_MODE_CONFIG.abilityPickups).toBe(true);
    });

    it('player speed is faster than FIFA', () => {
      expect(ARCADE_MODE_CONFIG.playerSpeed).toBeGreaterThan(FIFA_MODE_CONFIG.playerSpeed);
    });

    it('ball physics differ from FIFA', () => {
      expect(ARCADE_MODE_CONFIG.ballPhysics.bounciness).toBeGreaterThan(
        FIFA_MODE_CONFIG.ballPhysics.bounciness
      );
    });
  });

  describe('TOURNAMENT_MODE_CONFIG', () => {
    it('uses realistic physics like FIFA', () => {
      expect(TOURNAMENT_MODE_CONFIG.realisticPhysics).toBe(true);
      expect(TOURNAMENT_MODE_CONFIG.ballPhysics.damping).toBe(FIFA_MODE_CONFIG.ballPhysics.damping);
    });

    it('has no arcade features', () => {
      expect(TOURNAMENT_MODE_CONFIG.powerUps).toBe(false);
      expect(TOURNAMENT_MODE_CONFIG.specialAbilities).toBe(false);
    });

    it('has tournament-specific settings', () => {
      expect(TOURNAMENT_MODE_CONFIG.competitiveMode).toBe(true);
      expect(TOURNAMENT_MODE_CONFIG.playerReadyCheck).toBe(true);
      expect(TOURNAMENT_MODE_CONFIG.bracketProgression).toBe(true);
    });

    it('has reasonable ready check timeout', () => {
      expect(TOURNAMENT_MODE_CONFIG.readyCheckTimeout).toBe(300000); // 5 minutes
    });
  });

  describe('PENALTY_SHOOTOUT_CONFIG', () => {
    it('has 5 standard rounds', () => {
      expect(PENALTY_SHOOTOUT_CONFIG.standardRounds).toBe(5);
    });

    it('has sudden death after tie', () => {
      expect(PENALTY_SHOOTOUT_CONFIG.suddenDeathAfterTie).toBe(true);
    });

    it('has reasonable shot time limit', () => {
      expect(PENALTY_SHOOTOUT_CONFIG.shotTimeLimit).toBeGreaterThan(0);
      expect(PENALTY_SHOOTOUT_CONFIG.shotTimeLimit).toBeLessThanOrEqual(30);
    });

    it('penalty distance is standard (11 units ≈ 12 yards)', () => {
      expect(PENALTY_SHOOTOUT_CONFIG.penaltySpotDistance).toBe(11);
    });
  });

  // ── Mode switching ────────────────────────────────────────────
  describe('setGameMode / getCurrentGameMode', () => {
    it('defaults to FIFA mode', () => {
      expect(getCurrentGameMode()).toBe(GameMode.FIFA);
    });

    it('switches to Arcade mode', () => {
      const result = setGameMode(GameMode.ARCADE);
      expect(result).toBe(true);
      expect(getCurrentGameMode()).toBe(GameMode.ARCADE);
    });

    it('switches to Tournament mode', () => {
      setGameMode(GameMode.TOURNAMENT);
      expect(getCurrentGameMode()).toBe(GameMode.TOURNAMENT);
    });

    it('switches to Penalty Shootout mode', () => {
      setGameMode(GameMode.PENALTY_SHOOTOUT);
      expect(getCurrentGameMode()).toBe(GameMode.PENALTY_SHOOTOUT);
    });
  });

  // ── getCurrentModeConfig ──────────────────────────────────────
  describe('getCurrentModeConfig', () => {
    it('returns FIFA config for FIFA mode', () => {
      setGameMode(GameMode.FIFA);
      expect(getCurrentModeConfig()).toBe(FIFA_MODE_CONFIG);
    });

    it('returns Arcade config for Arcade mode', () => {
      setGameMode(GameMode.ARCADE);
      expect(getCurrentModeConfig()).toBe(ARCADE_MODE_CONFIG);
    });

    it('returns Tournament config for Tournament mode', () => {
      setGameMode(GameMode.TOURNAMENT);
      expect(getCurrentModeConfig()).toBe(TOURNAMENT_MODE_CONFIG);
    });

    it('returns Penalty config for Penalty mode', () => {
      setGameMode(GameMode.PENALTY_SHOOTOUT);
      expect(getCurrentModeConfig()).toBe(PENALTY_SHOOTOUT_CONFIG);
    });
  });

  // ── Mode locking ──────────────────────────────────────────────
  describe('lockGameMode / unlockGameMode / isGameModeLocked', () => {
    it('is unlocked by default', () => {
      expect(isGameModeLocked()).toBe(false);
    });

    it('locks for specific room', () => {
      lockGameMode('room1');
      expect(isGameModeLocked('room1')).toBe(true);
      expect(isGameModeLocked('room2')).toBe(false);
    });

    it('global lock check returns true if any room is locked', () => {
      lockGameMode('room1');
      expect(isGameModeLocked()).toBe(true);
    });

    it('prevents mode change when room is locked', () => {
      lockGameMode('room1');
      const result = setGameMode(GameMode.ARCADE, 'room1');
      expect(result).toBe(false);
      expect(getCurrentGameMode()).toBe(GameMode.FIFA);
    });

    it('prevents mode change without room ID when any room locked', () => {
      lockGameMode('room1');
      const result = setGameMode(GameMode.ARCADE);
      expect(result).toBe(false);
    });

    it('unlocks allows mode change again', () => {
      lockGameMode('room1');
      unlockGameMode('room1');
      expect(isGameModeLocked('room1')).toBe(false);
      const result = setGameMode(GameMode.ARCADE);
      expect(result).toBe(true);
    });

    it('multiple rooms can be locked independently', () => {
      lockGameMode('room1');
      lockGameMode('room2');
      unlockGameMode('room1');
      expect(isGameModeLocked('room1')).toBe(false);
      expect(isGameModeLocked('room2')).toBe(true);
      expect(isGameModeLocked()).toBe(true); // room2 still locked
    });
  });

  // ── Mode helper functions ─────────────────────────────────────
  describe('mode helper functions', () => {
    it('isFIFAMode returns true when FIFA', () => {
      setGameMode(GameMode.FIFA);
      expect(isFIFAMode()).toBe(true);
      expect(isArcadeMode()).toBe(false);
    });

    it('isArcadeMode returns true when Arcade', () => {
      setGameMode(GameMode.ARCADE);
      expect(isArcadeMode()).toBe(true);
      expect(isFIFAMode()).toBe(false);
    });

    it('isTournamentMode returns true when Tournament', () => {
      setGameMode(GameMode.TOURNAMENT);
      expect(isTournamentMode()).toBe(true);
    });

    it('isPenaltyShootoutMode returns true when Penalty', () => {
      setGameMode(GameMode.PENALTY_SHOOTOUT);
      expect(isPenaltyShootoutMode()).toBe(true);
    });
  });

  // ── Arcade-specific configs ───────────────────────────────────
  describe('Arcade-specific configs', () => {
    it('ARCADE_BALL_CONFIG has less friction than standard', () => {
      expect(ARCADE_BALL_CONFIG.FRICTION).toBeLessThan(0.5);
    });

    it('POWER_UP_CONFIGS has all expected power-ups', () => {
      expect(POWER_UP_CONFIGS.SPEED_BOOST).toBeDefined();
      expect(POWER_UP_CONFIGS.SUPER_SHOT).toBeDefined();
      expect(POWER_UP_CONFIGS.SHIELD).toBeDefined();
      expect(POWER_UP_CONFIGS.TELEPORT).toBeDefined();
    });

    it('power-up durations are positive', () => {
      expect(POWER_UP_CONFIGS.SPEED_BOOST.duration).toBeGreaterThan(0);
      expect(POWER_UP_CONFIGS.SUPER_SHOT.duration).toBeGreaterThan(0);
      expect(POWER_UP_CONFIGS.SHIELD.duration).toBeGreaterThan(0);
    });

    it('ARCADE_PHYSICS_MULTIPLIERS are all > 1 (enhancements)', () => {
      expect(ARCADE_PHYSICS_MULTIPLIERS.SHOT_POWER).toBeGreaterThan(1);
      expect(ARCADE_PHYSICS_MULTIPLIERS.PASS_SPEED).toBeGreaterThan(1);
      expect(ARCADE_PHYSICS_MULTIPLIERS.PLAYER_SPEED).toBeGreaterThan(1);
      expect(ARCADE_PHYSICS_MULTIPLIERS.JUMP_HEIGHT).toBeGreaterThan(1);
      expect(ARCADE_PHYSICS_MULTIPLIERS.BALL_SPIN).toBeGreaterThan(1);
    });
  });
});
