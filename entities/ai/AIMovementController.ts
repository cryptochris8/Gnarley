/**
 * AIMovementController - Physics-based movement and positioning
 *
 * Handles all AI movement including:
 * - Physics-based movement with impulses and velocity
 * - Rotation towards movement direction
 * - Position constraints (preferred areas, field bounds)
 * - Teammate spacing and collision avoidance
 *
 * Extracted from AIPlayerEntity.ts to improve modularity.
 */

import type { Vector3Like } from "hytopia";
import {
  SoccerAIRole,
  ROLE_DEFINITIONS,
  TEAMMATE_REPULSION_DISTANCE,
  TEAMMATE_REPULSION_STRENGTH,
} from "./AIRoleDefinitions";
import {
  FIELD_MIN_X,
  FIELD_MAX_X,
  FIELD_MIN_Z,
  FIELD_MAX_Z,
  SAFE_SPAWN_Y,
} from "../../state/gameConfig";
import type SoccerPlayerEntity from "../SoccerPlayerEntity";

/**
 * Interface for movement controller context
 */
export interface MovementContext {
  position: Vector3Like;
  rotation: Vector3Like;
  linearVelocity: Vector3Like | undefined;
  aiRole: SoccerAIRole;
  team: "red" | "blue";
  _mass: number;
  _lastRotationUpdateTime: number | null;
  hasRotationBeenSetThisTick: boolean;

  // Methods
  setLinearVelocity: (velocity: Vector3Like) => void;
  setRotation: (rotation: Vector3Like) => void;
  applyImpulse: (impulse: Vector3Like) => void;
  getVisibleTeammates: () => SoccerPlayerEntity[];
  distanceBetween: (pos1: Vector3Like, pos2: Vector3Like) => number;
}

export class AIMovementController {
  /**
   * Adjust target position to maintain spacing from teammates
   */
  adjustPositionForSpacing(
    targetPos: Vector3Like,
    context: MovementContext
  ): Vector3Like {
    const teammates = context.getVisibleTeammates();
    let adjustedX = targetPos.x;
    let adjustedZ = targetPos.z;

    // Apply repulsion from nearby teammates
    for (const teammate of teammates) {
      if (teammate.position === context.position) continue;

      const dx = context.position.x - teammate.position.x;
      const dz = context.position.z - teammate.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < TEAMMATE_REPULSION_DISTANCE && distance > 0.1) {
        const repulsionStrength =
          TEAMMATE_REPULSION_STRENGTH * (1 - distance / TEAMMATE_REPULSION_DISTANCE);
        adjustedX += (dx / distance) * repulsionStrength;
        adjustedZ += (dz / distance) * repulsionStrength;
      }
    }

    return {
      x: adjustedX,
      y: targetPos.y,
      z: adjustedZ,
    };
  }

  /**
   * Check if position is within role's preferred area
   */
  isPositionInPreferredArea(position: Vector3Like, role: SoccerAIRole): boolean {
    const roleDef = ROLE_DEFINITIONS[role];
    const area = roleDef.preferredArea;

    return (
      position.x >= area.minX &&
      position.x <= area.maxX &&
      position.z >= area.minZ &&
      position.z <= area.maxZ
    );
  }

  /**
   * Constrain position to role's preferred area
   */
  constrainToPreferredArea(
    position: Vector3Like,
    role: SoccerAIRole
  ): Vector3Like {
    const roleDef = ROLE_DEFINITIONS[role];
    const area = roleDef.preferredArea;

    return {
      x: Math.max(area.minX, Math.min(area.maxX, position.x)),
      y: position.y,
      z: Math.max(area.minZ, Math.min(area.maxZ, position.z)),
    };
  }

  /**
   * Ensure target point is within field bounds
   */
  ensureTargetInBounds(targetPoint: Vector3Like): Vector3Like {
    const margin = 2;

    return {
      x: Math.max(FIELD_MIN_X + margin, Math.min(FIELD_MAX_X - margin, targetPoint.x)),
      y: targetPoint.y,
      z: Math.max(FIELD_MIN_Z + margin, Math.min(FIELD_MAX_Z - margin, targetPoint.z)),
    };
  }

  /**
   * Update rotation to face movement direction
   */
  updateRotationToMovement(
    context: MovementContext,
    normalizedDirectionX: number,
    normalizedDirectionZ: number,
    currentTime: number
  ): void {
    if (context.hasRotationBeenSetThisTick) return;

    const MIN_ROTATION_INTERVAL = 100;
    if (
      context._lastRotationUpdateTime !== null &&
      currentTime - context._lastRotationUpdateTime < MIN_ROTATION_INTERVAL
    ) {
      return;
    }

    const targetYaw = Math.atan2(normalizedDirectionX, normalizedDirectionZ);

    context.setRotation({
      x: 0,
      y: targetYaw,
      z: 0,
    });

    context._lastRotationUpdateTime = currentTime;
    context.hasRotationBeenSetThisTick = true;
  }

  /**
   * Apply movement impulse based on desired velocity
   */
  applyMovementImpulse(
    context: MovementContext,
    desiredVelocityX: number,
    desiredVelocityZ: number,
    maxSpeed: number,
    mass: number
  ): void {
    const currentVelocityX = context.linearVelocity?.x || 0;
    const currentVelocityZ = context.linearVelocity?.z || 0;

    // Calculate velocity difference
    const velocityDiffX = desiredVelocityX - currentVelocityX;
    const velocityDiffZ = desiredVelocityZ - currentVelocityZ;

    // Apply impulse
    const impulseStrength = 0.15;
    const impulseX = velocityDiffX * mass * impulseStrength;
    const impulseZ = velocityDiffZ * mass * impulseStrength;

    context.applyImpulse({
      x: impulseX,
      y: 0,
      z: impulseZ,
    });
  }

  /**
   * Limit maximum velocity to prevent excessive speed
   */
  limitMaximumVelocity(context: MovementContext, maxVelocity: number): void {
    if (!context.linearVelocity) return;

    const currentSpeed = Math.sqrt(
      context.linearVelocity.x * context.linearVelocity.x +
        context.linearVelocity.z * context.linearVelocity.z
    );

    if (currentSpeed > maxVelocity) {
      const scale = maxVelocity / currentSpeed;
      context.setLinearVelocity({
        x: context.linearVelocity.x * scale,
        y: context.linearVelocity.y,
        z: context.linearVelocity.z * scale,
      });
    }
  }

  /**
   * Update physics movement towards target position
   */
  updatePhysicsMovement(
    context: MovementContext,
    targetPosition: Vector3Like,
    currentPosition: Vector3Like,
    speed: number
  ): void {
    const dx = targetPosition.x - currentPosition.x;
    const dz = targetPosition.z - currentPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 0.5) {
      // Close enough - stop movement
      context.setLinearVelocity({
        x: 0,
        y: context.linearVelocity?.y || 0,
        z: 0,
      });
      return;
    }

    // Normalize direction
    const normalizedDirectionX = dx / distance;
    const normalizedDirectionZ = dz / distance;

    // Calculate desired velocity
    const desiredVelocityX = normalizedDirectionX * speed;
    const desiredVelocityZ = normalizedDirectionZ * speed;

    // Apply movement
    this.applyMovementImpulse(
      context,
      desiredVelocityX,
      desiredVelocityZ,
      speed,
      context._mass
    );

    // Limit maximum velocity
    this.limitMaximumVelocity(context, speed * 1.2);

    // Update rotation
    this.updateRotationToMovement(
      context,
      normalizedDirectionX,
      normalizedDirectionZ,
      Date.now()
    );
  }
}
