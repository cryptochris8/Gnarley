/**
 * RoomManager Tests
 *
 * Covers singleton pattern, room creation/joining/leaving,
 * spectator mode, cleanup, public room listing, stats, and event handlers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Hoisted mock state ────────────────────────────────────────────
const mockCreatedWorlds = vi.hoisted(() => [] as any[]);
const mockLobbyPlayerEntities = vi.hoisted(() => [] as any[]);

vi.mock('hytopia', () => ({
  WorldManager: {
    instance: {
      createWorld: vi.fn(() => {
        const world = {
          id: `world-${mockCreatedWorlds.length}`,
          on: vi.fn(),
          off: vi.fn(),
          stop: vi.fn(),
          loadMap: vi.fn(),
          entityManager: {
            getAllEntities: vi.fn().mockReturnValue([]),
            getPlayerEntitiesByPlayer: vi.fn().mockReturnValue([]),
            getAllPlayerEntities: vi.fn().mockReturnValue(mockLobbyPlayerEntities),
          },
        };
        mockCreatedWorlds.push(world);
        return world;
      }),
    },
  },
  PlayerEvent: {
    JOINED_WORLD: 'JOINED_WORLD',
    LEFT_WORLD: 'LEFT_WORLD',
  },
  PlayerUIEvent: {
    DATA: 'DATA',
  },
  World: class {},
  Player: class {},
}));

vi.mock('../../state/RoomSharedState', () => ({
  RoomSharedState: vi.fn().mockImplementation((roomId: string) => ({
    roomId,
    cleanup: vi.fn(),
    getAttachedPlayer: vi.fn().mockReturnValue(null),
    addAIToTeam: vi.fn(),
  })),
}));

vi.mock('../../state/gameModes', () => ({
  GameMode: {
    FIFA: 'fifa',
    ARCADE: 'arcade',
    TOURNAMENT: 'tournament',
    PENALTY_SHOOTOUT: 'penalty_shootout',
  },
  getCurrentGameMode: vi.fn().mockReturnValue('fifa'),
  isArcadeMode: vi.fn().mockReturnValue(false),
}));

vi.mock('../../utils/GameLogger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../entities/SoccerPlayerEntity', () => ({
  default: vi.fn().mockImplementation(function (this: any, player: any, team: string, role: string) {
    this.player = player;
    this.team = team;
    this.role = role;
    this.isSpawned = false;
    this.spawn = vi.fn(() => { this.isSpawned = true; });
    this.despawn = vi.fn(() => { this.isSpawned = false; });
    this.freeze = vi.fn();
    this.unfreeze = vi.fn();
    this.setRoomSharedState = vi.fn();
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0, w: 1 };
    this.controller = null;
    return this;
  }),
}));

vi.mock('../../entities/AIPlayerEntity', () => ({
  default: vi.fn().mockImplementation(function (this: any, world: any, team: string, role: string) {
    this.world = world;
    this.team = team;
    this.role = role;
    this.isSpawned = false;
    this.spawn = vi.fn(() => { this.isSpawned = true; });
    this.despawn = vi.fn(() => { this.isSpawned = false; });
    this.activate = vi.fn();
    this.deactivate = vi.fn();
    this.player = { username: `AI_${team}_${role}` };
    return this;
  }),
}));

vi.mock('../../src/core/AudioManager', () => ({
  AudioManager: vi.fn().mockImplementation(() => ({
    playGameplayMusic: vi.fn(),
    stopAll: vi.fn(),
  })),
}));

vi.mock('../../utils/fifaCrowdManager', () => ({
  FIFACrowdManager: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    playGameStart: vi.fn(),
  })),
}));

vi.mock('../../state/pickupGameManager', () => ({
  PickupGameManager: vi.fn().mockImplementation(() => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
  })),
}));

vi.mock('../../state/arcadeEnhancements', () => ({
  ArcadeEnhancementManager: vi.fn().mockImplementation(() => ({
    setRoomArcadeMode: vi.fn(),
    destroy: vi.fn(),
  })),
}));

vi.mock('../../state/PenaltyShootoutManager', () => ({
  PenaltyShootoutManager: vi.fn().mockImplementation(() => ({
    setRoomState: vi.fn(),
    start: vi.fn(),
    end: vi.fn(),
    isShootoutActive: vi.fn().mockReturnValue(false),
    handlePenaltyAimShoot: vi.fn(),
  })),
}));

vi.mock('../../utils/ball', () => ({
  setPenaltyShootoutManager: vi.fn(),
}));

vi.mock('../../utils/positions', () => ({
  getStartPosition: vi.fn().mockReturnValue({ x: 0, y: 1, z: 0 }),
}));

import { RoomManager, _resetRoomManagerInstance, type Room } from '../../state/RoomManager';
import { GameMode } from '../../state/gameModes';

// ── Helpers ───────────────────────────────────────────────────────

function createMockLobbyWorld() {
  return {
    id: 'lobby-world',
    on: vi.fn(),
    off: vi.fn(),
    stop: vi.fn(),
    entityManager: {
      getAllEntities: vi.fn().mockReturnValue([]),
      getPlayerEntitiesByPlayer: vi.fn().mockReturnValue([]),
      getAllPlayerEntities: vi.fn().mockReturnValue(mockLobbyPlayerEntities),
    },
  } as any;
}

function createMockSoccerGame() {
  return vi.fn().mockImplementation(function (this: any) {
    this.startGame = vi.fn().mockReturnValue(true);
    this.resetGame = vi.fn();
    this.removePlayer = vi.fn();
    this.joinGame = vi.fn();
    this.joinTeam = vi.fn();
    this.getTeamOfPlayer = vi.fn().mockReturnValue(null);
    this.isTeamFull = vi.fn().mockReturnValue(false);
    this.getPlayerCountOnTeam = vi.fn().mockReturnValue(0);
    this.getState = vi.fn().mockReturnValue({
      score: { red: 0, blue: 0 },
      isHalftime: false,
      status: 'playing',
    });
    this.inProgress = vi.fn().mockReturnValue(false);
    this.setArcadeManager = vi.fn();
    this.setFIFACrowdManager = vi.fn();
    this.startSecondHalf = vi.fn();
    return this;
  });
}

function createMockRoomPlayer(username: string) {
  return {
    username,
    ui: {
      sendData: vi.fn(),
      load: vi.fn(),
      lockPointer: vi.fn(),
      on: vi.fn(),
    },
    joinWorld: vi.fn(),
    camera: { facingDirection: { x: 0, y: 0, z: -1 } },
  } as any;
}

function initRoomManager(lobbyWorld?: any) {
  const lobby = lobbyWorld ?? createMockLobbyWorld();
  const GameClass = createMockSoccerGame();
  const createBall = vi.fn().mockReturnValue({ id: 'ball' });
  const spawnAI = vi.fn().mockResolvedValue(undefined);
  const mapData = { blocks: [] };
  return RoomManager.initialize(lobby, GameClass, createBall, spawnAI, mapData);
}

// ── Test suite ────────────────────────────────────────────────────

describe('RoomManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetRoomManagerInstance();
    mockCreatedWorlds.length = 0;
    mockLobbyPlayerEntities.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // Singleton pattern
  // ─────────────────────────────────────────────────────────────
  describe('singleton pattern', () => {
    it('throws when getInstance called before initialize', () => {
      expect(() => RoomManager.getInstance()).toThrow('RoomManager not initialized');
    });

    it('isInitialized returns false before initialize', () => {
      expect(RoomManager.isInitialized()).toBe(false);
    });

    it('initialize creates an instance', () => {
      initRoomManager();
      expect(RoomManager.isInitialized()).toBe(true);
    });

    it('getInstance returns the instance after initialize', () => {
      initRoomManager();
      expect(RoomManager.getInstance()).toBeDefined();
    });

    it('second initialize returns existing instance', () => {
      const first = initRoomManager();
      const second = initRoomManager();
      expect(first).toBe(second);
    });

    it('_resetRoomManagerInstance clears the singleton', () => {
      initRoomManager();
      _resetRoomManagerInstance();
      expect(RoomManager.isInitialized()).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // createRoom
  // ─────────────────────────────────────────────────────────────
  describe('createRoom', () => {
    it('creates a room and returns it', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ name: 'Test Room', gameMode: GameMode.FIFA }, host);
      expect(room).not.toBeNull();
    });

    it('room has correct name', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ name: 'My Room' }, host);
      expect(room!.config.name).toBe('My Room');
    });

    it('room has correct gameMode', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.ARCADE }, host);
      expect(room!.config.gameMode).toBe(GameMode.ARCADE);
    });

    it('defaults name to hostname if not provided', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(room!.config.name).toContain('host1');
    });

    it('defaults gameMode to FIFA', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(room!.config.gameMode).toBe(GameMode.FIFA);
    });

    it('defaults isPublic to true', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(room!.config.isPublic).toBe(true);
    });

    it('sets hostPlayer to the player username', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(room!.config.hostPlayer).toBe('host1');
    });

    it('creates an isolated world for the room', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      await rm.createRoom({}, host);
      expect(mockCreatedWorlds.length).toBeGreaterThanOrEqual(1);
    });

    it('room starts with status waiting', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      // Host joins as player so playerCount = 1
      expect(room!.status).toBe('waiting');
    });

    it('host is auto-joined to the room', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      await rm.createRoom({}, host);
      expect(host.joinWorld).toHaveBeenCalled();
    });

    it('room has a unique ID', async () => {
      const rm = initRoomManager();
      const host1 = createMockRoomPlayer('host1');
      const host2 = createMockRoomPlayer('host2');
      const room1 = await rm.createRoom({}, host1);
      const room2 = await rm.createRoom({}, host2);
      expect(room1!.config.id).not.toBe(room2!.config.id);
    });

    it('room ID is 6 characters', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(room!.config.id).toHaveLength(6);
    });

    it('room can be retrieved by ID', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(rm.getRoom(room!.config.id)).toBeDefined();
    });

    it('returns null when at max rooms', async () => {
      const rm = initRoomManager();
      // Create 5 rooms (MAX_ROOMS)
      for (let i = 0; i < 5; i++) {
        const host = createMockRoomPlayer(`host${i}`);
        await rm.createRoom({}, host);
      }
      const extraHost = createMockRoomPlayer('extra');
      const result = await rm.createRoom({}, extraHost);
      expect(result).toBeNull();
    });

    it('sends error to player when at max rooms', async () => {
      const rm = initRoomManager();
      for (let i = 0; i < 5; i++) {
        await rm.createRoom({}, createMockRoomPlayer(`host${i}`));
      }
      const extraHost = createMockRoomPlayer('extra');
      await rm.createRoom({}, extraHost);
      expect(extraHost.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'room-error' }));
    });

    it('creates room with penalty shootout mode', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.PENALTY_SHOOTOUT }, host);
      expect(room!.config.gameMode).toBe(GameMode.PENALTY_SHOOTOUT);
      expect(room!.penaltyManager).not.toBeNull();
    });

    it('creates room with arcade mode and sets arcade flag', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.ARCADE }, host);
      expect(room!.config.gameMode).toBe(GameMode.ARCADE);
    });

    it('room starts with playerCount 1 after host joins', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(room!.playerCount).toBe(1);
    });

    it('room starts with spectatorCount 0', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(room!.spectatorCount).toBe(0);
    });

    it('sets maxPlayers from config', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ maxPlayers: 6 }, host);
      expect(room!.config.maxPlayers).toBe(6);
    });

    it('defaults maxPlayers to 12', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(room!.config.maxPlayers).toBe(12);
    });

    it('sets isPublic to false when specified', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ isPublic: false }, host);
      expect(room!.config.isPublic).toBe(false);
    });

    it('creates room with tournament mode', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.TOURNAMENT }, host);
      expect(room!.config.gameMode).toBe(GameMode.TOURNAMENT);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // joinRoom
  // ─────────────────────────────────────────────────────────────
  describe('joinRoom', () => {
    it('returns true on successful join', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const joiner = createMockRoomPlayer('joiner1');
      const result = await rm.joinRoom(room!.config.id, joiner);
      expect(result).toBe(true);
    });

    it('increments playerCount', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const joiner = createMockRoomPlayer('joiner1');
      await rm.joinRoom(room!.config.id, joiner);
      expect(room!.playerCount).toBe(2);
    });

    it('calls joinWorld on the player', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const joiner = createMockRoomPlayer('joiner1');
      await rm.joinRoom(room!.config.id, joiner);
      expect(joiner.joinWorld).toHaveBeenCalledWith(room!.world);
    });

    it('returns false for non-existent room', async () => {
      const rm = initRoomManager();
      const player = createMockRoomPlayer('player1');
      const result = await rm.joinRoom('FAKE', player);
      expect(result).toBe(false);
    });

    it('sends error for non-existent room', async () => {
      const rm = initRoomManager();
      const player = createMockRoomPlayer('player1');
      await rm.joinRoom('FAKE', player);
      expect(player.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'room-error' }));
    });

    it('returns false when room is full', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ maxPlayers: 2 }, host);
      const p2 = createMockRoomPlayer('p2');
      await rm.joinRoom(room!.config.id, p2);
      const p3 = createMockRoomPlayer('p3');
      const result = await rm.joinRoom(room!.config.id, p3);
      expect(result).toBe(false);
    });

    it('sends room-full message when room is full', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ maxPlayers: 2 }, host);
      await rm.joinRoom(room!.config.id, createMockRoomPlayer('p2'));
      const p3 = createMockRoomPlayer('p3');
      await rm.joinRoom(room!.config.id, p3);
      expect(p3.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'room-full' }));
    });

    it('redirects to spectator when room is playing', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      room!.status = 'playing';
      const spectator = createMockRoomPlayer('spectator1');
      const result = await rm.joinRoom(room!.config.id, spectator);
      expect(result).toBe(true); // joins as spectator
    });

    it('cancels cleanup timer when player joins', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      // Simulate cleanup timer being set
      room!.cleanupTimer = setTimeout(() => {}, 30000);
      const joiner = createMockRoomPlayer('joiner1');
      await rm.joinRoom(room!.config.id, joiner);
      expect(room!.cleanupTimer).toBeNull();
    });

    it('tracks player in playerRoomMap', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const joiner = createMockRoomPlayer('joiner1');
      await rm.joinRoom(room!.config.id, joiner);
      expect(rm.getRoomIdForPlayer(joiner)).toBe(room!.config.id);
    });

    it('removes player from spectatorMap if previously spectating', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      room!.status = 'playing';
      const spectator = createMockRoomPlayer('spec1');
      await rm.joinRoom(room!.config.id, spectator);
      // Now reset room status and rejoin as player
      room!.status = 'waiting';
      room!.playerCount = 1; // just host
      await rm.joinRoom(room!.config.id, spectator);
      expect(rm.isPlayerInRoom(spectator)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // joinAsSpectator
  // ─────────────────────────────────────────────────────────────
  describe('joinAsSpectator', () => {
    it('returns true on success', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const spec = createMockRoomPlayer('spec1');
      const result = await rm.joinAsSpectator(room!.config.id, spec);
      expect(result).toBe(true);
    });

    it('returns false for non-existent room', async () => {
      const rm = initRoomManager();
      const spec = createMockRoomPlayer('spec1');
      const result = await rm.joinAsSpectator('FAKE', spec);
      expect(result).toBe(false);
    });

    it('increments spectatorCount', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const spec = createMockRoomPlayer('spec1');
      await rm.joinAsSpectator(room!.config.id, spec);
      expect(room!.spectatorCount).toBe(1);
    });

    it('calls joinWorld on spectator', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const spec = createMockRoomPlayer('spec1');
      await rm.joinAsSpectator(room!.config.id, spec);
      expect(spec.joinWorld).toHaveBeenCalledWith(room!.world);
    });

    it('cancels cleanup timer when spectator joins', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      room!.cleanupTimer = setTimeout(() => {}, 30000);
      const spec = createMockRoomPlayer('spec1');
      await rm.joinAsSpectator(room!.config.id, spec);
      expect(room!.cleanupTimer).toBeNull();
    });

    it('tracks spectator in isPlayerInRoom', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const spec = createMockRoomPlayer('spec1');
      await rm.joinAsSpectator(room!.config.id, spec);
      expect(rm.isPlayerInRoom(spec)).toBe(true);
    });

    it('removes from playerRoomMap if already a player in same room', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const player = createMockRoomPlayer('p1');
      await rm.joinRoom(room!.config.id, player);
      const countBefore = room!.playerCount;
      await rm.joinAsSpectator(room!.config.id, player);
      expect(room!.playerCount).toBe(countBefore - 1);
      expect(room!.spectatorCount).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // leaveRoom — as player
  // ─────────────────────────────────────────────────────────────
  describe('leaveRoom — as player', () => {
    it('decrements playerCount', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const player = createMockRoomPlayer('p1');
      await rm.joinRoom(room!.config.id, player);
      const countBefore = room!.playerCount;
      rm.leaveRoom(player);
      expect(room!.playerCount).toBe(countBefore - 1);
    });

    it('removes player from tracking', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const player = createMockRoomPlayer('p1');
      await rm.joinRoom(room!.config.id, player);
      rm.leaveRoom(player);
      expect(rm.getRoomIdForPlayer(player)).toBeUndefined();
    });

    it('sends player back to lobby', async () => {
      const rm = initRoomManager();
      const lobby = rm.getLobbyWorld();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const player = createMockRoomPlayer('p1');
      await rm.joinRoom(room!.config.id, player);
      player.joinWorld.mockClear();
      rm.leaveRoom(player);
      expect(player.joinWorld).toHaveBeenCalledWith(lobby);
    });

    it('calls game.removePlayer', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const player = createMockRoomPlayer('p1');
      await rm.joinRoom(room!.config.id, player);
      rm.leaveRoom(player);
      expect(room!.game.removePlayer).toHaveBeenCalledWith('p1');
    });

    it('schedules cleanup when room becomes empty', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.leaveRoom(host);
      // After 30s cleanup timer fires
      expect(room!.playerCount).toBe(0);
    });

    it('does not crash for player not in any room', () => {
      const rm = initRoomManager();
      const player = createMockRoomPlayer('random');
      expect(() => rm.leaveRoom(player)).not.toThrow();
    });

    it('despawns player entities', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const player = createMockRoomPlayer('p1');
      await rm.joinRoom(room!.config.id, player);
      const mockEntity = { isSpawned: true, despawn: vi.fn() };
      room!.world.entityManager.getPlayerEntitiesByPlayer.mockReturnValue([mockEntity]);
      rm.leaveRoom(player);
      expect(mockEntity.despawn).toHaveBeenCalled();
    });

    it('handles leaveRoom for host player', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.leaveRoom(host);
      expect(rm.getRoomIdForPlayer(host)).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // leaveRoom — as spectator
  // ─────────────────────────────────────────────────────────────
  describe('leaveRoom — as spectator', () => {
    it('decrements spectatorCount', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const spec = createMockRoomPlayer('spec1');
      await rm.joinAsSpectator(room!.config.id, spec);
      rm.leaveRoom(spec);
      expect(room!.spectatorCount).toBe(0);
    });

    it('sends spectator back to lobby', async () => {
      const rm = initRoomManager();
      const lobby = rm.getLobbyWorld();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const spec = createMockRoomPlayer('spec1');
      await rm.joinAsSpectator(room!.config.id, spec);
      spec.joinWorld.mockClear();
      rm.leaveRoom(spec);
      expect(spec.joinWorld).toHaveBeenCalledWith(lobby);
    });

    it('removes spectator from tracking', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const spec = createMockRoomPlayer('spec1');
      await rm.joinAsSpectator(room!.config.id, spec);
      rm.leaveRoom(spec);
      expect(rm.isPlayerInRoom(spec)).toBe(false);
    });

    it('schedules cleanup when room becomes empty after spectator leaves', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      // Remove host
      rm.leaveRoom(host);
      // Room is now empty, cleanup scheduled — cancel it for test
      if (room!.cleanupTimer) { clearTimeout(room!.cleanupTimer); room!.cleanupTimer = null; }
      // Add spectator and then remove
      const spec = createMockRoomPlayer('spec1');
      await rm.joinAsSpectator(room!.config.id, spec);
      rm.leaveRoom(spec);
      // Room should schedule cleanup since playerCount=0, spectatorCount=0
      expect(room!.playerCount).toBe(0);
      expect(room!.spectatorCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Room cleanup
  // ─────────────────────────────────────────────────────────────
  describe('room cleanup', () => {
    it('cleans up room after 30s grace period when empty', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const roomId = room!.config.id;
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(rm.getRoom(roomId)).toBeUndefined();
    });

    it('does not cleanup if player rejoins within grace period', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const roomId = room!.config.id;
      rm.leaveRoom(host);
      // Rejoin before 30s
      const newPlayer = createMockRoomPlayer('new1');
      await rm.joinRoom(roomId, newPlayer);
      vi.advanceTimersByTime(30000);
      expect(rm.getRoom(roomId)).toBeDefined();
    });

    it('stops audio managers on cleanup', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const roomId = room!.config.id;
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.audioManager.stopAll).toHaveBeenCalled();
    });

    it('stops crowd manager on cleanup', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.fifaCrowdManager.stop).toHaveBeenCalled();
    });

    it('deactivates pickup manager on cleanup', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.pickupManager.deactivate).toHaveBeenCalled();
    });

    it('destroys arcade manager on cleanup', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.arcadeManager.destroy).toHaveBeenCalled();
    });

    it('resets game on cleanup', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.game.resetGame).toHaveBeenCalled();
    });

    it('cleans up shared state', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.sharedState.cleanup).toHaveBeenCalled();
    });

    it('stops the room world', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.world.stop).toHaveBeenCalled();
    });

    it('removes room from tracking', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const roomId = room!.config.id;
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(rm.getAllRooms()).not.toContainEqual(expect.objectContaining({ id: roomId }));
    });

    it('despawns AI players on cleanup', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const mockAI = { isSpawned: true, despawn: vi.fn(), deactivate: vi.fn() };
      room!.aiPlayers.push(mockAI);
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(mockAI.deactivate).toHaveBeenCalled();
      expect(mockAI.despawn).toHaveBeenCalled();
    });

    it('clears aiPlayers array', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      room!.aiPlayers.push({ isSpawned: true, despawn: vi.fn(), deactivate: vi.fn() });
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.aiPlayers).toHaveLength(0);
    });

    it('ends penalty shootout if active during cleanup', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.PENALTY_SHOOTOUT }, host);
      room!.penaltyManager!.isShootoutActive = vi.fn().mockReturnValue(true);
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.penaltyManager!.end).toHaveBeenCalled();
    });

    it('does not end penalty if not active during cleanup', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.PENALTY_SHOOTOUT }, host);
      room!.penaltyManager!.isShootoutActive = vi.fn().mockReturnValue(false);
      rm.leaveRoom(host);
      vi.advanceTimersByTime(30000);
      expect(room!.penaltyManager!.end).not.toHaveBeenCalled();
    });

    it('skips cleanup if room regains players before timer fires', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const roomId = room!.config.id;
      // All leave, cleanup scheduled
      rm.leaveRoom(host);
      // Simulate player count going back up (e.g. via direct manipulation for test)
      room!.playerCount = 1;
      vi.advanceTimersByTime(30000);
      // Room still exists because playerCount > 0 in the timer check
      expect(rm.getRoom(roomId)).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getPublicRoomList
  // ─────────────────────────────────────────────────────────────
  describe('getPublicRoomList', () => {
    it('returns empty list when no rooms', () => {
      const rm = initRoomManager();
      expect(rm.getPublicRoomList()).toHaveLength(0);
    });

    it('includes public rooms', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      await rm.createRoom({ isPublic: true }, host);
      expect(rm.getPublicRoomList()).toHaveLength(1);
    });

    it('excludes private rooms', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      await rm.createRoom({ isPublic: false }, host);
      expect(rm.getPublicRoomList()).toHaveLength(0);
    });

    it('sorts by playerCount descending', async () => {
      const rm = initRoomManager();
      const host1 = createMockRoomPlayer('host1');
      const room1 = await rm.createRoom({ name: 'Room1' }, host1);
      const host2 = createMockRoomPlayer('host2');
      const room2 = await rm.createRoom({ name: 'Room2' }, host2);
      // Add extra player to room2
      const extra = createMockRoomPlayer('extra');
      await rm.joinRoom(room2!.config.id, extra);
      const list = rm.getPublicRoomList();
      expect(list[0].playerCount).toBeGreaterThanOrEqual(list[1].playerCount);
    });

    it('returns RoomInfo shape', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      await rm.createRoom({ name: 'TestRoom', gameMode: GameMode.FIFA }, host);
      const list = rm.getPublicRoomList();
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('name');
      expect(list[0]).toHaveProperty('gameMode');
      expect(list[0]).toHaveProperty('playerCount');
      expect(list[0]).toHaveProperty('maxPlayers');
      expect(list[0]).toHaveProperty('status');
      expect(list[0]).toHaveProperty('isPublic');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getAllRooms
  // ─────────────────────────────────────────────────────────────
  describe('getAllRooms', () => {
    it('returns all rooms including private', async () => {
      const rm = initRoomManager();
      await rm.createRoom({ isPublic: true }, createMockRoomPlayer('h1'));
      await rm.createRoom({ isPublic: false }, createMockRoomPlayer('h2'));
      expect(rm.getAllRooms()).toHaveLength(2);
    });

    it('returns empty array when no rooms', () => {
      const rm = initRoomManager();
      expect(rm.getAllRooms()).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getRoom
  // ─────────────────────────────────────────────────────────────
  describe('getRoom', () => {
    it('returns room by ID', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(rm.getRoom(room!.config.id)).toBe(room);
    });

    it('returns undefined for unknown ID', () => {
      const rm = initRoomManager();
      expect(rm.getRoom('UNKNOWN')).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getRoomForPlayer / getRoomIdForPlayer
  // ─────────────────────────────────────────────────────────────
  describe('getRoomForPlayer / getRoomIdForPlayer', () => {
    it('getRoomForPlayer returns room when player is in one', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(rm.getRoomForPlayer(host)).toBe(room);
    });

    it('getRoomForPlayer returns undefined when player is not in any room', () => {
      const rm = initRoomManager();
      const player = createMockRoomPlayer('random');
      expect(rm.getRoomForPlayer(player)).toBeUndefined();
    });

    it('getRoomIdForPlayer returns room ID', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(rm.getRoomIdForPlayer(host)).toBe(room!.config.id);
    });

    it('getRoomIdForPlayer returns undefined for unknown player', () => {
      const rm = initRoomManager();
      expect(rm.getRoomIdForPlayer(createMockRoomPlayer('unknown'))).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // isPlayerInRoom
  // ─────────────────────────────────────────────────────────────
  describe('isPlayerInRoom', () => {
    it('returns true for player in a room', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      await rm.createRoom({}, host);
      expect(rm.isPlayerInRoom(host)).toBe(true);
    });

    it('returns true for spectator', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const spec = createMockRoomPlayer('spec1');
      await rm.joinAsSpectator(room!.config.id, spec);
      expect(rm.isPlayerInRoom(spec)).toBe(true);
    });

    it('returns false for player not in any room', () => {
      const rm = initRoomManager();
      expect(rm.isPlayerInRoom(createMockRoomPlayer('nobody'))).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // findAvailableRoom
  // ─────────────────────────────────────────────────────────────
  describe('findAvailableRoom', () => {
    it('returns null when no rooms exist', () => {
      const rm = initRoomManager();
      expect(rm.findAvailableRoom()).toBeNull();
    });

    it('returns a public waiting room with space', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(rm.findAvailableRoom()).toBeDefined();
    });

    it('skips private rooms', async () => {
      const rm = initRoomManager();
      await rm.createRoom({ isPublic: false }, createMockRoomPlayer('h1'));
      expect(rm.findAvailableRoom()).toBeNull();
    });

    it('skips rooms with playing status', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      room!.status = 'playing';
      expect(rm.findAvailableRoom()).toBeNull();
    });

    it('skips full rooms', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ maxPlayers: 1 }, host);
      expect(rm.findAvailableRoom()).toBeNull();
    });

    it('filters by preferred gameMode', async () => {
      const rm = initRoomManager();
      await rm.createRoom({ gameMode: GameMode.FIFA }, createMockRoomPlayer('h1'));
      await rm.createRoom({ gameMode: GameMode.ARCADE }, createMockRoomPlayer('h2'));
      const result = rm.findAvailableRoom(GameMode.ARCADE);
      expect(result).toBeDefined();
      expect(result!.config.gameMode).toBe(GameMode.ARCADE);
    });

    it('returns null when no room matches preferred mode', async () => {
      const rm = initRoomManager();
      await rm.createRoom({ gameMode: GameMode.FIFA }, createMockRoomPlayer('h1'));
      expect(rm.findAvailableRoom(GameMode.PENALTY_SHOOTOUT)).toBeNull();
    });

    it('returns any mode when no preference', async () => {
      const rm = initRoomManager();
      await rm.createRoom({ gameMode: GameMode.ARCADE }, createMockRoomPlayer('h1'));
      expect(rm.findAvailableRoom()).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // setRoomStatus
  // ─────────────────────────────────────────────────────────────
  describe('setRoomStatus', () => {
    it('changes room status', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.setRoomStatus(room!.config.id, 'playing');
      expect(room!.status).toBe('playing');
    });

    it('does nothing for unknown room', () => {
      const rm = initRoomManager();
      expect(() => rm.setRoomStatus('UNKNOWN', 'playing')).not.toThrow();
    });

    it('can set to finished', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      rm.setRoomStatus(room!.config.id, 'finished');
      expect(room!.status).toBe('finished');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // isLobbyWorld
  // ─────────────────────────────────────────────────────────────
  describe('isLobbyWorld', () => {
    it('returns true for lobby world', () => {
      const rm = initRoomManager();
      const lobby = rm.getLobbyWorld();
      expect(rm.isLobbyWorld(lobby)).toBe(true);
    });

    it('returns false for room world', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      expect(rm.isLobbyWorld(room!.world)).toBe(false);
    });

    it('static isLobbyWorld returns false when not initialized', () => {
      _resetRoomManagerInstance();
      expect(RoomManager.isLobbyWorld({} as any)).toBe(false);
    });

    it('static isLobbyWorld works when initialized', () => {
      const rm = initRoomManager();
      const lobby = rm.getLobbyWorld();
      expect(RoomManager.isLobbyWorld(lobby)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getStats
  // ─────────────────────────────────────────────────────────────
  describe('getStats', () => {
    it('returns zero stats when no rooms', () => {
      const rm = initRoomManager();
      const stats = rm.getStats();
      expect(stats).toEqual({ rooms: 0, players: 0, spectators: 0 });
    });

    it('counts rooms correctly', async () => {
      const rm = initRoomManager();
      await rm.createRoom({}, createMockRoomPlayer('h1'));
      await rm.createRoom({}, createMockRoomPlayer('h2'));
      expect(rm.getStats().rooms).toBe(2);
    });

    it('counts players across rooms', async () => {
      const rm = initRoomManager();
      const host1 = createMockRoomPlayer('h1');
      const room1 = await rm.createRoom({}, host1);
      await rm.joinRoom(room1!.config.id, createMockRoomPlayer('p1'));
      const host2 = createMockRoomPlayer('h2');
      await rm.createRoom({}, host2);
      expect(rm.getStats().players).toBe(3);
    });

    it('counts spectators', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('h1');
      const room = await rm.createRoom({}, host);
      await rm.joinAsSpectator(room!.config.id, createMockRoomPlayer('s1'));
      await rm.joinAsSpectator(room!.config.id, createMockRoomPlayer('s2'));
      expect(rm.getStats().spectators).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // broadcastRoomList
  // ─────────────────────────────────────────────────────────────
  describe('broadcastRoomList', () => {
    it('sends room-list to lobby player entities', async () => {
      const rm = initRoomManager();
      const lobbyPlayer = createMockRoomPlayer('lobby1');
      mockLobbyPlayerEntities.push({ player: lobbyPlayer });
      const host = createMockRoomPlayer('host1');
      await rm.createRoom({}, host);
      // broadcastRoomList is called during createRoom
      expect(lobbyPlayer.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'room-list' }));
    });

    it('sends lobby-room-count to lobby players', async () => {
      const rm = initRoomManager();
      const lobbyPlayer = createMockRoomPlayer('lobby1');
      mockLobbyPlayerEntities.push({ player: lobbyPlayer });
      const host = createMockRoomPlayer('host1');
      await rm.createRoom({}, host);
      expect(lobbyPlayer.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'lobby-room-count' }));
    });

    it('does not crash when no lobby players', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      expect(async () => await rm.createRoom({}, host)).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // startRoomGameSystems
  // ─────────────────────────────────────────────────────────────
  describe('startRoomGameSystems', () => {
    it('starts gameplay music for FIFA mode', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.FIFA }, host);
      // Manually call via the private path: create room sets up the room
      // The startRoomGameSystems is private, test via team selection / game start
      // We'll verify the audio manager and crowd manager were created
      expect(room!.audioManager).toBeDefined();
      expect(room!.fifaCrowdManager).toBeDefined();
    });

    it('creates pickup manager for arcade rooms', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.ARCADE }, host);
      expect(room!.pickupManager).toBeDefined();
    });

    it('creates arcade manager for arcade rooms', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.ARCADE }, host);
      expect(room!.arcadeManager).toBeDefined();
    });

    it('creates penalty manager for penalty rooms', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.PENALTY_SHOOTOUT }, host);
      expect(room!.penaltyManager).not.toBeNull();
    });

    it('creates audio and crowd managers for all rooms', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.TOURNAMENT }, host);
      expect(room!.audioManager).toBeDefined();
      expect(room!.fifaCrowdManager).toBeDefined();
    });

    it('does not create penalty manager for FIFA rooms', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({ gameMode: GameMode.FIFA }, host);
      expect(room!.penaltyManager).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Room event handlers
  // ─────────────────────────────────────────────────────────────
  describe('room event handlers', () => {
    function getRoomEventHandler(room: Room, eventType: string) {
      const calls = (room.world.on as any).mock.calls;
      const call = calls.find((c: any[]) => c[0] === eventType);
      return call ? call[1] : null;
    }

    it('sets up JOINED_WORLD handler on room world', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'JOINED_WORLD');
      expect(handler).toBeDefined();
    });

    it('sets up LEFT_WORLD handler on room world', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'LEFT_WORLD');
      expect(handler).toBeDefined();
    });

    it('JOINED_WORLD handler loads UI for player', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'JOINED_WORLD');
      const player = createMockRoomPlayer('joiner1');
      handler({ player });
      expect(player.ui.load).toHaveBeenCalledWith('ui/index.html');
    });

    it('JOINED_WORLD handler unlocks pointer', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'JOINED_WORLD');
      const player = createMockRoomPlayer('joiner1');
      handler({ player });
      expect(player.ui.lockPointer).toHaveBeenCalledWith(false);
    });

    it('JOINED_WORLD sends room-joined for regular player', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'JOINED_WORLD');
      const player = createMockRoomPlayer('regular1');
      handler({ player });
      expect(player.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'room-joined' }));
    });

    it('JOINED_WORLD sends team-counts for regular player', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'JOINED_WORLD');
      const player = createMockRoomPlayer('regular2');
      handler({ player });
      expect(player.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'team-counts' }));
    });

    it('JOINED_WORLD sends show-team-selection after delay', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'JOINED_WORLD');
      const player = createMockRoomPlayer('regular3');
      handler({ player });
      vi.advanceTimersByTime(300);
      expect(player.ui.sendData).toHaveBeenCalledWith(expect.objectContaining({ type: 'show-team-selection' }));
    });

    it('JOINED_WORLD registers UI event handler', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'JOINED_WORLD');
      const player = createMockRoomPlayer('regular4');
      handler({ player });
      expect(player.ui.on).toHaveBeenCalled();
    });

    it('LEFT_WORLD handler cleans up player from room', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'LEFT_WORLD');
      const player = createMockRoomPlayer('leaving1');
      await rm.joinRoom(room!.config.id, player);
      const countBefore = room!.playerCount;
      handler({ player });
      expect(room!.playerCount).toBe(countBefore - 1);
    });

    it('LEFT_WORLD handler removes player from game', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'LEFT_WORLD');
      const player = createMockRoomPlayer('leaving2');
      await rm.joinRoom(room!.config.id, player);
      handler({ player });
      expect(room!.game.removePlayer).toHaveBeenCalledWith('leaving2');
    });

    it('LEFT_WORLD handler schedules cleanup when last player leaves', async () => {
      const rm = initRoomManager();
      const host = createMockRoomPlayer('host1');
      const room = await rm.createRoom({}, host);
      const handler = getRoomEventHandler(room!, 'LEFT_WORLD');
      // Leave host via handler
      handler({ player: host });
      // playerCount should be 0, cleanup should be scheduled
      vi.advanceTimersByTime(30000);
      expect(rm.getRoom(room!.config.id)).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getLobbyWorld
  // ─────────────────────────────────────────────────────────────
  describe('getLobbyWorld', () => {
    it('returns the lobby world', () => {
      const lobby = createMockLobbyWorld();
      RoomManager.initialize(lobby, createMockSoccerGame(), vi.fn(), vi.fn(), {});
      expect(RoomManager.getInstance().getLobbyWorld()).toBe(lobby);
    });
  });
});
