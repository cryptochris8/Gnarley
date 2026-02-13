/**
 * LobbyBall - Per-player lobby ball
 *
 * Simplified version of the game ball (utils/ball.ts).
 * No goal sensors, no boundary reset — just possession + respawn.
 */

import {
  Entity,
  EntityEvent,
  RigidBodyType,
  ColliderShape,
  CollisionGroup,
  World,
} from "hytopia";
import { BALL_CONFIG } from "../state/gameConfig";
import { getDirectionFromRotation } from "../utils/direction";
import { LOBBY_BALL_MIN_Y, LOBBY_BALL_RESPAWN_DISTANCE } from "./lobbyConfig";

/**
 * Possession radius (units).
 * Matches the game ball's base PROXIMITY_POSSESSION_DISTANCE (2.5) in utils/ball.ts.
 * The game ball uses an expanded 3.5-unit radius for moving/pass reception,
 * but the lobby ball only needs stationary pickup since there are no passes.
 */
const POSSESSION_DISTANCE = 2.5;

/** Max ball speed for proximity re-possession (prevents picking up fast-moving balls) */
export const MAX_BALL_SPEED_FOR_PICKUP = 3.0;

/** Ball offset in front of player when possessed */
const BALL_FOLLOW_OFFSET = 0.7;

/**
 * Create a lobby ball entity for a specific player
 */
export function createLobbyBall(
  world: World,
  ownerUsername: string
): Entity {
  const ball = new Entity({
    name: `LobbyBall_${ownerUsername}`,
    modelUri: "models/soccer/scene.gltf",
    modelScale: BALL_CONFIG.SCALE,
    rigidBodyOptions: {
      type: RigidBodyType.DYNAMIC,
      ccdEnabled: true,
      linearDamping: BALL_CONFIG.LINEAR_DAMPING,
      angularDamping: BALL_CONFIG.ANGULAR_DAMPING,
      colliders: [
        {
          shape: ColliderShape.BALL,
          radius: BALL_CONFIG.RADIUS,
          friction: BALL_CONFIG.FRICTION,
          collisionGroups: {
            belongsTo: [CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY, CollisionGroup.ENTITY_SENSOR],
          },
        },
      ],
    },
  });

  // Tuned block collision bounce matching game ball (utils/ball.ts)
  ball.on(EntityEvent.BLOCK_COLLISION, ({ entity, blockType, started }) => {
    if (started) {
      const velocity = entity.linearVelocity;
      const dampingFactor = 0.85;
      entity.setLinearVelocity({
        x: velocity.x * dampingFactor,
        y: Math.abs(velocity.y) * 0.6,
        z: velocity.z * dampingFactor,
      });
      const angVel = entity.angularVelocity;
      entity.setAngularVelocity({
        x: angVel.x * 0.4,
        y: angVel.y * 0.4,
        z: angVel.z * 0.4,
      });
    }
  });

  return ball;
}

/**
 * Check if a lobby ball needs respawning (too far or fell off map).
 * Returns true if respawned.
 */
export function checkBallRespawn(
  ball: Entity,
  playerEntity: { position: { x: number; y: number; z: number } }
): boolean {
  if (!ball.isSpawned) return false;

  const bPos = ball.position;
  const pPos = playerEntity.position;

  // Fell off map
  if (bPos.y < LOBBY_BALL_MIN_Y) {
    ball.setPosition({ x: pPos.x, y: pPos.y + 0.5, z: pPos.z });
    ball.setLinearVelocity({ x: 0, y: 0, z: 0 });
    ball.setAngularVelocity({ x: 0, y: 0, z: 0 });
    return true;
  }

  // Too far from owner
  const dx = bPos.x - pPos.x;
  const dz = bPos.z - pPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > LOBBY_BALL_RESPAWN_DISTANCE) {
    ball.setPosition({ x: pPos.x, y: pPos.y + 0.5, z: pPos.z });
    ball.setLinearVelocity({ x: 0, y: 0, z: 0 });
    ball.setAngularVelocity({ x: 0, y: 0, z: 0 });
    return true;
  }

  return false;
}

/**
 * Update ball position when possessed (follows player).
 */
export function updateBallFollow(
  ball: Entity,
  playerEntity: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    linearVelocity: { x: number; y: number; z: number };
  }
): void {
  const direction = getDirectionFromRotation(playerEntity.rotation);
  const ballPosition = {
    x: playerEntity.position.x - direction.x * BALL_FOLLOW_OFFSET,
    y: playerEntity.position.y - 0.5,
    z: playerEntity.position.z - direction.z * BALL_FOLLOW_OFFSET,
  };

  ball.setPosition(ballPosition);
  ball.setLinearVelocity({ x: 0, y: 0, z: 0 });

  // Rolling animation based on player speed
  const vel = playerEntity.linearVelocity;
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  if (speed > 0.5) {
    const rotMult = 2.0;
    const rotSpeed = speed * rotMult;
    const moveDir = { x: vel.x / speed, z: vel.z / speed };
    ball.setAngularVelocity({
      x: -moveDir.z * rotSpeed,
      y: 0,
      z: moveDir.x * rotSpeed,
    });
  } else {
    ball.setAngularVelocity({ x: 0, y: 0, z: 0 });
  }
}

/**
 * Check proximity possession: is any owned ball near enough to be "picked up"?
 * Returns true if the ball is within possession range of its owner.
 */
export function isInPossessionRange(
  ball: Entity,
  playerEntity: { position: { x: number; y: number; z: number } }
): boolean {
  const dx = ball.position.x - playerEntity.position.x;
  const dz = ball.position.z - playerEntity.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return dist < POSSESSION_DISTANCE;
}

/**
 * Get the current speed of the ball (horizontal magnitude).
 * Used by possession checks to avoid picking up fast-moving balls.
 */
export function getBallSpeed(ball: Entity): number {
  const vel = ball.linearVelocity;
  return Math.sqrt(vel.x * vel.x + vel.z * vel.z);
}
