/**
 * LobbyPortal - A single portal entity in the physical lobby
 *
 * Each portal consists of:
 * - A visual block entity (colored, glowing)
 * - A sensor entity for detecting ball entry
 * - A SceneUI label floating above
 * - Ambient portal audio
 */

import {
  Entity,
  EntityEvent,
  RigidBodyType,
  ColliderShape,
  World,
  Audio,
  SceneUI,
  BlockType,
} from "hytopia";
import { GameMode } from "../state/gameModes";
import {
  type PortalConfig,
  PORTAL_SENSOR_HALF_EXTENTS,
  MIN_BALL_VELOCITY_FOR_PORTAL,
} from "./lobbyConfig";
import type { PhysicalLobby } from "./PhysicalLobby";

/** Volume for the ambient portal hum sound */
const PORTAL_AMBIENT_VOLUME = 0.15;
/** Volume for the portal activation woosh sound */
const PORTAL_ACTIVATION_VOLUME = 0.4;

export class LobbyPortal {
  private config: PortalConfig;
  private lobby: PhysicalLobby;

  private portalEntity: Entity | null = null;
  private label: SceneUI | null = null;
  private ambientAudio: Audio | null = null;
  private world: World | null = null;

  constructor(config: PortalConfig, lobby: PhysicalLobby) {
    this.config = config;
    this.lobby = lobby;
  }

  get gameMode(): GameMode {
    return this.config.gameMode;
  }

  /**
   * Spawn all portal components into the world
   */
  spawn(world: World): void {
    this.world = world;

    // --- Single portal entity: visible, FIXED, sensor-only collider (pass-through) ---
    this.portalEntity = new Entity({
      name: `Portal_${this.config.gameMode}`,
      blockTextureUri: "blocks/grass.png",
      blockHalfExtents: { x: 2.5, y: 3, z: 0.5 },
      opacity: 0.7,
      rigidBodyOptions: {
        type: RigidBodyType.FIXED,
        colliders: [
          {
            shape: ColliderShape.BLOCK,
            halfExtents: PORTAL_SENSOR_HALF_EXTENTS,
            isSensor: true,
            onCollision: (other: BlockType | Entity, started: boolean) => {
              if (started && other instanceof Entity) {
                this.onSensorCollision(other);
              }
            },
          },
        ],
      },
    });

    // Register collision listener BEFORE spawn so SDK enables collision events
    this.portalEntity.on(EntityEvent.ENTITY_COLLISION, ({ entity, otherEntity, started }) => {
      if (started) {
        this.onSensorCollision(otherEntity);
      }
    });

    this.portalEntity.spawn(world, this.config.position);
    this.portalEntity.setTintColor(this.config.color);

    // --- Floating label above portal ---
    this.label = new SceneUI({
      templateId: "portal-label",
      attachedToEntity: this.portalEntity,
      offset: { x: 0, y: 4, z: 0 },
      viewDistance: 60,
      state: {
        text: this.config.label,
        color: `rgb(${this.config.color.r},${this.config.color.g},${this.config.color.b})`,
      },
    });
    this.label.load(world);

    // --- Ambient portal hum ---
    this.ambientAudio = new Audio({
      uri: "audio/sfx/entity/portal/portal-idle.mp3",
      volume: PORTAL_AMBIENT_VOLUME,
      loop: true,
      attachedToEntity: this.portalEntity,
      referenceDistance: 5,
      cutoffDistance: 30,
    });
    this.ambientAudio.play(world);

    console.log(
      `Portal spawned: ${this.config.label} at (${this.config.position.x}, ${this.config.position.y}, ${this.config.position.z})`
    );
  }

  /**
   * Despawn and clean up all portal components
   */
  despawn(): void {
    if (this.ambientAudio) {
      this.ambientAudio.pause();
      this.ambientAudio = null;
    }
    if (this.label) {
      this.label.unload();
      this.label = null;
    }
    if (this.portalEntity?.isSpawned) {
      this.portalEntity.despawn();
      this.portalEntity = null;
    }
    this.world = null;
  }

  /**
   * Handle sensor collision — validate ball entry and trigger portal
   */
  private onSensorCollision(other: Entity): void {
    // Only react to lobby balls
    if (!other.name?.startsWith("LobbyBall_")) return;

    // Check ball velocity (must be kicked, not drifting)
    const vel = other.linearVelocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    if (speed < MIN_BALL_VELOCITY_FOR_PORTAL) return;

    // Look up which player owns this ball
    const player = this.lobby.getBallOwner(other);
    if (!player) return;

    // Play activation sound
    if (this.world) {
      new Audio({
        uri: "audio/sfx/entity/portal/portal-travel-woosh.mp3",
        volume: PORTAL_ACTIVATION_VOLUME,
        loop: false,
      }).play(this.world);
    }

    // Delegate to lobby orchestrator
    this.lobby.handlePortalTriggered(player, this.config.gameMode);
  }
}
