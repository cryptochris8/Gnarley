/**
 * RoomManager - Multi-Room Game Instance Manager
 *
 * Manages multiple concurrent game rooms, each with isolated:
 * - World (via Hytopia WorldManager)
 * - SoccerGame instance
 * - RoomSharedState
 * - AI players
 *
 * Supports up to 5 concurrent rooms (60 players max).
 */

import { World, WorldManager, Player, PlayerEvent, PlayerUIEvent } from "hytopia";
import { RoomSharedState } from "./RoomSharedState";
import { GameMode, getCurrentGameMode, isArcadeMode } from "./gameModes";
import { logger } from "../utils/GameLogger";
import SoccerPlayerEntity from "../entities/SoccerPlayerEntity";
import AIPlayerEntity from "../entities/AIPlayerEntity";
import { AudioManager } from "../src/core/AudioManager";
import { FIFACrowdManager } from "../utils/fifaCrowdManager";
import { PickupGameManager } from "./pickupGameManager";
import { ArcadeEnhancementManager } from "./arcadeEnhancements";

// Forward declarations to avoid circular imports
// These will be set during initialization
let SoccerGameClass: any = null;
let createSoccerBallFn: any = null;
let spawnAIPlayersFn: any = null;
let soccerFieldMapData: any = null;

/**
 * Room configuration when creating a new room
 */
export interface RoomConfig {
  id: string;
  name: string;
  gameMode: GameMode;
  maxPlayers: number;
  hostPlayer: string;
  isPublic: boolean;
  createdAt: number;
}

/**
 * Room information sent to clients for room browser
 */
export interface RoomInfo {
  id: string;
  name: string;
  gameMode: GameMode;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  isPublic: boolean;
}

/**
 * Room status enum
 */
export type RoomStatus = 'waiting' | 'playing' | 'finished';

/**
 * Full room instance with all game components
 */
export interface Room {
  config: RoomConfig;
  world: World;
  game: any; // SoccerGame - using any to avoid circular import
  sharedState: RoomSharedState;
  aiPlayers: any[]; // AIPlayerEntity[]
  playerCount: number;
  spectatorCount: number;
  status: RoomStatus;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  audioManager: AudioManager; // Room-specific audio manager
  fifaCrowdManager: FIFACrowdManager; // Room-specific crowd manager
  pickupManager: PickupGameManager; // Room-specific pickup manager for Arcade mode
  arcadeManager: ArcadeEnhancementManager; // Room-specific arcade enhancement manager
}

/**
 * RoomManager singleton - manages all game rooms
 */
export class RoomManager {
  private static instance: RoomManager | null = null;
  private rooms: Map<string, Room> = new Map();
  private lobbyWorld: World;
  private playerRoomMap: Map<string, string> = new Map(); // username -> roomId
  private spectatorMap: Map<string, string> = new Map(); // username -> roomId (for spectators)

  // Configuration
  private readonly MAX_ROOMS = 5;
  private readonly MAX_PLAYERS_PER_ROOM = 12;
  private readonly ROOM_CLEANUP_DELAY = 30000; // 30 seconds grace period
  private readonly ROOM_ID_LENGTH = 6;

  /**
   * Get the singleton instance
   */
  public static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      throw new Error("RoomManager not initialized. Call RoomManager.initialize() first.");
    }
    return RoomManager.instance;
  }

  /**
   * Check if RoomManager has been initialized
   */
  public static isInitialized(): boolean {
    return RoomManager.instance !== null;
  }

  /**
   * Initialize the RoomManager with the lobby world
   */
  public static initialize(
    lobbyWorld: World,
    soccerGame: any,
    createBallFn: any,
    spawnAIFn: any,
    mapData: any
  ): RoomManager {
    if (RoomManager.instance) {
      logger.warn("RoomManager already initialized");
      return RoomManager.instance;
    }

    // Store class/function references
    SoccerGameClass = soccerGame;
    createSoccerBallFn = createBallFn;
    spawnAIPlayersFn = spawnAIFn;
    soccerFieldMapData = mapData;

    RoomManager.instance = new RoomManager(lobbyWorld);
    logger.info("🏠 RoomManager initialized");
    return RoomManager.instance;
  }

  private constructor(lobbyWorld: World) {
    this.lobbyWorld = lobbyWorld;
    this.setupLobbyEventHandlers();
  }

  /**
   * Get the lobby world
   */
  public getLobbyWorld(): World {
    return this.lobbyWorld;
  }

  /**
   * Check if a given world is the lobby world
   * @param world - The world to check
   * @returns true if the world is the lobby world
   */
  public isLobbyWorld(world: World): boolean {
    return world === this.lobbyWorld;
  }

  /**
   * Static version of isLobbyWorld for convenience
   */
  public static isLobbyWorld(world: World): boolean {
    if (!RoomManager.instance) return false;
    return RoomManager.instance.isLobbyWorld(world);
  }

  /**
   * Generate a unique room ID
   */
  private generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
    let id = '';
    for (let i = 0; i < this.ROOM_ID_LENGTH; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (this.rooms.has(id)) {
      return this.generateRoomId();
    }
    return id;
  }

  /**
   * Create a new game room
   */
  public async createRoom(
    config: Partial<RoomConfig>,
    hostPlayer: Player
  ): Promise<Room | null> {
    // Check room limit
    if (this.rooms.size >= this.MAX_ROOMS) {
      logger.warn(`Cannot create room - server at capacity (${this.MAX_ROOMS} rooms)`);
      hostPlayer.ui.sendData({
        type: "room-error",
        message: "Server at capacity. Please try again later.",
      });
      return null;
    }

    const roomId = this.generateRoomId();
    const fullConfig: RoomConfig = {
      id: roomId,
      name: config.name || `${hostPlayer.username}'s Room`,
      gameMode: config.gameMode || GameMode.FIFA,
      maxPlayers: config.maxPlayers || this.MAX_PLAYERS_PER_ROOM,
      hostPlayer: hostPlayer.username,
      isPublic: config.isPublic ?? true,
      createdAt: Date.now(),
    };

    logger.info(`🏠 Creating room: ${fullConfig.name} (${roomId}) - Mode: ${fullConfig.gameMode}`);

    try {
      // Create isolated world for this room
      const roomWorld = WorldManager.instance.createWorld({
        name: `Room_${roomId}`,
        skyboxUri: 'skyboxes/partly-cloudy',
      });

      // Load soccer field map
      if (soccerFieldMapData) {
        roomWorld.loadMap(soccerFieldMapData);
      }

      // Create per-room shared state
      const roomSharedState = new RoomSharedState(roomId);

      // Create ball in this world (will be modified to accept RoomSharedState)
      const soccerBall = createSoccerBallFn(roomWorld, roomSharedState);

      // Create AI players array (populated when game starts)
      const aiPlayers: any[] = [];

      // Create game instance for this room
      const game = new SoccerGameClass(roomWorld, soccerBall, aiPlayers, roomSharedState);

      // Create room-specific audio managers
      const audioManager = new AudioManager(roomWorld);
      const fifaCrowdManager = new FIFACrowdManager(roomWorld);
      const pickupManager = new PickupGameManager(roomWorld);
      const arcadeManager = new ArcadeEnhancementManager(roomWorld);

      // Set arcade manager on world so abilities can find it
      (roomWorld as any)._arcadeManager = arcadeManager;

      // Connect arcade manager to game
      game.setArcadeManager(arcadeManager);

      // Connect crowd manager to game for goal reactions and announcements
      game.setFIFACrowdManager(fifaCrowdManager);

      logger.info(`🎵 Audio managers created for room ${roomId}`);

      const room: Room = {
        config: fullConfig,
        world: roomWorld,
        game,
        sharedState: roomSharedState,
        aiPlayers,
        playerCount: 0,
        spectatorCount: 0,
        status: 'waiting',
        cleanupTimer: null,
        audioManager,
        fifaCrowdManager,
        pickupManager,
        arcadeManager,
      };

      // Set arcade mode flag if room is in arcade mode
      if (fullConfig.gameMode === GameMode.ARCADE) {
        arcadeManager.setRoomArcadeMode(true);
        logger.info(`[Room ${roomId}] 🎮 Arcade mode enabled for room`);
      }

      // Set up event handlers for this room's world
      this.setupRoomEventHandlers(room);

      // Store room
      this.rooms.set(roomId, room);

      logger.info(`✅ Room created: ${roomId} - ${fullConfig.name}`);

      // Move host player to room
      await this.joinRoom(roomId, hostPlayer);

      // Broadcast updated room list to lobby
      this.broadcastRoomList();

      return room;
    } catch (error) {
      logger.error(`Failed to create room: ${error}`);
      hostPlayer.ui.sendData({
        type: "room-error",
        message: "Failed to create room. Please try again.",
      });
      return null;
    }
  }

  /**
   * Join an existing room
   */
  public async joinRoom(roomId: string, player: Player): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) {
      logger.warn(`Room not found: ${roomId}`);
      player.ui.sendData({
        type: "room-error",
        message: "Room not found.",
      });
      return false;
    }

    // Check if room is full
    if (room.playerCount >= room.config.maxPlayers) {
      logger.warn(`Room ${roomId} is full`);
      player.ui.sendData({
        type: "room-full",
        roomId,
        message: "Room is full. Would you like to spectate?",
      });
      return false;
    }

    // Check if match is in progress - offer spectator mode
    if (room.status === 'playing') {
      logger.info(`Room ${roomId} in progress - player ${player.username} will spectate`);
      return this.joinAsSpectator(roomId, player);
    }

    // Cancel any pending cleanup
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
      logger.info(`Room ${roomId} cleanup cancelled - player joined`);
    }

    // Track player-room mapping
    this.playerRoomMap.set(player.username, roomId);
    room.playerCount++;

    logger.info(`👤 Player ${player.username} joined room ${roomId} (${room.playerCount}/${room.config.maxPlayers})`);

    // Move player to room world
    // NOTE: This triggers a disconnect/reconnect - all UI operations must happen
    // in the JOINED_WORLD handler on the room world, NOT here!
    player.joinWorld(room.world);

    // UI loading and team selection is handled in setupRoomEventHandlers -> JOINED_WORLD

    // Broadcast updated room list to lobby
    this.broadcastRoomList();

    return true;
  }

  /**
   * Join a room as spectator (for in-progress matches)
   */
  public async joinAsSpectator(roomId: string, player: Player): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    // Track spectator BEFORE joinWorld so the JOINED_WORLD handler knows this is a spectator
    this.spectatorMap.set(player.username, roomId);
    room.spectatorCount++;

    logger.info(`👁️ Player ${player.username} spectating room ${roomId}`);

    // Move player to room world
    // NOTE: This triggers a disconnect/reconnect - all UI operations happen
    // in the JOINED_WORLD handler on the room world (setupRoomEventHandlers)
    player.joinWorld(room.world);

    return true;
  }

  /**
   * Leave a room (or stop spectating)
   */
  public leaveRoom(player: Player): void {
    // Check if player is in a room
    const roomId = this.playerRoomMap.get(player.username);
    const spectatingRoomId = this.spectatorMap.get(player.username);

    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        // Remove from game if playing
        if (room.game && room.game.removePlayer) {
          room.game.removePlayer(player.username);
        }

        // Despawn player entities in room world
        const entities = room.world.entityManager.getPlayerEntitiesByPlayer(player);
        entities.forEach(entity => {
          if (entity.isSpawned) {
            entity.despawn();
          }
        });

        // Update tracking
        this.playerRoomMap.delete(player.username);
        room.playerCount--;

        logger.info(`👤 Player ${player.username} left room ${roomId} (${room.playerCount} remaining)`);

        // Schedule cleanup if room is empty
        if (room.playerCount === 0 && room.spectatorCount === 0) {
          this.scheduleRoomCleanup(roomId);
        }
      }
    } else if (spectatingRoomId) {
      const room = this.rooms.get(spectatingRoomId);
      if (room) {
        this.spectatorMap.delete(player.username);
        room.spectatorCount--;
        logger.info(`👁️ Spectator ${player.username} left room ${spectatingRoomId}`);

        // Schedule cleanup if room is empty
        if (room.playerCount === 0 && room.spectatorCount === 0) {
          this.scheduleRoomCleanup(spectatingRoomId);
        }
      }
    }

    // Move player back to lobby
    player.joinWorld(this.lobbyWorld);

    // Send room list to returning player
    player.ui.sendData({
      type: "room-list",
      rooms: this.getPublicRoomList(),
    });

    // Broadcast updated room list
    this.broadcastRoomList();
  }

  /**
   * Get list of public rooms for room browser
   */
  public getPublicRoomList(): RoomInfo[] {
    const roomList: RoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (room.config.isPublic) {
        roomList.push(this.getRoomInfo(room));
      }
    }
    return roomList.sort((a, b) => b.playerCount - a.playerCount); // Most populated first
  }

  /**
   * Get all rooms (including private) for admin purposes
   */
  public getAllRooms(): RoomInfo[] {
    return Array.from(this.rooms.values()).map(room => this.getRoomInfo(room));
  }

  /**
   * Get room by ID
   */
  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get room for a specific player
   */
  public getRoomForPlayer(player: Player): Room | undefined {
    const roomId = this.playerRoomMap.get(player.username);
    if (roomId) {
      return this.rooms.get(roomId);
    }
    return undefined;
  }

  /**
   * Get room ID for a player
   */
  public getRoomIdForPlayer(player: Player): string | undefined {
    return this.playerRoomMap.get(player.username);
  }

  /**
   * Check if player is in any room
   */
  public isPlayerInRoom(player: Player): boolean {
    return this.playerRoomMap.has(player.username) || this.spectatorMap.has(player.username);
  }

  /**
   * Find an available public room for quick play
   */
  public findAvailableRoom(preferredMode?: GameMode): Room | null {
    for (const room of this.rooms.values()) {
      if (
        room.config.isPublic &&
        room.status === 'waiting' &&
        room.playerCount < room.config.maxPlayers
      ) {
        // If preferred mode specified, try to match
        if (preferredMode && room.config.gameMode !== preferredMode) {
          continue;
        }
        return room;
      }
    }
    return null;
  }

  /**
   * Update room status
   */
  public setRoomStatus(roomId: string, status: RoomStatus): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.status = status;
      logger.info(`Room ${roomId} status changed to: ${status}`);
      this.broadcastRoomList();
    }
  }

  /**
   * Get room info for client
   */
  private getRoomInfo(room: Room): RoomInfo {
    return {
      id: room.config.id,
      name: room.config.name,
      gameMode: room.config.gameMode,
      playerCount: room.playerCount,
      maxPlayers: room.config.maxPlayers,
      status: room.status,
      isPublic: room.config.isPublic,
    };
  }

  /**
   * Schedule room cleanup after grace period
   */
  private scheduleRoomCleanup(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    logger.info(`Room ${roomId} scheduled for cleanup in ${this.ROOM_CLEANUP_DELAY / 1000}s`);

    room.cleanupTimer = setTimeout(() => {
      const currentRoom = this.rooms.get(roomId);
      if (currentRoom && currentRoom.playerCount === 0 && currentRoom.spectatorCount === 0) {
        this.cleanupRoom(roomId);
      }
    }, this.ROOM_CLEANUP_DELAY);
  }

  /**
   * Clean up and destroy a room
   */
  private cleanupRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    logger.info(`🧹 Cleaning up room: ${roomId}`);

    // Stop all audio for this room
    if (room.audioManager) {
      room.audioManager.stopAll();
      logger.info(`[Room ${roomId}] 🔇 Stopped all music`);
    }
    if (room.fifaCrowdManager) {
      room.fifaCrowdManager.stop();
      logger.info(`[Room ${roomId}] 🔇 Stopped crowd atmosphere`);
    }
    if (room.pickupManager) {
      room.pickupManager.deactivate();
      logger.info(`[Room ${roomId}] 🎯 Deactivated pickup system`);
    }
    if (room.arcadeManager) {
      room.arcadeManager.destroy();
      logger.info(`[Room ${roomId}] 🎮 Destroyed arcade enhancement manager`);
    }

    // Stop game if running
    if (room.game && room.game.resetGame) {
      room.game.resetGame();
    }

    // Despawn and cleanup AI players
    room.aiPlayers.forEach(ai => {
      if (ai.isSpawned) {
        if (ai.deactivate) ai.deactivate();
        ai.despawn();
      }
    });
    room.aiPlayers.length = 0;

    // Clean up room shared state
    room.sharedState.cleanup();

    // Stop world
    room.world.stop();

    // Despawn all remaining entities
    for (const entity of room.world.entityManager.getAllEntities()) {
      if (entity.isSpawned) {
        entity.despawn();
      }
    }

    // Remove from tracking
    this.rooms.delete(roomId);

    logger.info(`✅ Room ${roomId} cleaned up`);

    // Broadcast updated room list
    this.broadcastRoomList();
  }

  /**
   * Set up event handlers for lobby world
   */
  private setupLobbyEventHandlers(): void {
    // Handle player disconnect in lobby
    this.lobbyWorld.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
      logger.info(`Player ${player.username} left lobby`);
    });
  }

  /**
   * Set up event handlers for a room world
   */
  private setupRoomEventHandlers(room: Room): void {
    // Handle player joining room world (fires AFTER world switch reconnection completes)
    room.world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
      logger.info(`🎮 Player ${player.username} joined room world ${room.config.id}`);

      // Now it's safe to load UI - the reconnection is complete
      player.ui.load("ui/index.html");
      logger.info(`⚽ Loaded game UI for ${player.username} in room ${room.config.id}`);

      // Unlock pointer for UI interactions
      player.ui.lockPointer(false);

      // Check if player is a spectator (mid-game join)
      const isSpectator = this.spectatorMap.get(player.username) === room.config.id;

      if (isSpectator) {
        // Spectator mode - just show match in progress message
        player.ui.sendData({
          type: "spectator-mode",
          room: this.getRoomInfo(room),
          message: "Match in Progress - Spectating",
        });
        logger.info(`👁️ ${player.username} is spectating room ${room.config.id}`);
      } else {
        // Regular player - send room info and show team selection
        player.ui.sendData({
          type: "room-joined",
          room: this.getRoomInfo(room),
        });

        // Send team selection data
        player.ui.sendData({
          type: "team-counts",
          red: room.game ? room.game.getPlayerCountOnTeam("red") : 0,
          blue: room.game ? room.game.getPlayerCountOnTeam("blue") : 0,
          maxPlayers: 6,
          singlePlayerMode: true,
        });

        // Trigger team selection UI to show (small delay for UI to load)
        setTimeout(() => {
          player.ui.sendData({
            type: "show-team-selection",
            gameMode: room.config.gameMode,
          });
          logger.info(`📋 Sent show-team-selection to ${player.username}`);
        }, 300);
      }

      // Register UI event handler for this player with room context
      this.registerRoomUIHandler(room, player);
    });

    // Handle player disconnect from room
    room.world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
      logger.info(`Player ${player.username} disconnected from room ${room.config.id}`);

      // Clean up player tracking
      if (this.playerRoomMap.get(player.username) === room.config.id) {
        this.playerRoomMap.delete(player.username);
        room.playerCount--;

        // Remove from game
        if (room.game && room.game.removePlayer) {
          room.game.removePlayer(player.username);
        }

        // Schedule cleanup if empty
        if (room.playerCount === 0 && room.spectatorCount === 0) {
          this.scheduleRoomCleanup(room.config.id);
        }

        this.broadcastRoomList();
      } else if (this.spectatorMap.get(player.username) === room.config.id) {
        this.spectatorMap.delete(player.username);
        room.spectatorCount--;

        if (room.playerCount === 0 && room.spectatorCount === 0) {
          this.scheduleRoomCleanup(room.config.id);
        }
      }
    });
  }

  /**
   * Register UI event handler for a player in a room context
   * This handles team selection and game actions specific to this room
   */
  private registerRoomUIHandler(room: Room, player: Player): void {
    player.ui.on(PlayerUIEvent.DATA, async ({ playerUI, data }) => {
      logger.debug(`[Room ${room.config.id}] Received from ${player.username}: ${data.type}`);

      switch (data.type) {
        case "team-selected":
          await this.handleRoomTeamSelection(room, player, data);
          break;

        case "select-single-player":
          await this.handleRoomSinglePlayer(room, player, data);
          break;

        case "leave-room":
          this.leaveRoom(player);
          break;

        case "manual-reset-game":
          if (room.game) {
            room.game.resetGame();
          }
          break;

        case "request-pass":
          this.handleRoomRequestPass(room, player);
          break;

        case "force-pass":
          this.handleRoomForcePass(room, player);
          break;

        case "start-second-half":
          this.handleRoomStartSecondHalf(room, player);
          break;

        // Pass through other events that the global handler might need
        default:
          // Let global UIEventHandlers handle other events
          break;
      }
    });
  }

  /**
   * Handle team selection in a room
   */
  private async handleRoomTeamSelection(room: Room, player: Player, data: any): Promise<void> {
    const team = data.team as "red" | "blue";
    logger.info(`[Room ${room.config.id}] ${player.username} selected team: ${team}`);

    if (!room.game) {
      logger.error(`Room ${room.config.id} has no game instance`);
      return;
    }

    // Check if player already on a team
    if (room.game.getTeamOfPlayer(player.username) !== null) {
      logger.info(`Player ${player.username} already on a team in room ${room.config.id}`);
      return;
    }

    // Check if team is full (max 6 per team)
    if (room.game.isTeamFull(team)) {
      player.ui.sendData({
        type: "team-full",
        team,
        message: `The ${team} team is full!`,
      });
      return;
    }

    // Clean up any existing entities for this player
    const existingEntities = room.world.entityManager.getPlayerEntitiesByPlayer(player);
    if (existingEntities.length > 0) {
      logger.warn(`⚠️ Player ${player.username} has ${existingEntities.length} existing entities - cleaning up`);
      existingEntities.forEach((entity) => {
        if (entity.isSpawned) {
          entity.despawn();
        }
      });
    }

    // Join game and team using the correct SoccerGame methods
    room.game.joinGame(player.username, player.username);
    room.game.joinTeam(player.username, team);

    // Create player entity with midfielder role
    const humanPlayerRole = "central-midfielder-1";
    const playerEntity = new SoccerPlayerEntity(player, team, humanPlayerRole);

    // CRITICAL: Set room state on player entity so controller can find the ball
    playerEntity.setRoomSharedState(room.sharedState);

    // Get proper spawn position using getStartPosition helper
    const { getStartPosition } = await import("../utils/positions");
    const spawnPos = getStartPosition(team, humanPlayerRole);
    logger.info(`[Room ${room.config.id}] Spawning ${player.username} at X=${spawnPos.x.toFixed(2)}, Y=${spawnPos.y.toFixed(2)}, Z=${spawnPos.z.toFixed(2)}`);

    // Spawn the player entity
    playerEntity.spawn(room.world, spawnPos);

    // Freeze player initially (game logic will unfreeze at match start)
    playerEntity.freeze();

    // Spawn AI for single player mode
    if (data.singlePlayerMode) {
      await this.spawnRoomAI(room, team);

      // Start the game immediately for single player
      const gameStarted = room.game.startGame();
      room.status = "playing";
      logger.info(`[Room ${room.config.id}] Single player game started! (success: ${gameStarted})`);

      // Start room-specific audio based on game mode
      room.audioManager.playGameplayMusic(room.config.gameMode);
      logger.info(`[Room ${room.config.id}] 🎵 Started ${room.config.gameMode} gameplay music`);

      // Start FIFA crowd atmosphere if in FIFA mode
      if (room.config.gameMode === GameMode.FIFA || room.config.gameMode === GameMode.TOURNAMENT) {
        room.fifaCrowdManager.start();
        room.fifaCrowdManager.playGameStart();
        logger.info(`[Room ${room.config.id}] 🏟️ Started FIFA crowd atmosphere`);
      }

      // Activate Arcade mode systems
      if (room.config.gameMode === GameMode.ARCADE) {
        room.pickupManager.activate();
        room.arcadeManager.setRoomArcadeMode(true);
        logger.info(`[Room ${room.config.id}] 🎯 Activated pickup system and arcade manager for Arcade mode`);
      }

      // Unfreeze player after short delay (like the original handler does)
      setTimeout(() => {
        if (playerEntity && typeof playerEntity.unfreeze === "function") {
          playerEntity.unfreeze();
          logger.info(`[Room ${room.config.id}] Player ${player.username} unfrozen - game active!`);
        }

        // Lock pointer for gameplay
        player.ui.lockPointer(true);
        logger.info(`[Room ${room.config.id}] Pointer locked for ${player.username} - controls enabled`);

        // Clear loading UI
        player.ui.sendData({
          type: "loading-complete",
        });
      }, 500);
    }

    // Notify player
    player.ui.sendData({
      type: "team-confirmed",
      team,
      message: `You joined the ${team} team!`,
    });

    // Send game state
    const gameState = room.game.getState();
    player.ui.sendData({
      type: "game-state",
      inProgress: room.game.inProgress(),
      redScore: gameState.score.red,
      blueScore: gameState.score.blue,
    });

    logger.info(`✅ Player ${player.username} spawned on ${team} team in room ${room.config.id}`);
  }

  /**
   * Handle single player mode in a room
   */
  private async handleRoomSinglePlayer(room: Room, player: Player, data: any): Promise<void> {
    logger.info(`[Room ${room.config.id}] ${player.username} starting single player`);

    // Default to red team for single player, ensure singlePlayerMode is set
    await this.handleRoomTeamSelection(room, player, {
      team: data.team || "red",
      singlePlayerMode: true
    });
  }

  /**
   * Spawn AI players for a room
   */
  private async spawnRoomAI(room: Room, playerTeam: "red" | "blue"): Promise<void> {
    if (!spawnAIPlayersFn) {
      logger.error("spawnAIPlayersFn not initialized");
      return;
    }

    // Clear existing AI
    for (const ai of room.aiPlayers) {
      if (ai.isSpawned) {
        ai.despawn();
      }
    }
    room.aiPlayers.length = 0;

    // Spawn new AI with room's shared state
    await spawnAIPlayersFn(room.world, playerTeam, room.aiPlayers, room.sharedState);

    // Activate AI
    for (const ai of room.aiPlayers) {
      ai.activate();
    }

    logger.info(`🤖 Spawned ${room.aiPlayers.length} AI players in room ${room.config.id}`);
  }

  /**
   * Broadcast updated room list to all players in lobby
   */
  private broadcastRoomList(): void {
    const roomList = this.getPublicRoomList();
    const players = this.lobbyWorld.entityManager.getAllPlayerEntities();

    for (const playerEntity of players) {
      if (playerEntity.player) {
        playerEntity.player.ui.sendData({
          type: "room-list",
          rooms: roomList,
        });
      }
    }
  }

  /**
   * Get server statistics
   */
  public getStats(): { rooms: number; players: number; spectators: number } {
    let totalPlayers = 0;
    let totalSpectators = 0;

    for (const room of this.rooms.values()) {
      totalPlayers += room.playerCount;
      totalSpectators += room.spectatorCount;
    }

    return {
      rooms: this.rooms.size,
      players: totalPlayers,
      spectators: totalSpectators,
    };
  }

  /**
   * Handle request-pass: Human player requests AI teammate to pass to them
   * This is the "Force Pass to Me" button functionality
   */
  private handleRoomRequestPass(room: Room, player: Player): void {
    logger.info(`[Room ${room.config.id}] Request pass from ${player.username}`);

    // Find the requesting player's entity
    const requestingPlayerEntity = room.world.entityManager
      .getAllPlayerEntities()
      .find((entity) => entity.player.username === player.username);

    if (!requestingPlayerEntity || !(requestingPlayerEntity instanceof SoccerPlayerEntity)) {
      logger.warn(`[Room ${room.config.id}] Could not find player entity for ${player.username}`);
      return;
    }

    // Check who has the ball in this room
    const playerWithBall = room.sharedState.getAttachedPlayer();

    // Only works if an AI teammate has the ball
    if (
      playerWithBall &&
      playerWithBall instanceof AIPlayerEntity &&
      playerWithBall.team === requestingPlayerEntity.team
    ) {
      logger.info(
        `[Room ${room.config.id}] AI ${playerWithBall.player.username} passing to human ${requestingPlayerEntity.player.username}`
      );

      // Calculate distance for power scaling
      const distanceToPlayer = Math.sqrt(
        Math.pow(playerWithBall.position.x - requestingPlayerEntity.position.x, 2) +
        Math.pow(playerWithBall.position.z - requestingPlayerEntity.position.z, 2)
      );

      // Calculate target point slightly in front of requesting player
      const leadDistance = 2.5;
      const rotation = requestingPlayerEntity.rotation;
      const targetDirection = {
        x: -Math.sin(rotation.y),
        z: -Math.cos(rotation.y)
      };

      const passTargetPoint = {
        x: requestingPlayerEntity.position.x + targetDirection.x * leadDistance,
        y: requestingPlayerEntity.position.y,
        z: requestingPlayerEntity.position.z + targetDirection.z * leadDistance,
      };

      // Scale power based on distance
      let passPower = 0.7;
      if (distanceToPlayer > 20) {
        passPower = 0.95;
      } else if (distanceToPlayer > 10) {
        passPower = 0.8;
      }

      // Execute the pass
      const passSuccess = playerWithBall.forcePass(
        requestingPlayerEntity,
        passTargetPoint,
        passPower
      );

      if (passSuccess) {
        logger.info(`[Room ${room.config.id}] Pass successful to ${requestingPlayerEntity.player.username}`);
        player.ui.sendData({
          type: "action-feedback",
          feedbackType: "success",
          title: "Pass Incoming!",
          message: `${playerWithBall.player.username} is passing`,
        });
      } else {
        logger.warn(`[Room ${room.config.id}] Pass failed`);
        player.ui.sendData({
          type: "action-feedback",
          feedbackType: "error",
          title: "Pass Failed",
          message: "Teammate couldn't pass",
        });
      }
    } else {
      logger.info(`[Room ${room.config.id}] No AI teammate with ball for ${player.username}`);
      player.ui.sendData({
        type: "action-feedback",
        feedbackType: "warning",
        title: "No Pass Available",
        message: "No teammate has the ball",
      });
    }
  }

  /**
   * Handle force-pass: Human player with ball passes
   * This triggers a pass action when the player has the ball
   */
  private handleRoomForcePass(room: Room, player: Player): void {
    logger.info(`[Room ${room.config.id}] Force pass from ${player.username}`);

    // Find the player's entity
    const playerEntity = room.world.entityManager
      .getAllPlayerEntities()
      .find((entity) => entity.player.username === player.username);

    if (playerEntity && playerEntity instanceof SoccerPlayerEntity) {
      // Check if player has the ball
      const attachedPlayer = room.sharedState.getAttachedPlayer();
      const hasBall = attachedPlayer?.player?.username === player.username;

      if (hasBall) {
        // Simulate a left mouse click to trigger the pass
        const fakeInput = {
          w: false, a: false, s: false, d: false, sp: false,
          ml: true, // Left mouse click for pass
          mr: false, q: false, sh: false, e: false, f: false, "1": false,
        };

        // Call the controller's input handler
        if (playerEntity.controller && (playerEntity.controller as any).tickWithPlayerInput) {
          (playerEntity.controller as any).tickWithPlayerInput(
            playerEntity,
            fakeInput,
            { yaw: 0, pitch: 0 },
            16
          );

          logger.info(`[Room ${room.config.id}] Force pass executed for ${player.username}`);
          player.ui.sendData({
            type: "action-feedback",
            feedbackType: "success",
            title: "Pass",
            message: "Pass executed!",
          });
        }
      } else {
        logger.info(`[Room ${room.config.id}] ${player.username} doesn't have the ball`);
        player.ui.sendData({
          type: "action-feedback",
          feedbackType: "warning",
          title: "Pass Failed",
          message: "You don't have the ball!",
        });
      }
    }
  }

  /**
   * Handle start second half request in room context
   */
  private handleRoomStartSecondHalf(room: Room, player: Player): void {
    logger.info(`[Room ${room.config.id}] ${player.username} requested to start second half`);

    if (!room.game) {
      logger.error(`[Room ${room.config.id}] No game instance`);
      player.ui.sendData({
        type: "error",
        message: "No game in progress",
      });
      return;
    }

    const gameState = room.game.getState();
    logger.info(`[Room ${room.config.id}] Game state - isHalftime: ${gameState.isHalftime}, status: ${gameState.status}`);

    if (gameState.isHalftime) {
      logger.info(`[Room ${room.config.id}] Game is in halftime, starting second half`);
      room.game.startSecondHalf();
      logger.info(`[Room ${room.config.id}] Second half started successfully`);
    } else {
      logger.warn(`[Room ${room.config.id}] Cannot start second half - not in halftime (status: ${gameState.status})`);
      player.ui.sendData({
        type: "error",
        message: "Second half can only be started during halftime",
      });
    }
  }
}

export default RoomManager;
