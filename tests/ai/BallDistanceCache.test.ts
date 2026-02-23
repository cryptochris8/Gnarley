import { describe, it, expect, beforeEach } from 'vitest';
import { BallDistanceCache } from '../../ai/BallDistanceCache';

// Helper to create a mock ball entity
function mockBall(x = 0, y = 0, z = 0) {
  return { position: { x, y, z } } as any;
}

// Helper to create a mock AI player entity
function mockPlayer(
  id: string,
  username: string,
  team: 'red' | 'blue',
  aiRole: string,
  x: number,
  y: number,
  z: number,
  isSpawned = true,
) {
  return {
    isSpawned,
    position: { x, y, z },
    player: { id, username },
    team,
    aiRole,
  } as any;
}

describe('BallDistanceCache', () => {
  let cache: BallDistanceCache;

  beforeEach(() => {
    cache = new BallDistanceCache();
  });

  describe('initial state', () => {
    it('getDistance returns Infinity for unknown player', () => {
      expect(cache.getDistance('unknown')).toBe(Infinity);
    });

    it('isClosestToBall returns false for any player', () => {
      expect(cache.isClosestToBall('p1')).toBe(false);
    });

    it('getClosestPlayerId returns null', () => {
      expect(cache.getClosestPlayerId()).toBeNull();
    });

    it('getAllDistancesSorted returns empty array', () => {
      expect(cache.getAllDistancesSorted()).toEqual([]);
    });

    it('getStats returns zeroed stats', () => {
      const stats = cache.getStats();
      expect(stats.trackedPlayers).toBe(0);
      expect(stats.closestPlayer).toBeNull();
      expect(stats.closestDistance).toBe(Infinity);
    });
  });

  describe('updateForTick with a single player', () => {
    it('returns correct distance for a player on the X axis', () => {
      const ball = mockBall(0, 0, 0);
      const player = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);

      cache.updateForTick(ball, [player]);

      // Distance is computed as sqrt(dx^2 + dz^2) -- Y is ignored
      expect(cache.getDistance('p1')).toBe(10);
    });

    it('identifies the single player as closest to the ball', () => {
      const ball = mockBall(0, 0, 0);
      const player = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);

      cache.updateForTick(ball, [player]);

      expect(cache.isClosestToBall('p1')).toBe(true);
      expect(cache.getClosestPlayerId()).toBe('p1');
    });

    it('computes 2D distance ignoring Y component', () => {
      const ball = mockBall(0, 0, 0);
      // Player is 3 units on X and 4 units on Z -- distance should be 5
      const player = mockPlayer('p1', 'Player1', 'blue', 'midfielder', 3, 100, 4);

      cache.updateForTick(ball, [player]);

      expect(cache.getDistance('p1')).toBeCloseTo(5, 5);
    });
  });

  describe('updateForTick with multiple players', () => {
    it('correctly identifies the closest player', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);
      const p2 = mockPlayer('p2', 'Player2', 'blue', 'defender', 3, 0, 4);
      const p3 = mockPlayer('p3', 'Player3', 'red', 'midfielder', 20, 0, 0);

      cache.updateForTick(ball, [p1, p2, p3]);

      expect(cache.getClosestPlayerId()).toBe('p2');
      expect(cache.isClosestToBall('p2')).toBe(true);
      expect(cache.isClosestToBall('p1')).toBe(false);
      expect(cache.isClosestToBall('p3')).toBe(false);
    });

    it('returns correct distances for each player', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);
      const p2 = mockPlayer('p2', 'Player2', 'blue', 'defender', 3, 0, 4);

      cache.updateForTick(ball, [p1, p2]);

      expect(cache.getDistance('p1')).toBe(10);
      expect(cache.getDistance('p2')).toBeCloseTo(5, 5);
    });
  });

  describe('getAllDistancesSorted', () => {
    it('returns players sorted by distance ascending', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 20, 0, 0);
      const p2 = mockPlayer('p2', 'Player2', 'blue', 'defender', 3, 0, 4);
      const p3 = mockPlayer('p3', 'Player3', 'red', 'midfielder', 10, 0, 0);

      cache.updateForTick(ball, [p1, p2, p3]);

      const sorted = cache.getAllDistancesSorted();

      expect(sorted).toHaveLength(3);
      expect(sorted[0].playerId).toBe('p2');
      expect(sorted[0].distance).toBeCloseTo(5, 5);
      expect(sorted[1].playerId).toBe('p3');
      expect(sorted[1].distance).toBe(10);
      expect(sorted[2].playerId).toBe('p1');
      expect(sorted[2].distance).toBe(20);
    });

    it('includes playerName, team, and aiRole in each entry', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 5, 0, 0);

      cache.updateForTick(ball, [p1]);

      const sorted = cache.getAllDistancesSorted();
      expect(sorted[0].playerName).toBe('Player1');
      expect(sorted[0].team).toBe('red');
      expect(sorted[0].aiRole).toBe('striker');
    });
  });

  describe('getStats', () => {
    it('returns correct stats after updateForTick', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);
      const p2 = mockPlayer('p2', 'Player2', 'blue', 'goalkeeper', 3, 0, 0);

      cache.updateForTick(ball, [p1, p2]);

      const stats = cache.getStats();
      expect(stats.trackedPlayers).toBe(2);
      expect(stats.closestPlayer).toBe('p2');
      expect(stats.closestDistance).toBe(3);
      expect(stats.lastUpdateTick).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('resets all cached data', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);

      cache.updateForTick(ball, [p1]);

      // Verify data exists before clearing
      expect(cache.getDistance('p1')).toBe(10);
      expect(cache.getClosestPlayerId()).toBe('p1');

      cache.clear();

      expect(cache.getDistance('p1')).toBe(Infinity);
      expect(cache.isClosestToBall('p1')).toBe(false);
      expect(cache.getClosestPlayerId()).toBeNull();
      expect(cache.getAllDistancesSorted()).toEqual([]);
      expect(cache.getStats().trackedPlayers).toBe(0);
    });
  });

  describe('getDistanceForTeam', () => {
    it('returns distance when team matches', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);

      cache.updateForTick(ball, [p1]);

      expect(cache.getDistanceForTeam('p1', 'red')).toBe(10);
    });

    it('returns Infinity when team does not match', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);

      cache.updateForTick(ball, [p1]);

      expect(cache.getDistanceForTeam('p1', 'blue')).toBe(Infinity);
    });

    it('returns distance when no team filter is provided', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);

      cache.updateForTick(ball, [p1]);

      expect(cache.getDistanceForTeam('p1')).toBe(10);
    });

    it('returns Infinity for unknown player', () => {
      expect(cache.getDistanceForTeam('unknown', 'red')).toBe(Infinity);
    });
  });

  describe('getClosestPlayerForTeam', () => {
    it('returns closest player for a given team', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);
      const p2 = mockPlayer('p2', 'Player2', 'red', 'defender', 5, 0, 0);
      const p3 = mockPlayer('p3', 'Player3', 'blue', 'striker', 3, 0, 0);

      cache.updateForTick(ball, [p1, p2, p3]);

      expect(cache.getClosestPlayerForTeam('red')).toBe('p2');
      expect(cache.getClosestPlayerForTeam('blue')).toBe('p3');
    });

    it('returns null when no players exist for team', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);

      cache.updateForTick(ball, [p1]);

      expect(cache.getClosestPlayerForTeam('blue')).toBeNull();
    });

    it('returns null when cache is empty', () => {
      expect(cache.getClosestPlayerForTeam('red')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles null ball gracefully', () => {
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);

      cache.updateForTick(null as any, [p1]);

      expect(cache.getDistance('p1')).toBe(Infinity);
      expect(cache.getClosestPlayerId()).toBeNull();
      expect(cache.getAllDistancesSorted()).toEqual([]);
    });

    it('handles empty players array', () => {
      const ball = mockBall(0, 0, 0);

      cache.updateForTick(ball, []);

      expect(cache.getClosestPlayerId()).toBeNull();
      expect(cache.getStats().trackedPlayers).toBe(0);
    });

    it('skips unspawned players', () => {
      const ball = mockBall(0, 0, 0);
      const spawned = mockPlayer('p1', 'Spawned', 'red', 'striker', 10, 0, 0, true);
      const unspawned = mockPlayer('p2', 'Unspawned', 'blue', 'defender', 1, 0, 0, false);

      cache.updateForTick(ball, [spawned, unspawned]);

      expect(cache.getDistance('p1')).toBe(10);
      expect(cache.getDistance('p2')).toBe(Infinity);
      expect(cache.getClosestPlayerId()).toBe('p1');
      expect(cache.getStats().trackedPlayers).toBe(1);
    });

    it('handles ball at non-origin position', () => {
      const ball = mockBall(5, 0, 5);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 8, 0, 9);

      cache.updateForTick(ball, [p1]);

      // dx=3, dz=4, distance=5
      expect(cache.getDistance('p1')).toBeCloseTo(5, 5);
    });

    it('handles player at exact same position as ball', () => {
      const ball = mockBall(5, 0, 5);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 5, 0, 5);

      cache.updateForTick(ball, [p1]);

      expect(cache.getDistance('p1')).toBe(0);
      expect(cache.isClosestToBall('p1')).toBe(true);
    });

    it('clears previous tick data on each update', () => {
      const ball = mockBall(0, 0, 0);
      const p1 = mockPlayer('p1', 'Player1', 'red', 'striker', 10, 0, 0);
      const p2 = mockPlayer('p2', 'Player2', 'blue', 'defender', 5, 0, 0);

      // First update with p1 and p2
      cache.updateForTick(ball, [p1, p2]);
      expect(cache.getDistance('p1')).toBe(10);
      expect(cache.getDistance('p2')).toBe(5);

      // Second update with only p2
      cache.updateForTick(ball, [p2]);
      expect(cache.getDistance('p1')).toBe(Infinity); // p1 no longer tracked
      expect(cache.getDistance('p2')).toBe(5);
    });
  });
});
