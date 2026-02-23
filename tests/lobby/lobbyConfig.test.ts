import { describe, it, expect } from 'vitest';
import {
  PORTAL_CONFIGS,
  PORTAL_COOLDOWN_MS,
  LOBBY_BALL_RESPAWN_DISTANCE,
  LOBBY_BALL_MIN_Y,
  LOBBY_SPAWN_POSITION,
  MIN_BALL_VELOCITY_FOR_PORTAL,
  PORTAL_SENSOR_HALF_EXTENTS,
} from '../../lobby/lobbyConfig';
import { GameMode } from '../../state/gameModes';

describe('lobbyConfig', () => {
  // ── Portal Configs ────────────────────────────────────────────
  describe('PORTAL_CONFIGS', () => {
    it('has 4 portals (one per game mode)', () => {
      expect(PORTAL_CONFIGS).toHaveLength(4);
    });

    it('covers all game modes', () => {
      const modes = PORTAL_CONFIGS.map((p) => p.gameMode);
      expect(modes).toContain(GameMode.FIFA);
      expect(modes).toContain(GameMode.ARCADE);
      expect(modes).toContain(GameMode.TOURNAMENT);
      expect(modes).toContain(GameMode.PENALTY_SHOOTOUT);
    });

    it('each portal has a unique game mode', () => {
      const modes = PORTAL_CONFIGS.map((p) => p.gameMode);
      expect(new Set(modes).size).toBe(modes.length);
    });

    it('each portal has a label', () => {
      for (const portal of PORTAL_CONFIGS) {
        expect(portal.label).toBeTruthy();
        expect(portal.label.length).toBeGreaterThan(0);
      }
    });

    it('each portal has valid position', () => {
      for (const portal of PORTAL_CONFIGS) {
        expect(typeof portal.position.x).toBe('number');
        expect(typeof portal.position.y).toBe('number');
        expect(typeof portal.position.z).toBe('number');
      }
    });

    it('each portal has valid RGB color', () => {
      for (const portal of PORTAL_CONFIGS) {
        expect(portal.color.r).toBeGreaterThanOrEqual(0);
        expect(portal.color.r).toBeLessThanOrEqual(255);
        expect(portal.color.g).toBeGreaterThanOrEqual(0);
        expect(portal.color.g).toBeLessThanOrEqual(255);
        expect(portal.color.b).toBeGreaterThanOrEqual(0);
        expect(portal.color.b).toBeLessThanOrEqual(255);
      }
    });

    it('portals are spaced apart on X axis', () => {
      const sorted = [...PORTAL_CONFIGS].sort((a, b) => a.position.x - b.position.x);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].position.x - sorted[i - 1].position.x).toBeGreaterThanOrEqual(5);
      }
    });
  });

  // ── Lobby Constants ───────────────────────────────────────────
  describe('lobby constants', () => {
    it('portal cooldown is positive', () => {
      expect(PORTAL_COOLDOWN_MS).toBeGreaterThan(0);
    });

    it('ball respawn distance is positive', () => {
      expect(LOBBY_BALL_RESPAWN_DISTANCE).toBeGreaterThan(0);
    });

    it('ball minimum Y is below ground or at ground', () => {
      expect(LOBBY_BALL_MIN_Y).toBeLessThanOrEqual(0);
    });

    it('min ball velocity for portal is positive', () => {
      expect(MIN_BALL_VELOCITY_FOR_PORTAL).toBeGreaterThan(0);
    });

    it('portal sensor has positive dimensions', () => {
      expect(PORTAL_SENSOR_HALF_EXTENTS.x).toBeGreaterThan(0);
      expect(PORTAL_SENSOR_HALF_EXTENTS.y).toBeGreaterThan(0);
      expect(PORTAL_SENSOR_HALF_EXTENTS.z).toBeGreaterThan(0);
    });
  });

  // ── Lobby Spawn ───────────────────────────────────────────────
  describe('LOBBY_SPAWN_POSITION', () => {
    it('has valid coordinates', () => {
      expect(typeof LOBBY_SPAWN_POSITION.x).toBe('number');
      expect(typeof LOBBY_SPAWN_POSITION.y).toBe('number');
      expect(typeof LOBBY_SPAWN_POSITION.z).toBe('number');
    });

    it('Y position is above ground', () => {
      expect(LOBBY_SPAWN_POSITION.y).toBeGreaterThan(0);
    });
  });
});
