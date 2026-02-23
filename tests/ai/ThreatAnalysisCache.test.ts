import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThreatAnalysisCache } from '../../ai/ThreatAnalysisCache';

// ----- Helpers ---------------------------------------------------------------

/**
 * Creates a mock opponent that matches the shape expected by updateForTeam.
 * The method accesses: opponent.isSpawned, opponent.player.id,
 * opponent.player.username, opponent.position, opponent.aiRole, opponent.team.
 */
function createMockOpponent(overrides: {
  id?: string;
  username?: string;
  position?: { x: number; y: number; z: number };
  aiRole?: string;
  team?: 'red' | 'blue';
  isSpawned?: boolean;
} = {}) {
  return {
    isSpawned: overrides.isSpawned ?? true,
    position: overrides.position ?? { x: 10, y: 0, z: 5 },
    player: {
      id: overrides.id ?? 'p1',
      username: overrides.username ?? 'Player1',
    },
    aiRole: overrides.aiRole ?? 'striker',
    team: overrides.team ?? 'red',
  } as any;
}

// ----- Tests -----------------------------------------------------------------

describe('ThreatAnalysisCache', () => {
  let cache: ThreatAnalysisCache;

  beforeEach(() => {
    cache = new ThreatAnalysisCache();
  });

  // ── Constructor / initial state ───────────────────────────────
  describe('constructor / initial state', () => {
    it('getThreatLevel returns 0 when empty', () => {
      expect(cache.getThreatLevel({ x: 0, y: 0, z: 0 })).toBe(0);
    });

    it('getThreatLevel returns 0 for red team when empty', () => {
      expect(cache.getThreatLevel({ x: 0, y: 0, z: 0 }, 'red')).toBe(0);
    });

    it('getThreatLevel returns 0 for blue team when empty', () => {
      expect(cache.getThreatLevel({ x: 0, y: 0, z: 0 }, 'blue')).toBe(0);
    });

    it('getNearestOpponent returns null when empty', () => {
      expect(cache.getNearestOpponent({ x: 0, y: 0, z: 0 })).toBeNull();
    });

    it('getNearestOpponent returns null for red team when empty', () => {
      expect(cache.getNearestOpponent({ x: 0, y: 0, z: 0 }, 'red')).toBeNull();
    });

    it('getAllOpponents returns empty array when empty', () => {
      expect(cache.getAllOpponents('red')).toEqual([]);
      expect(cache.getAllOpponents('blue')).toEqual([]);
    });
  });

  // ── clear ─────────────────────────────────────────────────────
  describe('clear', () => {
    it('clears all data', () => {
      const opponent = createMockOpponent({ team: 'red' });
      cache.updateForTeam('red', [opponent]);

      cache.clear();

      expect(cache.getAllOpponents('red')).toEqual([]);
      expect(cache.getAllOpponents('blue')).toEqual([]);
      expect(cache.getThreatLevel({ x: 10, y: 0, z: 5 }, 'red')).toBe(0);
    });

    it('clears both teams', () => {
      cache.updateForTeam('red', [createMockOpponent({ id: 'r1', team: 'red' })]);
      cache.updateForTeam('blue', [createMockOpponent({ id: 'b1', team: 'blue' })]);

      cache.clear();

      expect(cache.getAllOpponents('red')).toEqual([]);
      expect(cache.getAllOpponents('blue')).toEqual([]);
    });
  });

  // ── clearTeam ─────────────────────────────────────────────────
  describe('clearTeam', () => {
    it('clears only the specified team', () => {
      cache.updateForTeam('red', [createMockOpponent({ id: 'r1', team: 'red' })]);
      cache.updateForTeam('blue', [createMockOpponent({ id: 'b1', team: 'blue' })]);

      cache.clearTeam('red');

      expect(cache.getAllOpponents('red')).toEqual([]);
      expect(cache.getAllOpponents('blue')).toHaveLength(1);
    });

    it('does not affect the other team', () => {
      cache.updateForTeam('red', [createMockOpponent({ id: 'r1', team: 'red' })]);
      cache.updateForTeam('blue', [createMockOpponent({ id: 'b1', team: 'blue' })]);

      cache.clearTeam('blue');

      expect(cache.getAllOpponents('red')).toHaveLength(1);
      expect(cache.getAllOpponents('blue')).toEqual([]);
    });
  });

  // ── getOpponentsInRadius ──────────────────────────────────────
  describe('getOpponentsInRadius', () => {
    it('returns empty array when no opponents are cached', () => {
      const result = cache.getOpponentsInRadius({ x: 0, y: 0, z: 0 }, 100, 'red');
      expect(result).toEqual([]);
    });

    it('returns empty array for blue team when only red is populated', () => {
      cache.updateForTeam('red', [createMockOpponent({ team: 'red' })]);
      const result = cache.getOpponentsInRadius({ x: 10, y: 0, z: 5 }, 100, 'blue');
      expect(result).toEqual([]);
    });
  });

  // ── getOpponentCountInArea ────────────────────────────────────
  describe('getOpponentCountInArea', () => {
    it('returns 0 when no opponents are cached', () => {
      expect(cache.getOpponentCountInArea({ x: 0, y: 0, z: 0 }, 50, 'red')).toBe(0);
    });
  });

  // ── isHighThreatZone ──────────────────────────────────────────
  describe('isHighThreatZone', () => {
    it('returns false when cache is empty', () => {
      expect(cache.isHighThreatZone({ x: 0, y: 0, z: 0 }, 'red')).toBe(false);
    });

    it('returns false for blue team when only red is populated', () => {
      cache.updateForTeam('red', [createMockOpponent({ team: 'red' })]);
      expect(cache.isHighThreatZone({ x: 10, y: 0, z: 5 }, 'blue')).toBe(false);
    });
  });

  // ── getStats ──────────────────────────────────────────────────
  describe('getStats', () => {
    it('returns opponentCount: 0 and highThreatZones: 0 initially', () => {
      const stats = cache.getStats('red');
      expect(stats.opponentCount).toBe(0);
      expect(stats.highThreatZones).toBe(0);
    });

    it('returns averageThreatLevel: 0 initially', () => {
      const stats = cache.getStats('blue');
      expect(stats.averageThreatLevel).toBe(0);
    });

    it('returns lastUpdateTick: 0 initially', () => {
      const stats = cache.getStats('red');
      expect(stats.lastUpdateTick).toBe(0);
    });
  });

  // ── updateForTeam + data retrieval ────────────────────────────
  describe('after updateForTeam', () => {
    const opponentA = createMockOpponent({
      id: 'p1',
      username: 'Player1',
      position: { x: 10, y: 0, z: 5 },
      aiRole: 'striker',
      team: 'red',
    });

    const opponentB = createMockOpponent({
      id: 'p2',
      username: 'Player2',
      position: { x: 30, y: 0, z: 20 },
      aiRole: 'midfielder',
      team: 'red',
    });

    const despawnedOpponent = createMockOpponent({
      id: 'p3',
      username: 'Despawned',
      position: { x: 5, y: 0, z: 5 },
      aiRole: 'defender',
      team: 'red',
      isSpawned: false,
    });

    // ── getAllOpponents ──────────────────────────────────────────
    describe('getAllOpponents', () => {
      it('returns the opponents that were updated', () => {
        cache.updateForTeam('red', [opponentA]);
        const opponents = cache.getAllOpponents('red');
        expect(opponents).toHaveLength(1);
        expect(opponents[0].playerId).toBe('p1');
        expect(opponents[0].playerName).toBe('Player1');
      });

      it('excludes despawned opponents', () => {
        cache.updateForTeam('red', [opponentA, despawnedOpponent]);
        const opponents = cache.getAllOpponents('red');
        expect(opponents).toHaveLength(1);
        expect(opponents[0].playerId).toBe('p1');
      });

      it('returns copies (not internal references)', () => {
        cache.updateForTeam('red', [opponentA]);
        const opponents1 = cache.getAllOpponents('red');
        const opponents2 = cache.getAllOpponents('red');
        expect(opponents1).not.toBe(opponents2);
      });
    });

    // ── getNearestOpponent ──────────────────────────────────────
    describe('getNearestOpponent', () => {
      it('returns the nearest opponent based on XZ distance', () => {
        cache.updateForTeam('red', [opponentA, opponentB]);

        // Position near opponentA (10, 0, 5)
        const nearest = cache.getNearestOpponent({ x: 11, y: 0, z: 6 }, 'red');
        expect(nearest).not.toBeNull();
        expect(nearest!.playerId).toBe('p1');
      });

      it('returns the other opponent when closer to it', () => {
        cache.updateForTeam('red', [opponentA, opponentB]);

        // Position near opponentB (30, 0, 20)
        const nearest = cache.getNearestOpponent({ x: 29, y: 0, z: 19 }, 'red');
        expect(nearest).not.toBeNull();
        expect(nearest!.playerId).toBe('p2');
      });

      it('returns null after clearing', () => {
        cache.updateForTeam('red', [opponentA]);
        cache.clear();
        expect(cache.getNearestOpponent({ x: 10, y: 0, z: 5 }, 'red')).toBeNull();
      });
    });

    // ── getThreatLevel ──────────────────────────────────────────
    describe('getThreatLevel', () => {
      it('returns > 0 near an opponent', () => {
        cache.updateForTeam('red', [opponentA]);

        // Very close to opponent at (10, 0, 5)
        const threat = cache.getThreatLevel({ x: 10, y: 0, z: 5 }, 'red');
        expect(threat).toBeGreaterThan(0);
      });

      it('returns 0 far from all opponents', () => {
        cache.updateForTeam('red', [opponentA]);

        // Very far away (THREAT_RADIUS is 15 units)
        const threat = cache.getThreatLevel({ x: 200, y: 0, z: 200 }, 'red');
        expect(threat).toBe(0);
      });

      it('returns higher threat closer to opponent', () => {
        cache.updateForTeam('red', [opponentA]);

        const threatClose = cache.getThreatLevel({ x: 11, y: 0, z: 5 }, 'red');
        const threatFar = cache.getThreatLevel({ x: 20, y: 0, z: 5 }, 'red');

        expect(threatClose).toBeGreaterThan(threatFar);
      });
    });

    // ── getOpponentsInRadius ────────────────────────────────────
    describe('getOpponentsInRadius (with data)', () => {
      it('returns opponents within the given radius', () => {
        cache.updateForTeam('red', [opponentA, opponentB]);

        // Radius 5 around opponentA's position should include opponentA
        const nearby = cache.getOpponentsInRadius({ x: 10, y: 0, z: 5 }, 5, 'red');
        expect(nearby).toHaveLength(1);
        expect(nearby[0].playerId).toBe('p1');
      });

      it('returns multiple opponents when both are in radius', () => {
        cache.updateForTeam('red', [opponentA, opponentB]);

        // Large radius from midpoint should include both
        const nearby = cache.getOpponentsInRadius({ x: 20, y: 0, z: 12 }, 20, 'red');
        expect(nearby).toHaveLength(2);
      });

      it('returns empty array when no opponents are within radius', () => {
        cache.updateForTeam('red', [opponentA]);

        const nearby = cache.getOpponentsInRadius({ x: 100, y: 0, z: 100 }, 5, 'red');
        expect(nearby).toEqual([]);
      });
    });

    // ── getOpponentCountInArea (with data) ──────────────────────
    describe('getOpponentCountInArea (with data)', () => {
      it('returns the correct count', () => {
        cache.updateForTeam('red', [opponentA, opponentB]);

        expect(cache.getOpponentCountInArea({ x: 10, y: 0, z: 5 }, 5, 'red')).toBe(1);
        expect(cache.getOpponentCountInArea({ x: 20, y: 0, z: 12 }, 20, 'red')).toBe(2);
        expect(cache.getOpponentCountInArea({ x: 100, y: 0, z: 100 }, 1, 'red')).toBe(0);
      });
    });

    // ── isHighThreatZone (with data) ────────────────────────────
    describe('isHighThreatZone (with data)', () => {
      it('returns true near an opponent', () => {
        cache.updateForTeam('red', [opponentA]);

        // Directly on the opponent should be high threat
        const isHigh = cache.isHighThreatZone({ x: 10, y: 0, z: 5 }, 'red');
        expect(isHigh).toBe(true);
      });

      it('returns false far from opponents', () => {
        cache.updateForTeam('red', [opponentA]);

        const isHigh = cache.isHighThreatZone({ x: 200, y: 0, z: 200 }, 'red');
        expect(isHigh).toBe(false);
      });

      it('respects custom threshold', () => {
        cache.updateForTeam('red', [opponentA]);

        // With a very high threshold, even near an opponent might not qualify
        const isHigh = cache.isHighThreatZone({ x: 10, y: 0, z: 5 }, 'red', 101);
        expect(isHigh).toBe(false);
      });
    });

    // ── getStats (with data) ────────────────────────────────────
    describe('getStats (with data)', () => {
      it('returns correct opponentCount', () => {
        cache.updateForTeam('red', [opponentA, opponentB]);
        const stats = cache.getStats('red');
        expect(stats.opponentCount).toBe(2);
      });

      it('returns non-zero lastUpdateTick after update', () => {
        cache.updateForTeam('red', [opponentA]);
        const stats = cache.getStats('red');
        expect(stats.lastUpdateTick).toBeGreaterThan(0);
      });

      it('returns highThreatZones >= 0', () => {
        cache.updateForTeam('red', [opponentA]);
        const stats = cache.getStats('red');
        expect(stats.highThreatZones).toBeGreaterThanOrEqual(0);
      });

      it('does not affect stats of the other team', () => {
        cache.updateForTeam('red', [opponentA, opponentB]);
        const blueStats = cache.getStats('blue');
        expect(blueStats.opponentCount).toBe(0);
      });
    });
  });
});
