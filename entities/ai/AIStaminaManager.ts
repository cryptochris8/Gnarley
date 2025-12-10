/**
 * AIStaminaManager - Stamina conservation and management
 *
 * Handles stamina-based decision making for AI players including:
 * - Determining when to conserve stamina based on role
 * - Conservative play patterns when stamina is low
 * - Stamina recovery positioning
 *
 * Extracted from AIPlayerEntity.ts to improve modularity.
 */

import type { Vector3Like } from "hytopia";
import { SoccerAIRole, ROLE_DEFINITIONS } from "./AIRoleDefinitions";
import { logger } from "../../utils/GameLogger";

/**
 * Interface for AI player context needed by stamina manager
 */
export interface AIPlayerContext {
  aiRole: SoccerAIRole;
  position: Vector3Like;
  username: string;

  // Methods the stamina manager needs to call
  passBall: () => boolean;
  distanceBetween: (pos1: Vector3Like, pos2: Vector3Like) => number;
  isClosestTeammateToPosition: (position: Vector3Like) => boolean;
  getRoleBasedPosition: () => Vector3Like;
}

export class AIStaminaManager {
  /**
   * Determine if AI should conserve stamina based on role and current percentage
   *
   * @param staminaPercentage - Current stamina as a percentage (0-100)
   * @param aiRole - The AI player's role
   * @returns true if stamina conservation mode should be activated
   */
  shouldConserveStamina(staminaPercentage: number, aiRole: SoccerAIRole): boolean {
    // Different stamina thresholds based on role
    let conservationThreshold = 30; // Default threshold

    switch (aiRole) {
      case "goalkeeper":
        conservationThreshold = 20; // Goalkeepers conserve less aggressively
        break;
      case "striker":
        conservationThreshold = 40; // Strikers need to conserve more to be effective
        break;
      case "central-midfielder-1":
      case "central-midfielder-2":
        conservationThreshold = 35; // Midfielders balance defense and attack
        break;
      case "left-back":
      case "right-back":
        conservationThreshold = 25; // Defenders can be more aggressive with stamina
        break;
    }

    // More aggressive conservation as the game progresses
    // In the second half, players should be more conservative with their stamina
    // For now, we'll use a consistent threshold regardless of game phase

    return staminaPercentage < conservationThreshold;
  }

  /**
   * Calculate target position when conserving stamina
   *
   * Handles AI behavior when stamina is low, prioritizing recovery and conservative play
   *
   * @param context - AI player context
   * @param ballPosition - Current ball position
   * @param hasBall - Whether this AI has the ball
   * @param staminaPercentage - Current stamina percentage (0-100)
   * @returns Target position for conservative play
   */
  handleStaminaConservation(
    context: AIPlayerContext,
    ballPosition: Vector3Like,
    hasBall: boolean,
    staminaPercentage: number
  ): Vector3Like {
    // Log conservation behavior occasionally
    if (Math.random() < 0.02) {
      // 2% chance to log
      logger.debug(
        `=¨ STAMINA CONSERVATION: ${context.username} (${context.aiRole}) conserving stamina (${staminaPercentage.toFixed(0)}%)`
      );
    }

    if (hasBall) {
      // If we have the ball and low stamina, prioritize quick pass over dribbling
      const passSuccess = context.passBall();
      if (passSuccess) {
        logger.debug(
          `¡ STAMINA CONSERVATION: ${context.username} made quick pass to preserve stamina`
        );
      }

      // Hold position (either after pass or if pass failed)
      return {
        x: context.position.x,
        y: context.position.y,
        z: context.position.z,
      };
    }

    // When we don't have the ball, prioritize positioning over aggressive pursuit
    const roleDef = ROLE_DEFINITIONS[context.aiRole];
    const distanceToBall = context.distanceBetween(context.position, ballPosition);

    // Reduce effective pursuit based on stamina levels
    const staminaFactor = Math.max(0.3, staminaPercentage / 100); // Never go below 30% pursuit
    const adjustedPursuitTendency = roleDef.pursuitTendency * staminaFactor;

    // Only pursue if we're very close to the ball or if we're the designated role
    const shouldPursue = distanceToBall < 8 && Math.random() < adjustedPursuitTendency;

    if (shouldPursue && context.isClosestTeammateToPosition(ballPosition)) {
      // Pursue the ball but with reduced intensity
      return {
        x: ballPosition.x,
        y: ballPosition.y,
        z: ballPosition.z,
      };
    } else {
      // Move to a conservative position that allows stamina recovery
      const formationPosition = context.getRoleBasedPosition();

      // Move towards formation position but prioritize standing still for stamina recovery
      const distanceToFormation = context.distanceBetween(context.position, formationPosition);

      if (distanceToFormation < 3) {
        // If close to formation position, hold position for stamina recovery
        return {
          x: context.position.x,
          y: context.position.y,
          z: context.position.z,
        };
      } else {
        // Move slowly towards formation position
        const direction = {
          x: formationPosition.x - context.position.x,
          z: formationPosition.z - context.position.z,
        };
        const distance = Math.sqrt(direction.x * direction.x + direction.z * direction.z);

        if (distance > 0.1) {
          const moveDistance = Math.min(2, distance); // Move only 2 units at a time
          return {
            x: context.position.x + (direction.x / distance) * moveDistance,
            y: context.position.y,
            z: context.position.z + (direction.z / distance) * moveDistance,
          };
        } else {
          return {
            x: context.position.x,
            y: context.position.y,
            z: context.position.z,
          };
        }
      }
    }
  }

  /**
   * Get stamina conservation threshold for a specific role
   *
   * @param aiRole - The AI player's role
   * @returns Stamina percentage threshold for conservation
   */
  getConservationThreshold(aiRole: SoccerAIRole): number {
    switch (aiRole) {
      case "goalkeeper":
        return 20;
      case "striker":
        return 40;
      case "central-midfielder-1":
      case "central-midfielder-2":
        return 35;
      case "left-back":
      case "right-back":
        return 25;
      default:
        return 30;
    }
  }
}
