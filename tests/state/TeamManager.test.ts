import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TeamManager } from '../../state/game/TeamManager';

describe('TeamManager', () => {
  let teamManager: TeamManager;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    teamManager = new TeamManager();
  });

  // ── Constructor ──────────────────────────────────────────────
  describe('constructor', () => {
    it('defaults maxPlayersPerTeam to 6', () => {
      expect(teamManager.getMaxPlayersPerTeam()).toBe(6);
    });

    it('starts with no players', () => {
      expect(teamManager.getAllPlayers().size).toBe(0);
    });

    it('accepts custom maxPlayersPerTeam', () => {
      const custom = new TeamManager(3);
      expect(custom.getMaxPlayersPerTeam()).toBe(3);
    });

    it('accepts custom minPlayersPerTeam', () => {
      const custom = new TeamManager(6, 2);
      // minPlayersPerTeam is internal, so verify behavior:
      // with min=2, a single player on one team should not be enough
      custom.addPlayer('p1', 'Player1');
      custom.assignTeam('p1', 'red');
      custom.addPlayer('p2', 'Player2');
      custom.assignTeam('p2', 'blue');
      // 1 on each team, min is 2, so multiplayer check should fail
      expect(custom.hasEnoughPlayers()).toBe(false);
    });

    it('defaults minPlayersPerTeam to 1', () => {
      // With default min=1, one player on each team should be enough
      teamManager.addPlayer('p1', 'Player1');
      teamManager.assignTeam('p1', 'red');
      teamManager.addPlayer('p2', 'Player2');
      teamManager.assignTeam('p2', 'blue');
      expect(teamManager.hasEnoughPlayers()).toBe(true);
    });
  });

  // ── addPlayer ────────────────────────────────────────────────
  describe('addPlayer', () => {
    it('adds a player to the players map', () => {
      teamManager.addPlayer('p1', 'Alice');
      expect(teamManager.getAllPlayers().size).toBe(1);
    });

    it('adds player with team set to null', () => {
      teamManager.addPlayer('p1', 'Alice');
      expect(teamManager.getPlayerTeam('p1')).toBeNull();
    });

    it('stores the player name correctly', () => {
      teamManager.addPlayer('p1', 'Alice');
      const player = teamManager.getAllPlayers().get('p1');
      expect(player?.name).toBe('Alice');
    });

    it('stores the player id correctly', () => {
      teamManager.addPlayer('p1', 'Alice');
      const player = teamManager.getAllPlayers().get('p1');
      expect(player?.id).toBe('p1');
    });

    it('can add multiple players', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.addPlayer('p2', 'Bob');
      teamManager.addPlayer('p3', 'Charlie');
      expect(teamManager.getAllPlayers().size).toBe(3);
    });
  });

  // ── removePlayer ─────────────────────────────────────────────
  describe('removePlayer', () => {
    it('removes a player from the map', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.removePlayer('p1');
      expect(teamManager.getAllPlayers().size).toBe(0);
    });

    it('does not throw when removing a non-existent player', () => {
      expect(() => teamManager.removePlayer('nonexistent')).not.toThrow();
    });

    it('only removes the specified player', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.addPlayer('p2', 'Bob');
      teamManager.removePlayer('p1');
      expect(teamManager.getAllPlayers().has('p1')).toBe(false);
      expect(teamManager.getAllPlayers().has('p2')).toBe(true);
    });

    it('decreases team count when removing a team-assigned player', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.assignTeam('p1', 'red');
      expect(teamManager.getTeamPlayerCount('red')).toBe(1);
      teamManager.removePlayer('p1');
      expect(teamManager.getTeamPlayerCount('red')).toBe(0);
    });
  });

  // ── assignTeam ───────────────────────────────────────────────
  describe('assignTeam', () => {
    it('assigns an existing player to a team', () => {
      teamManager.addPlayer('p1', 'Alice');
      const result = teamManager.assignTeam('p1', 'red');
      expect(result).toBe(true);
      expect(teamManager.getPlayerTeam('p1')).toBe('red');
    });

    it('assigns to blue team', () => {
      teamManager.addPlayer('p1', 'Alice');
      const result = teamManager.assignTeam('p1', 'blue');
      expect(result).toBe(true);
      expect(teamManager.getPlayerTeam('p1')).toBe('blue');
    });

    it('returns false when team is full', () => {
      const small = new TeamManager(2);
      small.addPlayer('p1', 'Alice');
      small.addPlayer('p2', 'Bob');
      small.addPlayer('p3', 'Charlie');
      small.assignTeam('p1', 'red');
      small.assignTeam('p2', 'red');
      const result = small.assignTeam('p3', 'red');
      expect(result).toBe(false);
    });

    it('does not change team when assignment fails', () => {
      const small = new TeamManager(1);
      small.addPlayer('p1', 'Alice');
      small.addPlayer('p2', 'Bob');
      small.assignTeam('p1', 'red');
      small.assignTeam('p2', 'red'); // should fail
      expect(small.getPlayerTeam('p2')).toBeNull();
    });

    it('auto-creates player if not exists', () => {
      const result = teamManager.assignTeam('newPlayer', 'blue');
      expect(result).toBe(true);
      expect(teamManager.getAllPlayers().has('newPlayer')).toBe(true);
      expect(teamManager.getPlayerTeam('newPlayer')).toBe('blue');
    });

    it('auto-created player has empty name', () => {
      teamManager.assignTeam('newPlayer', 'red');
      const player = teamManager.getAllPlayers().get('newPlayer');
      expect(player?.name).toBe('');
    });

    it('can reassign player to a different team', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.assignTeam('p1', 'red');
      expect(teamManager.getPlayerTeam('p1')).toBe('red');
      teamManager.assignTeam('p1', 'blue');
      expect(teamManager.getPlayerTeam('p1')).toBe('blue');
    });
  });

  // ── getPlayerTeam ────────────────────────────────────────────
  describe('getPlayerTeam', () => {
    it('returns null for non-existent player', () => {
      expect(teamManager.getPlayerTeam('nonexistent')).toBeNull();
    });

    it('returns null for unassigned player', () => {
      teamManager.addPlayer('p1', 'Alice');
      expect(teamManager.getPlayerTeam('p1')).toBeNull();
    });

    it('returns "red" for red team player', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.assignTeam('p1', 'red');
      expect(teamManager.getPlayerTeam('p1')).toBe('red');
    });

    it('returns "blue" for blue team player', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.assignTeam('p1', 'blue');
      expect(teamManager.getPlayerTeam('p1')).toBe('blue');
    });
  });

  // ── getTeamPlayerCount ───────────────────────────────────────
  describe('getTeamPlayerCount', () => {
    it('returns 0 for empty team', () => {
      expect(teamManager.getTeamPlayerCount('red')).toBe(0);
      expect(teamManager.getTeamPlayerCount('blue')).toBe(0);
    });

    it('counts only players assigned to that team', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.addPlayer('p2', 'Bob');
      teamManager.addPlayer('p3', 'Charlie');
      teamManager.assignTeam('p1', 'red');
      teamManager.assignTeam('p2', 'red');
      teamManager.assignTeam('p3', 'blue');
      expect(teamManager.getTeamPlayerCount('red')).toBe(2);
      expect(teamManager.getTeamPlayerCount('blue')).toBe(1);
    });

    it('does not count unassigned players', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.addPlayer('p2', 'Bob');
      teamManager.assignTeam('p1', 'red');
      expect(teamManager.getTeamPlayerCount('red')).toBe(1);
      expect(teamManager.getTeamPlayerCount('blue')).toBe(0);
    });
  });

  // ── isTeamFull ───────────────────────────────────────────────
  describe('isTeamFull', () => {
    it('returns false for empty team', () => {
      expect(teamManager.isTeamFull('red')).toBe(false);
    });

    it('returns true when team has max players', () => {
      const small = new TeamManager(2);
      small.addPlayer('p1', 'Alice');
      small.addPlayer('p2', 'Bob');
      small.assignTeam('p1', 'red');
      small.assignTeam('p2', 'red');
      expect(small.isTeamFull('red')).toBe(true);
    });

    it('returns false when team is below max', () => {
      const small = new TeamManager(2);
      small.addPlayer('p1', 'Alice');
      small.assignTeam('p1', 'red');
      expect(small.isTeamFull('red')).toBe(false);
    });

    it('checks teams independently', () => {
      const small = new TeamManager(1);
      small.addPlayer('p1', 'Alice');
      small.assignTeam('p1', 'red');
      expect(small.isTeamFull('red')).toBe(true);
      expect(small.isTeamFull('blue')).toBe(false);
    });
  });

  // ── hasEnoughPlayers ─────────────────────────────────────────
  describe('hasEnoughPlayers', () => {
    it('returns false when no players are assigned', () => {
      expect(teamManager.hasEnoughPlayers()).toBe(false);
    });

    it('returns true for single player (total=1)', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.assignTeam('p1', 'red');
      expect(teamManager.hasEnoughPlayers()).toBe(true);
    });

    it('returns true for multiplayer with min players on each team (default min=1)', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.addPlayer('p2', 'Bob');
      teamManager.assignTeam('p1', 'red');
      teamManager.assignTeam('p2', 'blue');
      expect(teamManager.hasEnoughPlayers()).toBe(true);
    });

    it('returns false for multiplayer when one team has 0 (2 on red, 0 on blue)', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.addPlayer('p2', 'Bob');
      teamManager.assignTeam('p1', 'red');
      teamManager.assignTeam('p2', 'red');
      expect(teamManager.hasEnoughPlayers()).toBe(false);
    });

    it('respects custom minPlayersPerTeam', () => {
      const custom = new TeamManager(6, 3);
      // 2 on each team, min is 3 -> not enough
      custom.addPlayer('p1', 'P1');
      custom.addPlayer('p2', 'P2');
      custom.addPlayer('p3', 'P3');
      custom.addPlayer('p4', 'P4');
      custom.assignTeam('p1', 'red');
      custom.assignTeam('p2', 'red');
      custom.assignTeam('p3', 'blue');
      custom.assignTeam('p4', 'blue');
      expect(custom.hasEnoughPlayers()).toBe(false);

      // Add one more to each team -> 3 on each, should pass
      custom.addPlayer('p5', 'P5');
      custom.addPlayer('p6', 'P6');
      custom.assignTeam('p5', 'red');
      custom.assignTeam('p6', 'blue');
      expect(custom.hasEnoughPlayers()).toBe(true);
    });

    it('single player on blue team also counts as enough', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.assignTeam('p1', 'blue');
      expect(teamManager.hasEnoughPlayers()).toBe(true);
    });
  });

  // ── getAllPlayers ─────────────────────────────────────────────
  describe('getAllPlayers', () => {
    it('returns a Map', () => {
      expect(teamManager.getAllPlayers()).toBeInstanceOf(Map);
    });

    it('returns the internal players map', () => {
      teamManager.addPlayer('p1', 'Alice');
      const players = teamManager.getAllPlayers();
      expect(players.size).toBe(1);
      expect(players.get('p1')?.name).toBe('Alice');
    });
  });

  // ── getTeamCounts ────────────────────────────────────────────
  describe('getTeamCounts', () => {
    it('returns {red: 0, blue: 0} initially', () => {
      expect(teamManager.getTeamCounts()).toEqual({ red: 0, blue: 0 });
    });

    it('reflects correct counts after assignments', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.addPlayer('p2', 'Bob');
      teamManager.addPlayer('p3', 'Charlie');
      teamManager.assignTeam('p1', 'red');
      teamManager.assignTeam('p2', 'blue');
      teamManager.assignTeam('p3', 'blue');
      expect(teamManager.getTeamCounts()).toEqual({ red: 1, blue: 2 });
    });
  });

  // ── getMaxPlayersPerTeam / setMaxPlayersPerTeam ──────────────
  describe('getMaxPlayersPerTeam / setMaxPlayersPerTeam', () => {
    it('returns default max', () => {
      expect(teamManager.getMaxPlayersPerTeam()).toBe(6);
    });

    it('updates max players per team', () => {
      teamManager.setMaxPlayersPerTeam(11);
      expect(teamManager.getMaxPlayersPerTeam()).toBe(11);
    });

    it('enforces new max on subsequent assignments', () => {
      teamManager.setMaxPlayersPerTeam(1);
      teamManager.addPlayer('p1', 'Alice');
      teamManager.addPlayer('p2', 'Bob');
      teamManager.assignTeam('p1', 'red');
      const result = teamManager.assignTeam('p2', 'red');
      expect(result).toBe(false);
    });
  });

  // ── reset ────────────────────────────────────────────────────
  describe('reset', () => {
    it('clears all players', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.addPlayer('p2', 'Bob');
      teamManager.assignTeam('p1', 'red');
      teamManager.reset();
      expect(teamManager.getAllPlayers().size).toBe(0);
    });

    it('team counts are 0 after reset', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.assignTeam('p1', 'red');
      teamManager.reset();
      expect(teamManager.getTeamCounts()).toEqual({ red: 0, blue: 0 });
    });

    it('can add new players after reset', () => {
      teamManager.addPlayer('p1', 'Alice');
      teamManager.reset();
      teamManager.addPlayer('p2', 'Bob');
      expect(teamManager.getAllPlayers().size).toBe(1);
      expect(teamManager.getAllPlayers().has('p2')).toBe(true);
    });
  });
});
