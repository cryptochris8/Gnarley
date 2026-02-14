/**
 * PhysicalLobby - Main orchestrator for the physical lobby system
 *
 * Players spawn on the soccer field with their own ball.
 * Kick the ball through a glowing portal to select a game mode
 * and enter a game room.
 */

import {
  World,
  Player,
  DefaultPlayerEntity,
  Entity,
  EntityEvent,
  Audio,
  BaseEntityControllerEvent,
} from "hytopia";
import { GameMode } from "../state/gameModes";
import { RoomManager } from "../state/RoomManager";
import { logger } from "../utils/GameLogger";
import { LobbyPortal } from "./LobbyPortal";
import {
  createLobbyBall,
  checkBallRespawn,
  updateBallFollow,
  isInPossessionRange,
  getBallSpeed,
  MAX_BALL_SPEED_FOR_PICKUP,
} from "./LobbyBall";
import {
  PORTAL_CONFIGS,
  PORTAL_COOLDOWN_MS,
  LOBBY_SPAWN_POSITION,
} from "./lobbyConfig";

/** Volume for lobby ambient background audio */
const LOBBY_AMBIENT_VOLUME = 0.3;
/** Volume for lobby ball kick sound effect */
const LOBBY_KICK_SOUND_VOLUME = 0.5;

export class PhysicalLobby {
  private world: World;
  private portals: LobbyPortal[] = [];

  /** username -> lobby ball entity */
  private playerBalls: Map<string, Entity> = new Map();
  /** username -> player entity */
  private playerEntities: Map<string, DefaultPlayerEntity> = new Map();
  /** username -> last portal trigger timestamp */
  private portalCooldowns: Map<string, number> = new Map();
  /** username -> whether ball is currently possessed */
  private ballPossession: Map<string, boolean> = new Map();
  /** username -> timestamp of last kick (prevents instant re-possession) */
  private kickTimestamps: Map<string, number> = new Map();
  /** username -> previous right-click (mr) state for edge detection */
  private kickStates: Map<string, boolean> = new Map();
  /** Whether portals have been spawned (deferred until first player joins) */
  private portalsSpawned = false;
  /** Lobby ambient background audio */
  private ambientAudio: Audio | null = null;

  constructor(world: World) {
    this.world = world;
  }

  /**
   * Initialize the physical lobby (prepares config, portals deferred to first join)
   */
  initialize(): void {
    logger.debug("Physical lobby ready (portals spawn on first player join)");
  }

  /**
   * Spawn portals on first player join so the client-side SceneUI template
   * ("portal-label") is registered from lobby-hud.html before labels render.
   */
  private ensurePortalsSpawned(): void {
    if (this.portalsSpawned) return;
    this.portalsSpawned = true;

    logger.debug("Spawning lobby portals...");
    for (const config of PORTAL_CONFIGS) {
      const portal = new LobbyPortal(config, this);
      portal.spawn(this.world);
      this.portals.push(portal);
    }
    logger.debug(`Physical lobby: ${this.portals.length} portals spawned`);
  }

  /**
   * Handle a new player joining the lobby world
   */
  onPlayerJoin(player: Player): void {
    logger.debug(`Physical lobby: ${player.username} joining`);

    // Load lobby HUD first so SceneUI template "portal-label" is available
    player.ui.load("ui/lobby-hud.html");

    // Spawn portals on first player join (after UI template is loaded)
    this.ensurePortalsSpawned();

    // Start lobby ambient audio on first player join
    if (!this.ambientAudio) {
      this.ambientAudio = new Audio({
        uri: "audio/music/Ian Post - 8 Bit Samba - No FX.mp3",
        loop: true,
        volume: LOBBY_AMBIENT_VOLUME,
      });
      this.ambientAudio.play(this.world);
      logger.debug("Lobby ambient music started");
    }

    // Create player entity (DefaultPlayerEntity at default scale)
    // No modelLoopedAnimations — let DefaultPlayerEntityController handle all
    // animation switching automatically (walk-upper/lower, run-upper/lower, etc.)
    const playerEntity = new DefaultPlayerEntity({
      player,
      name: player.username,
    });
    playerEntity.spawn(this.world, LOBBY_SPAWN_POSITION);
    this.playerEntities.set(player.username, playerEntity);

    // Create personal lobby ball
    const ball = createLobbyBall(this.world, player.username);
    ball.spawn(this.world, {
      x: LOBBY_SPAWN_POSITION.x,
      y: LOBBY_SPAWN_POSITION.y + 0.5,
      z: LOBBY_SPAWN_POSITION.z + 1,
    });
    this.playerBalls.set(player.username, ball);
    this.ballPossession.set(player.username, true); // start possessed

    // Set up kick detection via controller input
    this.kickStates.set(player.username, false);
    if (playerEntity.controller) {
      playerEntity.controller.on(
        BaseEntityControllerEvent.TICK_WITH_PLAYER_INPUT,
        ({ input, cameraOrientation }: any) => {
          const prevMr = this.kickStates.get(player.username) ?? false;
          if (input.mr && !prevMr) {
            // Rising edge of right-click = kick
            this.handleKick(player.username, cameraOrientation);
          }
          this.kickStates.set(player.username, !!input.mr);
        }
      );
    }

    // Set up ball tick handler for possession + respawn logic
    this.setupBallTick(player.username, ball, playerEntity);

    // Broadcast updated room count to all lobby players
    this.broadcastRoomCount();

    // Welcome message
    this.world.chatManager.sendPlayerMessage(
      player,
      "Kick the ball through a portal to play!"
    );

    logger.debug(`Physical lobby: ${player.username} spawned with ball`);
  }

  /**
   * Handle player leaving the lobby world
   */
  onPlayerLeave(player: Player): void {
    logger.debug(`Physical lobby: ${player.username} leaving`);

    // Despawn ball
    const ball = this.playerBalls.get(player.username);
    if (ball?.isSpawned) {
      ball.despawn();
    }
    this.playerBalls.delete(player.username);

    // Despawn player entity
    const entity = this.playerEntities.get(player.username);
    if (entity?.isSpawned) {
      entity.despawn();
    }
    this.playerEntities.delete(player.username);

    // Clean up tracking
    this.portalCooldowns.delete(player.username);
    this.ballPossession.delete(player.username);
    this.kickTimestamps.delete(player.username);
    this.kickStates.delete(player.username);

    // Broadcast updated room count to remaining lobby players
    this.broadcastRoomCount();
  }

  /**
   * Handle a portal being triggered by a kicked ball
   */
  async handlePortalTriggered(
    player: Player,
    gameMode: GameMode
  ): Promise<void> {
    // Check cooldown
    const now = Date.now();
    const lastTrigger = this.portalCooldowns.get(player.username) || 0;
    if (now - lastTrigger < PORTAL_COOLDOWN_MS) {
      logger.debug(
        `Portal cooldown active for ${player.username} (${((now - lastTrigger) / 1000).toFixed(1)}s)`
      );
      return;
    }
    this.portalCooldowns.set(player.username, now);

    logger.debug(
      `Portal triggered: ${player.username} -> ${gameMode}`
    );

    // Try to find or create a room
    const roomManager = RoomManager.getInstance();

    // First try to find an existing room with the same mode
    const existingRoom = roomManager.findAvailableRoom(gameMode);
    if (existingRoom) {
      logger.debug(
        `Joining existing room ${existingRoom.config.id} for ${player.username}`
      );
      await roomManager.joinRoom(existingRoom.config.id, player);
      return;
    }

    // No available room — create a new one
    const room = await roomManager.createRoom(
      {
        gameMode,
        name: `${player.username}'s ${gameMode} Room`,
      },
      player
    );

    if (!room) {
      // All rooms full or creation failed
      this.world.chatManager.sendPlayerMessage(
        player,
        "All rooms are full. Try again shortly!"
      );
    }
  }

  /**
   * Reverse lookup: find which player owns a ball entity
   */
  getBallOwner(ballEntity: Entity): Player | null {
    // Ball name format: "LobbyBall_username"
    const prefix = "LobbyBall_";
    if (!ballEntity.name?.startsWith(prefix)) return null;
    const username = ballEntity.name.substring(prefix.length);

    // Find the Player object via the player entity
    const playerEntity = this.playerEntities.get(username);
    if (!playerEntity) return null;
    return playerEntity.player;
  }

  /**
   * Send current room count to a lobby player
   */
  sendRoomCount(player: Player): void {
    if (!RoomManager.isInitialized()) return;
    const stats = RoomManager.getInstance().getStats();
    player.ui.sendData({
      type: "lobby-room-count",
      activeRooms: stats.rooms,
      totalPlayers: stats.players,
    });
  }

  /**
   * Broadcast room count to all lobby players
   */
  broadcastRoomCount(): void {
    if (!RoomManager.isInitialized()) return;
    const stats = RoomManager.getInstance().getStats();
    for (const [_username, entity] of this.playerEntities) {
      if (entity.player) {
        entity.player.ui.sendData({
          type: "lobby-room-count",
          activeRooms: stats.rooms,
          totalPlayers: stats.players,
        });
      }
    }
  }

  /**
   * Set up tick handler for a player's lobby ball
   */
  private setupBallTick(
    username: string,
    ball: Entity,
    playerEntity: DefaultPlayerEntity
  ): void {
    ball.on(EntityEvent.TICK, () => {
      // Run every tick (matching game ball behavior for smooth follow)
      if (!ball.isSpawned || !playerEntity.isSpawned) return;
      if (!this.playerBalls.has(username)) return;

      const possessed = this.ballPossession.get(username) ?? false;

      if (possessed) {
        // Ball follows player
        updateBallFollow(ball, playerEntity);
      } else {
        // Ball is loose — check if player picks it up (with kick cooldown + speed gate)
        const lastKick = this.kickTimestamps.get(username) ?? 0;
        const kickCooldownExpired = Date.now() - lastKick > 1500;
        const ballSpeed = getBallSpeed(ball);
        const ballSlowEnough = ballSpeed < MAX_BALL_SPEED_FOR_PICKUP;
        if (kickCooldownExpired && ballSlowEnough && isInPossessionRange(ball, playerEntity)) {
          this.ballPossession.set(username, true);
        }

        // Respawn if lost
        checkBallRespawn(ball, playerEntity);
      }
    });

    // Collision-based possession pickup (backup to proximity, matches game ball)
    ball.on(EntityEvent.ENTITY_COLLISION, ({ entity, otherEntity, started }) => {
      if (!started) return;
      if (otherEntity !== playerEntity) return;
      if (this.ballPossession.get(username)) return; // already possessed

      const lastKick = this.kickTimestamps.get(username) ?? 0;
      const ballSpeed = getBallSpeed(ball);
      if (Date.now() - lastKick > 1500 && ballSpeed < MAX_BALL_SPEED_FOR_PICKUP) {
        this.ballPossession.set(username, true);
      }
    });
  }

  /**
   * Handle a kick action: apply impulse to the ball in the camera direction
   */
  private handleKick(
    username: string,
    cameraOrientation: { yaw: number; pitch: number }
  ): void {
    const ball = this.playerBalls.get(username);
    if (!ball?.isSpawned) return;

    // Only kick if the ball is currently possessed
    if (!this.ballPossession.get(username)) return;

    // Calculate kick direction from camera yaw (same pattern as SoccerPlayerController)
    const yaw = cameraOrientation.yaw;
    const dirX = -Math.sin(yaw);
    const dirZ = -Math.cos(yaw);

    // Release possession first, record kick time
    this.releaseBall(username);
    this.kickTimestamps.set(username, Date.now());

    // Offset ball forward in kick direction before applying impulse
    // This prevents the ball from being immediately recaptured
    const playerPos = this.playerEntities.get(username)?.position;
    if (playerPos) {
      ball.setPosition({
        x: playerPos.x + dirX * 1.5,
        y: playerPos.y + 0.3,
        z: playerPos.z + dirZ * 1.5,
      });
    }

    // Reset velocity and spin before kick for clean trajectory
    ball.setLinearVelocity({ x: 0, y: 0, z: 0 });
    ball.setAngularVelocity({ x: 0, y: 0, z: 0 });

    // Strong kick force with a slight arc
    ball.applyImpulse({ x: dirX * 10, y: 2.5, z: dirZ * 10 });

    // Play kick sound effect
    const kickAudio = new Audio({
      uri: "audio/sfx/soccer/kick.mp3",
      loop: false,
      volume: LOBBY_KICK_SOUND_VOLUME,
    });
    kickAudio.play(this.world);

    logger.debug(`Lobby kick: ${username} dir=(${dirX.toFixed(2)}, ${dirZ.toFixed(2)})`);
  }

  /**
   * Release a player's ball from possession (called externally when player kicks)
   */
  releaseBall(username: string): void {
    this.ballPossession.set(username, false);
  }

  /**
   * Get the ball entity for a player
   */
  getBall(username: string): Entity | undefined {
    return this.playerBalls.get(username);
  }

  /**
   * Check if a player's ball is possessed
   */
  isBallPossessed(username: string): boolean {
    return this.ballPossession.get(username) ?? false;
  }

  /**
   * Clean up everything
   */
  cleanup(): void {
    // Despawn all balls
    for (const [_username, ball] of this.playerBalls) {
      if (ball.isSpawned) ball.despawn();
    }
    this.playerBalls.clear();

    // Despawn all player entities
    for (const [_username, entity] of this.playerEntities) {
      if (entity.isSpawned) entity.despawn();
    }
    this.playerEntities.clear();

    // Despawn all portals
    for (const portal of this.portals) {
      portal.despawn();
    }
    this.portals = [];

    this.portalCooldowns.clear();
    this.ballPossession.clear();
    this.kickTimestamps.clear();
    this.kickStates.clear();

    // Stop lobby ambient audio
    if (this.ambientAudio) {
      this.ambientAudio.pause();
      this.ambientAudio = null;
    }
  }
}
