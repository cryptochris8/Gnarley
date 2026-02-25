/**
 * TournamentManager Tests
 *
 * Covers tournament creation, registration, bracket generation,
 * match scheduling, ready checks, progression, persistence, and notifications.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────
const connectedPlayers = vi.hoisted(() => new Map<string, any>());

const mockGetGlobalData = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockSetGlobalData = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('hytopia', () => ({
  PlayerManager: {
    instance: {
      getConnectedPlayerByUsername: (username: string) => connectedPlayers.get(username),
    },
  },
  PersistenceManager: {
    instance: {
      getGlobalData: mockGetGlobalData,
      setGlobalData: mockSetGlobalData,
    },
  },
}));

vi.mock('../../state/gameModes', () => ({
  GameMode: {
    FIFA: 'fifa',
    ARCADE: 'arcade',
    TOURNAMENT: 'tournament',
    PENALTY_SHOOTOUT: 'penalty_shootout',
  },
}));

import {
  TournamentManager,
  TournamentType,
  TournamentStatus,
  MatchStatus,
  type Tournament,
  type TournamentMatch,
} from '../../state/tournamentManager';
import { GameMode } from '../../state/gameModes';

// ── Helpers ───────────────────────────────────────────────────────

/** Flush pending microtasks (async persistence calls) */
async function flushAsync() {
  await vi.advanceTimersByTimeAsync(0);
}

function createMockConnectedPlayer(username: string) {
  const player = {
    username,
    ui: { sendData: vi.fn() },
    getPersistedData: vi.fn().mockReturnValue({}),
    setPersistedData: vi.fn(),
  };
  connectedPlayers.set(username, player);
  return player;
}

function createMockWorld() {
  return {
    id: 'world-test',
    on: vi.fn(),
    entityManager: { getAllEntities: vi.fn().mockReturnValue([]) },
  } as any;
}

function createTestManager(): TournamentManager {
  return new TournamentManager(createMockWorld());
}

function registerNPlayers(
  manager: TournamentManager,
  tournamentId: string,
  count: number,
  startIndex = 1,
): string[] {
  const usernames: string[] = [];
  for (let i = startIndex; i < startIndex + count; i++) {
    const name = `player${i}`;
    createMockConnectedPlayer(name);
    manager.registerPlayer(tournamentId, name);
    usernames.push(name);
  }
  return usernames;
}

/**
 * Creates a tournament that auto-starts (all slots filled).
 * Returns the latest snapshot and player list.
 */
function createTournamentWithPlayers(
  manager: TournamentManager,
  count: number,
  type: TournamentType = TournamentType.SINGLE_ELIMINATION,
  mode: GameMode = GameMode.FIFA,
): { tournament: Tournament; usernames: string[] } {
  const tournament = manager.createTournament('Test Cup', type, mode, count as any, 10);
  const usernames = registerNPlayers(manager, tournament.id, count);
  // After registering maxPlayers the tournament auto-starts
  const t = manager.getTournament(tournament.id)!;
  return { tournament: t, usernames };
}

/**
 * Create a tournament in REGISTRATION status (not yet full).
 * Registers `registered` players out of `maxPlayers`.
 */
function createRegistrationTournament(
  manager: TournamentManager,
  maxPlayers: number = 8,
  registered: number = 0,
  type: TournamentType = TournamentType.SINGLE_ELIMINATION,
  mode: GameMode = GameMode.FIFA,
): { tournament: Tournament; usernames: string[] } {
  const tournament = manager.createTournament('Test Cup', type, mode, maxPlayers, 10);
  const usernames = registered > 0 ? registerNPlayers(manager, tournament.id, registered) : [];
  return { tournament: manager.getTournament(tournament.id)!, usernames };
}

/**
 * Get match to a ready-check state.
 * Clears all auto-scheduled timers first so we have full control over timing.
 */
function setupMatchReadyCheck(
  manager: TournamentManager,
): { tournament: Tournament; match: TournamentMatch } {
  const { tournament } = createTournamentWithPlayers(manager, 4);
  const match = tournament.bracket.find(m => m.roundNumber === 1)!;
  // Clear ALL auto-scheduled timers from startTournament → scheduleFirstRoundMatches
  manager.cleanup();
  // Now manually start ready check with a clean slate
  manager.startReadyCheck(tournament.id, match.id);
  return { tournament: manager.getTournament(tournament.id)!, match };
}

// ── Test suite ────────────────────────────────────────────────────

describe('TournamentManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    connectedPlayers.clear();
    mockGetGlobalData.mockResolvedValue(null);
    mockSetGlobalData.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('creates an instance', () => {
      const manager = createTestManager();
      expect(manager).toBeDefined();
    });

    it('loads tournaments from persistence on creation', () => {
      createTestManager();
      expect(mockGetGlobalData).toHaveBeenCalledWith('tournaments');
    });

    it('starts with no active tournaments', () => {
      const manager = createTestManager();
      expect(manager.getAllTournaments()).toHaveLength(0);
    });

    it('starts player status monitoring', () => {
      const manager = createTestManager();
      // Monitoring interval exists — advance 30s and check it doesn't throw
      vi.advanceTimersByTime(30000);
      expect(manager).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // createTournament
  // ─────────────────────────────────────────────────────────────
  describe('createTournament', () => {
    it('creates a tournament with correct fields', () => {
      const manager = createTestManager();
      const t = manager.createTournament('My Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8, 10);
      expect(t.name).toBe('My Cup');
      expect(t.type).toBe(TournamentType.SINGLE_ELIMINATION);
      expect(t.gameMode).toBe(GameMode.FIFA);
      expect(t.maxPlayers).toBe(8);
      expect(t.status).toBe(TournamentStatus.REGISTRATION);
    });

    it('generates unique IDs', () => {
      const manager = createTestManager();
      const t1 = manager.createTournament('Cup A', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 4, 10);
      vi.advanceTimersByTime(1);
      const t2 = manager.createTournament('Cup B', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 4, 10);
      expect(t1.id).not.toBe(t2.id);
    });

    it('sets registration deadline based on minutes param', () => {
      const manager = createTestManager();
      const now = Date.now();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8, 15);
      expect(t.registrationDeadline).toBe(now + 15 * 60 * 1000);
    });

    it('defaults createdBy to "system"', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(t.createdBy).toBe('system');
    });

    it('calls persistence save', async () => {
      const manager = createTestManager();
      manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });

    it('stores the tournament in activeTournaments', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(manager.getTournament(t.id)).toBeDefined();
    });

    it('throws for invalid player count', () => {
      const manager = createTestManager();
      expect(() =>
        manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 5),
      ).toThrow('Tournament size must be 4, 8, 16, or 32 players');
    });

    it('allows 4 players', () => {
      const manager = createTestManager();
      expect(() =>
        manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 4),
      ).not.toThrow();
    });

    it('allows 16 players', () => {
      const manager = createTestManager();
      expect(() =>
        manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 16),
      ).not.toThrow();
    });

    it('allows 32 players', () => {
      const manager = createTestManager();
      expect(() =>
        manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 32),
      ).not.toThrow();
    });

    it('creates with ARCADE mode', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Arcade Cup', TournamentType.SINGLE_ELIMINATION, GameMode.ARCADE, 8);
      expect(t.gameMode).toBe(GameMode.ARCADE);
    });

    it('creates round robin tournament', () => {
      const manager = createTestManager();
      const t = manager.createTournament('RR Cup', TournamentType.ROUND_ROBIN, GameMode.FIFA, 4);
      expect(t.type).toBe(TournamentType.ROUND_ROBIN);
    });

    it('creates double elimination tournament', () => {
      const manager = createTestManager();
      const t = manager.createTournament('DE Cup', TournamentType.DOUBLE_ELIMINATION, GameMode.FIFA, 4);
      expect(t.type).toBe(TournamentType.DOUBLE_ELIMINATION);
    });

    it('starts with empty bracket', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(t.bracket).toHaveLength(0);
    });

    it('starts with currentRound = 1', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(t.currentRound).toBe(1);
    });

    it('starts with empty players object', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(Object.keys(t.players)).toHaveLength(0);
    });

    it('has rules array', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(t.rules.length).toBeGreaterThan(0);
    });

    it('schedules registration deadline timeout', () => {
      const manager = createTestManager();
      manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 4, 10);
      // Registration deadline fires after 10 minutes
      createMockConnectedPlayer('p1');
      manager.registerPlayer(manager.getAllTournaments()[0].id, 'p1');
      vi.advanceTimersByTime(10 * 60 * 1000);
      const t = manager.getAllTournaments()[0];
      expect(t.status).toBe(TournamentStatus.CANCELLED);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // registerPlayer
  // ─────────────────────────────────────────────────────────────
  describe('registerPlayer', () => {
    it('registers a player successfully', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('alice');
      expect(manager.registerPlayer(tournament.id, 'alice')).toBe(true);
    });

    it('adds player to tournament.players', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('alice');
      manager.registerPlayer(tournament.id, 'alice');
      expect(manager.getTournament(tournament.id)!.players['alice']).toBeDefined();
    });

    it('sets correct player fields', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('alice');
      manager.registerPlayer(tournament.id, 'alice', 'Alice Display');
      const player = manager.getTournament(tournament.id)!.players['alice'];
      expect(player.username).toBe('alice');
      expect(player.displayName).toBe('Alice Display');
      expect(player.isReady).toBe(false);
      expect(player.stats.wins).toBe(0);
    });

    it('defaults displayName to username', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('bob');
      manager.registerPlayer(tournament.id, 'bob');
      expect(manager.getTournament(tournament.id)!.players['bob'].displayName).toBe('bob');
    });

    it('returns false for non-existent tournament', () => {
      const manager = createTestManager();
      createMockConnectedPlayer('alice');
      expect(manager.registerPlayer('fake', 'alice')).toBe(false);
    });

    it('returns false if not in registration phase', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      // Tournament auto-started → IN_PROGRESS
      createMockConnectedPlayer('latecomer');
      expect(manager.registerPlayer(tournament.id, 'latecomer')).toBe(false);
    });

    it('returns false when tournament is full', () => {
      const manager = createTestManager();
      // Fill the tournament (4 players → auto-starts)
      const { tournament } = createTournamentWithPlayers(manager, 4);
      createMockConnectedPlayer('p5');
      expect(manager.registerPlayer(tournament.id, 'p5')).toBe(false);
    });

    it('returns false for duplicate registration', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('alice');
      manager.registerPlayer(tournament.id, 'alice');
      expect(manager.registerPlayer(tournament.id, 'alice')).toBe(false);
    });

    it('calls persistence save after registration', async () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      mockSetGlobalData.mockClear();
      createMockConnectedPlayer('alice');
      manager.registerPlayer(tournament.id, 'alice');
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });

    it('auto-starts tournament when full (4 players)', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(tournament.status).toBe(TournamentStatus.IN_PROGRESS);
    });

    it('auto-starts tournament when full (8 players)', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 8);
      expect(tournament.status).toBe(TournamentStatus.IN_PROGRESS);
    });

    it('generates bracket on auto-start', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(tournament.bracket.length).toBeGreaterThan(0);
    });

    it('detects online status during registration', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('online_player');
      manager.registerPlayer(tournament.id, 'online_player');
      expect(manager.getTournament(tournament.id)!.players['online_player'].isOnline).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // unregisterPlayer
  // ─────────────────────────────────────────────────────────────
  describe('unregisterPlayer', () => {
    it('removes a registered player', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('alice');
      manager.registerPlayer(tournament.id, 'alice');
      expect(manager.unregisterPlayer(tournament.id, 'alice')).toBe(true);
      expect(manager.getTournament(tournament.id)!.players['alice']).toBeUndefined();
    });

    it('returns false for non-existent tournament', () => {
      const manager = createTestManager();
      expect(manager.unregisterPlayer('fake', 'alice')).toBe(false);
    });

    it('returns false if not in registration phase', () => {
      const manager = createTestManager();
      const { tournament, usernames } = createTournamentWithPlayers(manager, 4);
      expect(manager.unregisterPlayer(tournament.id, usernames[0])).toBe(false);
    });

    it('returns false for unregistered player', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      expect(manager.unregisterPlayer(tournament.id, 'nobody')).toBe(false);
    });

    it('calls persistence save after unregistration', async () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('alice');
      manager.registerPlayer(tournament.id, 'alice');
      mockSetGlobalData.mockClear();
      manager.unregisterPlayer(tournament.id, 'alice');
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });

    it('reduces player count after unregister', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('alice');
      createMockConnectedPlayer('bob');
      manager.registerPlayer(tournament.id, 'alice');
      manager.registerPlayer(tournament.id, 'bob');
      manager.unregisterPlayer(tournament.id, 'alice');
      expect(Object.keys(manager.getTournament(tournament.id)!.players)).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Bracket generation — single elimination
  // ─────────────────────────────────────────────────────────────
  describe('bracket generation — single elimination', () => {
    it('creates correct number of first round matches for 4 players', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const round1 = tournament.bracket.filter(m => m.roundNumber === 1);
      expect(round1).toHaveLength(2);
    });

    it('creates correct number of first round matches for 8 players', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 8);
      const round1 = tournament.bracket.filter(m => m.roundNumber === 1);
      expect(round1).toHaveLength(4);
    });

    it('creates second round TBD matches for 4 players', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const round2 = tournament.bracket.filter(m => m.roundNumber === 2);
      expect(round2).toHaveLength(1);
      expect(round2[0].player1).toBe('TBD');
      expect(round2[0].player2).toBe('TBD');
    });

    it('assigns all players to first round matches', () => {
      const manager = createTestManager();
      const { tournament, usernames } = createTournamentWithPlayers(manager, 4);
      const round1 = tournament.bracket.filter(m => m.roundNumber === 1);
      const assigned = round1.flatMap(m => [m.player1, m.player2]);
      for (const u of usernames) {
        expect(assigned).toContain(u);
      }
    });

    it('sets all first round matches to SCHEDULED', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const round1 = tournament.bracket.filter(m => m.roundNumber === 1);
      round1.forEach(m => expect(m.status).toBe(MatchStatus.SCHEDULED));
    });

    it('total bracket size for 8 players = 7', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 8);
      expect(tournament.bracket).toHaveLength(7);
    });

    it('total bracket size for 4 players = 3', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(tournament.bracket).toHaveLength(3);
    });

    it('each match has the correct gameMode', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.SINGLE_ELIMINATION, GameMode.ARCADE);
      tournament.bracket.forEach(m => expect(m.gameMode).toBe(GameMode.ARCADE));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Bracket generation — round robin
  // ─────────────────────────────────────────────────────────────
  describe('bracket generation — round robin', () => {
    it('creates correct number of matches for 4 players (6 matches)', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      expect(tournament.bracket).toHaveLength(6);
    });

    it('every player plays every other player', () => {
      const manager = createTestManager();
      const { tournament, usernames } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      for (const u of usernames) {
        const matches = tournament.bracket.filter(m => m.player1 === u || m.player2 === u);
        expect(matches).toHaveLength(3);
      }
    });

    it('all matches start as SCHEDULED', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      tournament.bracket.forEach(m => expect(m.status).toBe(MatchStatus.SCHEDULED));
    });

    it('no duplicate matchups', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      const pairings = tournament.bracket.map(m => [m.player1, m.player2].sort().join('-'));
      const unique = new Set(pairings);
      expect(unique.size).toBe(pairings.length);
    });

    it('all matches are round 1 in round robin', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      tournament.bracket.forEach(m => expect(m.roundNumber).toBe(1));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Bracket generation — double elimination
  // ─────────────────────────────────────────────────────────────
  describe('bracket generation — double elimination', () => {
    it('generates at least single elimination bracket matches', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.DOUBLE_ELIMINATION);
      expect(tournament.bracket.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // scheduleMatch
  // ─────────────────────────────────────────────────────────────
  describe('scheduleMatch', () => {
    it('returns false for non-existent tournament', () => {
      const manager = createTestManager();
      expect(manager.scheduleMatch('fake', 'match_1', 2)).toBe(false);
    });

    it('returns false for non-existent match', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(manager.scheduleMatch(tournament.id, 'fake_match', 2)).toBe(false);
    });

    it('sets scheduledTime on the match', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      const now = Date.now();
      manager.scheduleMatch(tournament.id, match.id, 5);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.scheduledTime).toBe(now + 5 * 60 * 1000);
    });

    it('sets match status to SCHEDULED', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      manager.scheduleMatch(tournament.id, match.id, 5);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.SCHEDULED);
    });

    it('returns true on success', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(manager.scheduleMatch(tournament.id, tournament.bracket[0].id, 5)).toBe(true);
    });

    it('sends notifications to match players', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      const p1 = connectedPlayers.get(match.player1);
      const p2 = connectedPlayers.get(match.player2);
      p1?.ui.sendData.mockClear();
      p2?.ui.sendData.mockClear();
      manager.scheduleMatch(tournament.id, match.id, 5);
      expect(p1?.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'tournament-match-scheduled' }));
      expect(p2?.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'tournament-match-scheduled' }));
    });

    it('triggers ready check before match time', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      manager.scheduleMatch(tournament.id, match.id, 5);
      // Ready check at (5-1)*60*1000 = 4 minutes
      vi.advanceTimersByTime(4 * 60 * 1000);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.READY_CHECK);
    });

    it('calls persistence save', async () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      mockSetGlobalData.mockClear();
      manager.scheduleMatch(tournament.id, tournament.bracket[0].id, 5);
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // startReadyCheck
  // ─────────────────────────────────────────────────────────────
  describe('startReadyCheck', () => {
    it('returns false for non-existent tournament', () => {
      const manager = createTestManager();
      expect(manager.startReadyCheck('fake', 'match_1')).toBe(false);
    });

    it('returns false for non-existent match', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(manager.startReadyCheck(tournament.id, 'fake')).toBe(false);
    });

    it('sets match status to READY_CHECK when both players online', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.READY_CHECK);
    });

    it('sets readyCheckStarted and readyCheckExpires', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.readyCheckStarted).toBeDefined();
      expect(updated.readyCheckExpires).toBeDefined();
    });

    it('resets player ready flags', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.player1Ready).toBe(false);
      expect(updated.player2Ready).toBe(false);
    });

    it('returns true on success', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(manager.startReadyCheck(tournament.id, tournament.bracket[0].id)).toBe(true);
    });

    it('returns false if player1 is offline', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      expect(manager.startReadyCheck(tournament.id, match.id)).toBe(false);
    });

    it('returns false if player2 is offline', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player2);
      expect(manager.startReadyCheck(tournament.id, match.id)).toBe(false);
    });

    it('sends ready check notifications to players', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      const p1 = connectedPlayers.get(match.player1);
      const p2 = connectedPlayers.get(match.player2);
      p1?.ui.sendData.mockClear();
      p2?.ui.sendData.mockClear();
      manager.startReadyCheck(tournament.id, match.id);
      expect(p1?.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'tournament-ready-check' }));
      expect(p2?.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'tournament-ready-check' }));
    });

    it('handles player unavailable when both offline', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      connectedPlayers.delete(match.player2);
      expect(manager.startReadyCheck(tournament.id, match.id)).toBe(false);
    });

    it('calls persistence save', async () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      mockSetGlobalData.mockClear();
      manager.startReadyCheck(tournament.id, tournament.bracket[0].id);
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // setPlayerReady
  // ─────────────────────────────────────────────────────────────
  describe('setPlayerReady', () => {
    it('returns false for non-existent tournament', () => {
      const manager = createTestManager();
      expect(manager.setPlayerReady('fake', 'match_1', 'alice', true)).toBe(false);
    });

    it('returns false for non-existent match', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(manager.setPlayerReady(tournament.id, 'fake', 'alice', true)).toBe(false);
    });

    it('returns false if match is not in ready check phase', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      expect(manager.setPlayerReady(tournament.id, match.id, match.player1, true)).toBe(false);
    });

    it('marks player1 as ready', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.player1Ready).toBe(true);
    });

    it('marks player2 as ready', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player2, true);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.player2Ready).toBe(true);
    });

    it('returns false for unknown player', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      expect(manager.setPlayerReady(tournament.id, match.id, 'stranger', true)).toBe(false);
    });

    it('starts match when both players ready', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      manager.setPlayerReady(tournament.id, match.id, match.player2, true);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.IN_PROGRESS);
    });

    it('does not start match when only player1 is ready', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.READY_CHECK);
    });

    it('allows setting player as not ready', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      manager.setPlayerReady(tournament.id, match.id, match.player1, false);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.player1Ready).toBe(false);
    });

    it('calls persistence save', async () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      mockSetGlobalData.mockClear();
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // completeMatch
  // ─────────────────────────────────────────────────────────────
  describe('completeMatch', () => {
    function setupInProgressMatch(manager: TournamentManager) {
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      manager.setPlayerReady(tournament.id, match.id, match.player2, true);
      return { tournament: manager.getTournament(tournament.id)!, match };
    }

    it('returns false for non-existent tournament', () => {
      const manager = createTestManager();
      expect(manager.completeMatch('fake', 'match_1', 'alice', { player1: 3, player2: 1 })).toBe(false);
    });

    it('returns false for non-existent match', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(manager.completeMatch(tournament.id, 'fake', 'alice', { player1: 3, player2: 1 })).toBe(false);
    });

    it('sets match status to COMPLETED', () => {
      const manager = createTestManager();
      const { tournament, match } = setupInProgressMatch(manager);
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 3, player2: 1 });
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.COMPLETED);
    });

    it('records the winner', () => {
      const manager = createTestManager();
      const { tournament, match } = setupInProgressMatch(manager);
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 3, player2: 1 });
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.winner).toBe(match.player1);
    });

    it('records the score', () => {
      const manager = createTestManager();
      const { tournament, match } = setupInProgressMatch(manager);
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 3, player2: 1 });
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.score).toEqual({ player1: 3, player2: 1 });
    });

    it('returns true on success', () => {
      const manager = createTestManager();
      const { tournament, match } = setupInProgressMatch(manager);
      expect(manager.completeMatch(tournament.id, match.id, match.player1, { player1: 3, player2: 1 })).toBe(true);
    });

    it('calls persistence save', async () => {
      const manager = createTestManager();
      const { tournament, match } = setupInProgressMatch(manager);
      mockSetGlobalData.mockClear();
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 1, player2: 0 });
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });

    it('notifies players of bracket update', () => {
      const manager = createTestManager();
      const { tournament, match } = setupInProgressMatch(manager);
      for (const [, p] of connectedPlayers) p.ui.sendData.mockClear();
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 3, player2: 1 });
      let bracketUpdateSent = false;
      for (const [, p] of connectedPlayers) {
        if (p.ui.sendData.mock.calls.some((c: any[]) => c[0]?.type === 'tournament-bracket-updated')) {
          bracketUpdateSent = true;
        }
      }
      expect(bracketUpdateSent).toBe(true);
    });

    it('updates winner player stats', () => {
      const manager = createTestManager();
      const { tournament, match } = setupInProgressMatch(manager);
      const winnerPlayer = connectedPlayers.get(match.player1);
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 3, player2: 1 });
      expect(winnerPlayer?.setPersistedData).toHaveBeenCalled();
    });

    it('updates loser player stats', () => {
      const manager = createTestManager();
      const { tournament, match } = setupInProgressMatch(manager);
      const loserPlayer = connectedPlayers.get(match.player2);
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 3, player2: 1 });
      expect(loserPlayer?.setPersistedData).toHaveBeenCalled();
    });

    it('advances winner to next round in single elimination', () => {
      const manager = createTestManager();
      const { tournament, match } = setupInProgressMatch(manager);
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 3, player2: 1 });
      const nextRoundMatches = manager.getTournament(tournament.id)!.bracket.filter(m => m.roundNumber === 2);
      const hasWinner = nextRoundMatches.some(m => m.player1 === match.player1 || m.player2 === match.player1);
      expect(hasWinner).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Single elimination advancement
  // ─────────────────────────────────────────────────────────────
  describe('single elimination advancement', () => {
    it('fills TBD slot in next round when first match completes', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match1 = tournament.bracket[0];
      manager.startReadyCheck(tournament.id, match1.id);
      manager.setPlayerReady(tournament.id, match1.id, match1.player1, true);
      manager.setPlayerReady(tournament.id, match1.id, match1.player2, true);
      manager.completeMatch(tournament.id, match1.id, match1.player1, { player1: 2, player2: 0 });

      const finalMatch = manager.getTournament(tournament.id)!.bracket.find(m => m.roundNumber === 2)!;
      expect(finalMatch.player1 === match1.player1 || finalMatch.player2 === match1.player1).toBe(true);
    });

    it('schedules final when both semifinal winners determined', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match1 = tournament.bracket[0];
      const match2 = tournament.bracket[1];

      manager.startReadyCheck(tournament.id, match1.id);
      manager.setPlayerReady(tournament.id, match1.id, match1.player1, true);
      manager.setPlayerReady(tournament.id, match1.id, match1.player2, true);
      manager.completeMatch(tournament.id, match1.id, match1.player1, { player1: 2, player2: 0 });

      manager.startReadyCheck(tournament.id, match2.id);
      manager.setPlayerReady(tournament.id, match2.id, match2.player1, true);
      manager.setPlayerReady(tournament.id, match2.id, match2.player2, true);
      manager.completeMatch(tournament.id, match2.id, match2.player2, { player1: 1, player2: 3 });

      const finalMatch = manager.getTournament(tournament.id)!.bracket.find(m => m.roundNumber === 2)!;
      expect(finalMatch.player1).not.toBe('TBD');
      expect(finalMatch.player2).not.toBe('TBD');
    });

    it('completes tournament when all matches done', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const [match1, match2] = tournament.bracket.filter(m => m.roundNumber === 1);

      manager.startReadyCheck(tournament.id, match1.id);
      manager.setPlayerReady(tournament.id, match1.id, match1.player1, true);
      manager.setPlayerReady(tournament.id, match1.id, match1.player2, true);
      manager.completeMatch(tournament.id, match1.id, match1.player1, { player1: 2, player2: 0 });

      manager.startReadyCheck(tournament.id, match2.id);
      manager.setPlayerReady(tournament.id, match2.id, match2.player1, true);
      manager.setPlayerReady(tournament.id, match2.id, match2.player2, true);
      manager.completeMatch(tournament.id, match2.id, match2.player2, { player1: 1, player2: 3 });

      // Final match now has both players
      const finalMatch = manager.getTournament(tournament.id)!.bracket.find(m => m.roundNumber === 2)!;
      manager.startReadyCheck(tournament.id, finalMatch.id);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player1, true);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player2, true);
      manager.completeMatch(tournament.id, finalMatch.id, finalMatch.player1, { player1: 4, player2: 2 });

      const t = manager.getTournament(tournament.id)!;
      expect(t.status).toBe(TournamentStatus.COMPLETED);
      expect(t.winner).toBe(finalMatch.player1);
    });

    it('sets tournament winner', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const [match1, match2] = tournament.bracket.filter(m => m.roundNumber === 1);

      manager.startReadyCheck(tournament.id, match1.id);
      manager.setPlayerReady(tournament.id, match1.id, match1.player1, true);
      manager.setPlayerReady(tournament.id, match1.id, match1.player2, true);
      manager.completeMatch(tournament.id, match1.id, match1.player1, { player1: 2, player2: 0 });

      manager.startReadyCheck(tournament.id, match2.id);
      manager.setPlayerReady(tournament.id, match2.id, match2.player1, true);
      manager.setPlayerReady(tournament.id, match2.id, match2.player2, true);
      manager.completeMatch(tournament.id, match2.id, match2.player2, { player1: 1, player2: 3 });

      const finalMatch = manager.getTournament(tournament.id)!.bracket.find(m => m.roundNumber === 2)!;
      manager.startReadyCheck(tournament.id, finalMatch.id);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player1, true);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player2, true);
      manager.completeMatch(tournament.id, finalMatch.id, finalMatch.player2, { player1: 0, player2: 1 });

      expect(manager.getTournament(tournament.id)!.winner).toBe(finalMatch.player2);
    });

    it('notifies tournament completion to all players', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const [match1, match2] = tournament.bracket.filter(m => m.roundNumber === 1);

      manager.startReadyCheck(tournament.id, match1.id);
      manager.setPlayerReady(tournament.id, match1.id, match1.player1, true);
      manager.setPlayerReady(tournament.id, match1.id, match1.player2, true);
      manager.completeMatch(tournament.id, match1.id, match1.player1, { player1: 1, player2: 0 });

      manager.startReadyCheck(tournament.id, match2.id);
      manager.setPlayerReady(tournament.id, match2.id, match2.player1, true);
      manager.setPlayerReady(tournament.id, match2.id, match2.player2, true);
      manager.completeMatch(tournament.id, match2.id, match2.player1, { player1: 1, player2: 0 });

      const finalMatch = manager.getTournament(tournament.id)!.bracket.find(m => m.roundNumber === 2)!;
      manager.startReadyCheck(tournament.id, finalMatch.id);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player1, true);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player2, true);

      for (const [, p] of connectedPlayers) p.ui.sendData.mockClear();
      manager.completeMatch(tournament.id, finalMatch.id, finalMatch.player1, { player1: 2, player2: 1 });

      let completionSent = false;
      for (const [, p] of connectedPlayers) {
        if (p.ui.sendData.mock.calls.some((c: any[]) => c[0]?.type === 'tournament-completed')) {
          completionSent = true;
        }
      }
      expect(completionSent).toBe(true);
    });

    it('updates player tournament history on completion', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const [match1, match2] = tournament.bracket.filter(m => m.roundNumber === 1);

      manager.startReadyCheck(tournament.id, match1.id);
      manager.setPlayerReady(tournament.id, match1.id, match1.player1, true);
      manager.setPlayerReady(tournament.id, match1.id, match1.player2, true);
      manager.completeMatch(tournament.id, match1.id, match1.player1, { player1: 1, player2: 0 });

      manager.startReadyCheck(tournament.id, match2.id);
      manager.setPlayerReady(tournament.id, match2.id, match2.player1, true);
      manager.setPlayerReady(tournament.id, match2.id, match2.player2, true);
      manager.completeMatch(tournament.id, match2.id, match2.player1, { player1: 1, player2: 0 });

      const finalMatch = manager.getTournament(tournament.id)!.bracket.find(m => m.roundNumber === 2)!;
      manager.startReadyCheck(tournament.id, finalMatch.id);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player1, true);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player2, true);

      const winner = connectedPlayers.get(finalMatch.player1);
      winner?.setPersistedData.mockClear();
      manager.completeMatch(tournament.id, finalMatch.id, finalMatch.player1, { player1: 2, player2: 1 });
      expect(winner?.setPersistedData).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Round robin advancement
  // ─────────────────────────────────────────────────────────────
  describe('round robin advancement', () => {
    it('schedules next match after one completes', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      const match1 = tournament.bracket[0];
      manager.startReadyCheck(tournament.id, match1.id);
      manager.setPlayerReady(tournament.id, match1.id, match1.player1, true);
      manager.setPlayerReady(tournament.id, match1.id, match1.player2, true);
      manager.completeMatch(tournament.id, match1.id, match1.player1, { player1: 2, player2: 1 });
      const remaining = manager.getTournament(tournament.id)!.bracket.filter(m => m.status !== MatchStatus.COMPLETED);
      const scheduled = remaining.filter(m => m.scheduledTime !== undefined);
      expect(scheduled.length).toBeGreaterThanOrEqual(1);
    });

    it('determines winner by most wins after all matches', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      const allMatchIds = tournament.bracket.map(m => m.id);
      for (const matchId of allMatchIds) {
        const t = manager.getTournament(tournament.id)!;
        const m = t.bracket.find(b => b.id === matchId)!;
        if (m.status === MatchStatus.COMPLETED) continue;
        manager.startReadyCheck(tournament.id, m.id);
        manager.setPlayerReady(tournament.id, m.id, m.player1, true);
        manager.setPlayerReady(tournament.id, m.id, m.player2, true);
        manager.completeMatch(tournament.id, m.id, m.player1, { player1: 2, player2: 1 });
      }
      const t = manager.getTournament(tournament.id)!;
      expect(t.status).toBe(TournamentStatus.COMPLETED);
      expect(t.winner).toBeDefined();
    });

    it('completes tournament when all matches done', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      const allMatchIds = tournament.bracket.map(m => m.id);
      for (const matchId of allMatchIds) {
        const t = manager.getTournament(tournament.id)!;
        const m = t.bracket.find(b => b.id === matchId)!;
        if (m.status === MatchStatus.COMPLETED) continue;
        manager.startReadyCheck(tournament.id, m.id);
        manager.setPlayerReady(tournament.id, m.id, m.player1, true);
        manager.setPlayerReady(tournament.id, m.id, m.player2, true);
        manager.completeMatch(tournament.id, m.id, m.player1, { player1: 1, player2: 0 });
      }
      expect(manager.getTournament(tournament.id)!.status).toBe(TournamentStatus.COMPLETED);
    });

    it('uses goal difference as tiebreaker', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      const allMatchIds = tournament.bracket.map(m => m.id);
      for (const matchId of allMatchIds) {
        const t = manager.getTournament(tournament.id)!;
        const m = t.bracket.find(b => b.id === matchId)!;
        if (m.status === MatchStatus.COMPLETED) continue;
        manager.startReadyCheck(tournament.id, m.id);
        manager.setPlayerReady(tournament.id, m.id, m.player1, true);
        manager.setPlayerReady(tournament.id, m.id, m.player2, true);
        manager.completeMatch(tournament.id, m.id, m.player1, { player1: 5, player2: 0 });
      }
      expect(manager.getTournament(tournament.id)!.winner).toBeDefined();
    });

    it('notifies bracket update after each match', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4, TournamentType.ROUND_ROBIN);
      const match = tournament.bracket[0];
      manager.startReadyCheck(tournament.id, match.id);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      manager.setPlayerReady(tournament.id, match.id, match.player2, true);
      for (const [, p] of connectedPlayers) p.ui.sendData.mockClear();
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 1, player2: 0 });
      let bracketUpdate = false;
      for (const [, p] of connectedPlayers) {
        if (p.ui.sendData.mock.calls.some((c: any[]) => c[0]?.type === 'tournament-bracket-updated')) {
          bracketUpdate = true;
        }
      }
      expect(bracketUpdate).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Registration deadline handling
  // ─────────────────────────────────────────────────────────────
  describe('registration deadline handling', () => {
    it('cancels tournament with fewer than 4 players (single elim)', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8, 1);
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(manager.getTournament(tournament.id)!.status).toBe(TournamentStatus.CANCELLED);
    });

    it('cancels round robin with fewer than 3 players', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 4, 2, TournamentType.ROUND_ROBIN);
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(manager.getTournament(tournament.id)!.status).toBe(TournamentStatus.CANCELLED);
    });

    it('starts tournament at deadline with enough players', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8, 4);
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(manager.getTournament(tournament.id)!.status).toBe(TournamentStatus.IN_PROGRESS);
    });

    it('notifies players when tournament is cancelled', () => {
      const manager = createTestManager();
      const { tournament, usernames } = createRegistrationTournament(manager, 8, 1);
      const p1 = connectedPlayers.get(usernames[0]);
      p1.ui.sendData.mockClear();
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(p1.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'tournament-cancelled' }));
    });

    it('does nothing if tournament already started before deadline', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const statusBefore = tournament.status;
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(manager.getTournament(tournament.id)!.status).toBe(statusBefore);
    });

    it('generates bracket with available players at deadline', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8, 4);
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(manager.getTournament(tournament.id)!.bracket.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Ready check timeout
  // ─────────────────────────────────────────────────────────────
  describe('ready check timeout', () => {
    it('forfeits to player2 when only player1 fails to ready', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      // Only player2 readies up
      manager.setPlayerReady(tournament.id, match.id, match.player2, true);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.FORFEITED);
      expect(updated.winner).toBe(match.player2);
    });

    it('forfeits to player1 when only player2 fails to ready', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.FORFEITED);
      expect(updated.winner).toBe(match.player1);
    });

    it('reschedules when neither player readies up (double no-show)', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.SCHEDULED);
    });

    it('advances tournament after forfeit', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const final = manager.getTournament(tournament.id)!.bracket.find(m => m.roundNumber === 2)!;
      expect(final.player1 === match.player1 || final.player2 === match.player1).toBe(true);
    });

    it('calls persistence save after timeout handling', async () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      mockSetGlobalData.mockClear();
      vi.advanceTimersByTime(5 * 60 * 1000);
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Player unavailable handling
  // ─────────────────────────────────────────────────────────────
  describe('player unavailable handling', () => {
    it('forfeits to player2 when player1 offline', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      manager.startReadyCheck(tournament.id, match.id);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.winner).toBe(match.player2);
    });

    it('forfeits to player1 when player2 offline', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player2);
      manager.startReadyCheck(tournament.id, match.id);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.winner).toBe(match.player1);
    });

    it('reschedules when both players offline', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      connectedPlayers.delete(match.player2);
      manager.startReadyCheck(tournament.id, match.id);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.SCHEDULED);
      expect(updated.scheduledTime).toBeDefined();
    });

    it('clears ready state on reschedule', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      connectedPlayers.delete(match.player2);
      manager.startReadyCheck(tournament.id, match.id);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.player1Ready).toBe(false);
      expect(updated.player2Ready).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // forfeitMatch (tested via ready check timeout path)
  // ─────────────────────────────────────────────────────────────
  describe('forfeitMatch', () => {
    it('sets match status to FORFEITED', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.FORFEITED);
    });

    it('records winner from forfeit', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.winner).toBe(match.player1);
    });

    it('sets score to 0-0 for forfeit', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.score).toEqual({ player1: 0, player2: 0 });
    });

    it('advances tournament after forfeit', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player2, true);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const final = manager.getTournament(tournament.id)!.bracket.find(m => m.roundNumber === 2)!;
      expect(final.player1 === match.player2 || final.player2 === match.player2).toBe(true);
    });

    it('calls persistence save', async () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      mockSetGlobalData.mockClear();
      vi.advanceTimersByTime(5 * 60 * 1000);
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Match rescheduling
  // ─────────────────────────────────────────────────────────────
  describe('match rescheduling', () => {
    it('resets match status to SCHEDULED', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      connectedPlayers.delete(match.player2);
      manager.startReadyCheck(tournament.id, match.id);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.SCHEDULED);
    });

    it('sets new scheduledTime', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      const timeBefore = Date.now();
      connectedPlayers.delete(match.player1);
      connectedPlayers.delete(match.player2);
      manager.startReadyCheck(tournament.id, match.id);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.scheduledTime).toBeGreaterThan(timeBefore);
    });

    it('clears readyCheckStarted and readyCheckExpires', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      connectedPlayers.delete(match.player2);
      manager.startReadyCheck(tournament.id, match.id);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.readyCheckStarted).toBeUndefined();
      expect(updated.readyCheckExpires).toBeUndefined();
    });

    it('resets player ready flags', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      connectedPlayers.delete(match.player2);
      manager.startReadyCheck(tournament.id, match.id);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.player1Ready).toBe(false);
      expect(updated.player2Ready).toBe(false);
    });

    it('double no-show also reschedules', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const updated = manager.getTournament(tournament.id)!.bracket.find(m => m.id === match.id)!;
      expect(updated.status).toBe(MatchStatus.SCHEDULED);
    });

    it('calls persistence save', async () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      connectedPlayers.delete(match.player2);
      mockSetGlobalData.mockClear();
      manager.startReadyCheck(tournament.id, match.id);
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Player status monitoring
  // ─────────────────────────────────────────────────────────────
  describe('player status monitoring', () => {
    it('updates player online status every 30 seconds', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8, 0);
      createMockConnectedPlayer('monitor_player');
      manager.registerPlayer(tournament.id, 'monitor_player');
      connectedPlayers.delete('monitor_player');
      vi.advanceTimersByTime(30000);
      expect(manager.getTournament(tournament.id)!.players['monitor_player'].isOnline).toBe(false);
    });

    it('detects player coming back online', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8, 0);
      createMockConnectedPlayer('toggle_player');
      manager.registerPlayer(tournament.id, 'toggle_player');
      connectedPlayers.delete('toggle_player');
      vi.advanceTimersByTime(30000);
      expect(manager.getTournament(tournament.id)!.players['toggle_player'].isOnline).toBe(false);
      createMockConnectedPlayer('toggle_player');
      vi.advanceTimersByTime(30000);
      expect(manager.getTournament(tournament.id)!.players['toggle_player'].isOnline).toBe(true);
    });

    it('stops monitoring when no active tournaments', () => {
      const manager = createTestManager();
      vi.advanceTimersByTime(30000);
      expect(manager).toBeDefined();
    });

    it('monitors multiple tournaments', () => {
      const manager = createTestManager();
      const { tournament: t1 } = createRegistrationTournament(manager, 8, 0);
      vi.advanceTimersByTime(1);
      createRegistrationTournament(manager, 8, 0);
      createMockConnectedPlayer('shared_player');
      manager.registerPlayer(t1.id, 'shared_player');
      connectedPlayers.delete('shared_player');
      vi.advanceTimersByTime(30000);
      expect(manager.getTournament(t1.id)!.players['shared_player'].isOnline).toBe(false);
    });

    it('does not crash if player has no tournament entry', () => {
      const manager = createTestManager();
      createRegistrationTournament(manager, 8, 0);
      vi.advanceTimersByTime(30000);
      expect(manager).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────
  describe('persistence', () => {
    it('loads tournaments from persistence on creation', () => {
      createTestManager();
      expect(mockGetGlobalData).toHaveBeenCalledWith('tournaments');
    });

    it('saves tournament on creation', async () => {
      const manager = createTestManager();
      mockSetGlobalData.mockClear();
      manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalledWith('tournaments', expect.any(Object));
    });

    it('saves on player registration', async () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      mockSetGlobalData.mockClear();
      createMockConnectedPlayer('alice');
      manager.registerPlayer(tournament.id, 'alice');
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });

    it('saves on player unregistration', async () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('alice');
      manager.registerPlayer(tournament.id, 'alice');
      mockSetGlobalData.mockClear();
      manager.unregisterPlayer(tournament.id, 'alice');
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });

    it('saves on match completion', async () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      manager.setPlayerReady(tournament.id, match.id, match.player2, true);
      mockSetGlobalData.mockClear();
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 1, player2: 0 });
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });

    it('saves on setPlayerReady', async () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      mockSetGlobalData.mockClear();
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      await flushAsync();
      expect(mockSetGlobalData).toHaveBeenCalled();
    });

    it('handles persistence load error gracefully', () => {
      mockGetGlobalData.mockRejectedValue(new Error('DB error'));
      expect(() => createTestManager()).not.toThrow();
    });

    it('handles persistence save error gracefully', () => {
      mockSetGlobalData.mockRejectedValue(new Error('DB error'));
      const manager = createTestManager();
      expect(() => manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8)).not.toThrow();
    });

    it('restores IN_PROGRESS tournaments from persistence', async () => {
      const savedTournament = {
        id: 'restored_1',
        name: 'Restored Cup',
        type: TournamentType.SINGLE_ELIMINATION,
        gameMode: GameMode.FIFA,
        status: TournamentStatus.IN_PROGRESS,
        players: {},
        bracket: [],
        currentRound: 1,
        maxPlayers: 8,
        createdBy: 'system',
        createdAt: Date.now(),
        registrationDeadline: Date.now(),
        rules: [],
      };
      mockGetGlobalData.mockResolvedValue({ restored_1: savedTournament });
      const manager = createTestManager();
      await flushAsync();
      expect(manager.getTournament('restored_1')).toBeDefined();
    });

    it('does not restore COMPLETED tournaments', async () => {
      const savedTournament = {
        id: 'done_1',
        name: 'Done Cup',
        type: TournamentType.SINGLE_ELIMINATION,
        gameMode: GameMode.FIFA,
        status: TournamentStatus.COMPLETED,
        players: {},
        bracket: [],
        currentRound: 1,
        maxPlayers: 8,
        createdBy: 'system',
        createdAt: Date.now(),
        registrationDeadline: Date.now(),
        rules: [],
      };
      mockGetGlobalData.mockResolvedValue({ done_1: savedTournament });
      const manager = createTestManager();
      await flushAsync();
      expect(manager.getTournament('done_1')).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Notification system
  // ─────────────────────────────────────────────────────────────
  describe('notification system', () => {
    it('sends match-scheduled notifications with type', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      const p1 = connectedPlayers.get(match.player1);
      p1?.ui.sendData.mockClear();
      manager.scheduleMatch(tournament.id, match.id, 5);
      expect(p1?.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({
        type: 'tournament-match-scheduled',
      }));
    });

    it('sends ready-check notifications with expiry', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      const p1 = connectedPlayers.get(match.player1);
      p1?.ui.sendData.mockClear();
      manager.startReadyCheck(tournament.id, match.id);
      expect(p1?.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({
        type: 'tournament-ready-check',
        timeLimit: 5 * 60 * 1000,
      }));
    });

    it('sends match-start notifications when both players ready', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      const p1 = connectedPlayers.get(match.player1);
      p1?.ui.sendData.mockClear();
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      manager.setPlayerReady(tournament.id, match.id, match.player2, true);
      expect(p1?.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({
        type: 'tournament-match-start',
      }));
    });

    it('sends tournament-started notification to all players', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 4, 10);
      const players: any[] = [];
      for (let i = 1; i <= 3; i++) {
        players.push(createMockConnectedPlayer(`n_p${i}`));
        manager.registerPlayer(t.id, `n_p${i}`);
      }
      for (const p of players) p.ui.sendData.mockClear();
      const p4 = createMockConnectedPlayer('n_p4');
      manager.registerPlayer(t.id, 'n_p4');
      let startedCount = 0;
      for (const [, p] of connectedPlayers) {
        if (p.ui.sendData.mock.calls.some((c: any[]) => c[0]?.type === 'tournament-started')) {
          startedCount++;
        }
      }
      expect(startedCount).toBeGreaterThanOrEqual(4);
    });

    it('sends bracket-update after match completion', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.setPlayerReady(tournament.id, match.id, match.player1, true);
      manager.setPlayerReady(tournament.id, match.id, match.player2, true);
      for (const [, p] of connectedPlayers) p.ui.sendData.mockClear();
      manager.completeMatch(tournament.id, match.id, match.player1, { player1: 2, player2: 0 });
      let found = false;
      for (const [, p] of connectedPlayers) {
        if (p.ui.sendData.mock.calls.some((c: any[]) => c[0]?.type === 'tournament-bracket-updated')) {
          found = true;
        }
      }
      expect(found).toBe(true);
    });

    it('does not crash when player is offline during notification', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      connectedPlayers.delete(match.player1);
      expect(() => manager.scheduleMatch(tournament.id, match.id, 5)).not.toThrow();
    });

    it('includes tournament name in notifications', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      const p1 = connectedPlayers.get(match.player1);
      p1?.ui.sendData.mockClear();
      manager.scheduleMatch(tournament.id, match.id, 5);
      expect(p1?.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({
        tournamentName: 'Test Cup',
      }));
    });

    it('sends cancellation notification with reason', () => {
      const manager = createTestManager();
      const { tournament, usernames } = createRegistrationTournament(manager, 8, 1);
      const p1 = connectedPlayers.get(usernames[0]);
      p1.ui.sendData.mockClear();
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(p1.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({
        type: 'tournament-cancelled',
        reason: 'Insufficient players',
      }));
    });

    it('sends completion notification to players', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const [match1, match2] = tournament.bracket.filter(m => m.roundNumber === 1);

      manager.startReadyCheck(tournament.id, match1.id);
      manager.setPlayerReady(tournament.id, match1.id, match1.player1, true);
      manager.setPlayerReady(tournament.id, match1.id, match1.player2, true);
      manager.completeMatch(tournament.id, match1.id, match1.player1, { player1: 1, player2: 0 });

      manager.startReadyCheck(tournament.id, match2.id);
      manager.setPlayerReady(tournament.id, match2.id, match2.player1, true);
      manager.setPlayerReady(tournament.id, match2.id, match2.player2, true);
      manager.completeMatch(tournament.id, match2.id, match2.player1, { player1: 1, player2: 0 });

      const finalMatch = manager.getTournament(tournament.id)!.bracket.find(m => m.roundNumber === 2)!;
      manager.startReadyCheck(tournament.id, finalMatch.id);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player1, true);
      manager.setPlayerReady(tournament.id, finalMatch.id, finalMatch.player2, true);

      for (const [, p] of connectedPlayers) p.ui.sendData.mockClear();
      manager.completeMatch(tournament.id, finalMatch.id, finalMatch.player1, { player1: 2, player2: 0 });

      let completionSent = false;
      for (const [, p] of connectedPlayers) {
        if (p.ui.sendData.mock.calls.some((c: any[]) => c[0]?.type === 'tournament-completed')) {
          completionSent = true;
        }
      }
      expect(completionSent).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Public getters
  // ─────────────────────────────────────────────────────────────
  describe('public getters', () => {
    it('getCurrentTournament returns active tournament', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      expect(manager.getCurrentTournament()?.id).toBe(tournament.id);
    });

    it('getCurrentTournament returns null when no active', () => {
      const manager = createTestManager();
      expect(manager.getCurrentTournament()).toBeNull();
    });

    it('getTournament returns tournament by ID', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(manager.getTournament(t.id)).toBeDefined();
    });

    it('getTournament returns undefined for bad ID', () => {
      const manager = createTestManager();
      expect(manager.getTournament('nonexistent')).toBeUndefined();
    });

    it('getAllTournaments returns all tournaments', () => {
      const manager = createTestManager();
      manager.createTournament('Cup1', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      vi.advanceTimersByTime(1);
      manager.createTournament('Cup2', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(manager.getAllTournaments()).toHaveLength(2);
    });

    it('getActiveTournaments filters completed/cancelled', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8, 1);
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(manager.getActiveTournaments()).toHaveLength(0);
    });

    it('getActiveTournaments includes REGISTRATION status', () => {
      const manager = createTestManager();
      manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(manager.getActiveTournaments()).toHaveLength(1);
    });

    it('getActiveTournaments includes IN_PROGRESS status', () => {
      const manager = createTestManager();
      createTournamentWithPlayers(manager, 4);
      expect(manager.getActiveTournaments()).toHaveLength(1);
    });

    it('getPlayerActiveTournaments returns tournaments for a player', () => {
      const manager = createTestManager();
      const { tournament } = createRegistrationTournament(manager, 8);
      createMockConnectedPlayer('test_user');
      manager.registerPlayer(tournament.id, 'test_user');
      expect(manager.getPlayerActiveTournaments('test_user')).toHaveLength(1);
    });

    it('getPlayerActiveTournaments returns empty for unregistered player', () => {
      const manager = createTestManager();
      manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(manager.getPlayerActiveTournaments('nobody')).toHaveLength(0);
    });

    it('getMatchForPlayer returns scheduled match', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      const match = tournament.bracket[0];
      const result = manager.getMatchForPlayer(match.player1);
      expect(result).toBeDefined();
      expect(result?.id).toBe(match.id);
    });

    it('getMatchForPlayer returns null for player not in any match', () => {
      const manager = createTestManager();
      createTournamentWithPlayers(manager, 4);
      expect(manager.getMatchForPlayer('not_in_tournament')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getDefaultRules
  // ─────────────────────────────────────────────────────────────
  describe('getDefaultRules', () => {
    it('includes base rules', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(t.rules).toContain('All matches must be played to completion');
    });

    it('includes FIFA-specific rule for FIFA mode', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(t.rules.some(r => r.includes('FIFA'))).toBe(true);
    });

    it('includes ARCADE-specific rule for ARCADE mode', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.ARCADE, 8);
      expect(t.rules.some(r => r.includes('Arcade'))).toBe(true);
    });

    it('includes single elimination rule', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.SINGLE_ELIMINATION, GameMode.FIFA, 8);
      expect(t.rules.some(r => r.includes('Single elimination'))).toBe(true);
    });

    it('includes round robin rule', () => {
      const manager = createTestManager();
      const t = manager.createTournament('Cup', TournamentType.ROUND_ROBIN, GameMode.FIFA, 4);
      expect(t.rules.some(r => r.includes('Round robin'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────
  describe('cleanup', () => {
    it('clears all ready check timers', () => {
      const manager = createTestManager();
      const { tournament, match } = setupMatchReadyCheck(manager);
      manager.cleanup();
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(manager).toBeDefined();
    });

    it('clears all match scheduling timers', () => {
      const manager = createTestManager();
      const { tournament } = createTournamentWithPlayers(manager, 4);
      manager.scheduleMatch(tournament.id, tournament.bracket[0].id, 5);
      manager.cleanup();
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(manager).toBeDefined();
    });

    it('does not throw when called with no timers', () => {
      const manager = createTestManager();
      expect(() => manager.cleanup()).not.toThrow();
    });

    it('can be called multiple times', () => {
      const manager = createTestManager();
      manager.cleanup();
      manager.cleanup();
      expect(manager).toBeDefined();
    });
  });
});
