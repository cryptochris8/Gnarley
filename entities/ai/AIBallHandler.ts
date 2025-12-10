/**
 * AIBallHandler - Ball interaction logic for AI players
 *
 * Handles all ball-related actions including:
 * - Shooting (distance-based force and arc calculation)
 * - Passing (teammate selection, velocity prediction, safety checks)
 * - Tackling (ball pursuit and contact)
 * - Forced ball release (possession time limits)
 *
 * Extracted from AIPlayerEntity.ts to improve modularity.
 */

import type { Vector3Like, Entity, PlayerEntity } from "hytopia";
import { SoccerAIRole, SHOT_FORCE, SHOT_ARC_FACTOR, PASS_FORCE, PASS_ARC_FACTOR } from "./AIRoleDefinitions";
import {
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_FIELD_CENTER_X,
  AI_FIELD_CENTER_Z,
  FIELD_MIN_X,
  FIELD_MAX_X,
  FIELD_MIN_Z,
  FIELD_MAX_Z,
} from "../../state/gameConfig";
import type SoccerPlayerEntity from "../SoccerPlayerEntity";
import type { AIPlayerEntity } from "../AIPlayerEntity";

/**
 * Interface for ball handler context
 */
export interface BallHandlerContext {
  team: "red" | "blue";
  position: Vector3Like;
  aiRole: SoccerAIRole;
  username: string;
  isTackling: boolean;
  ballPossessionStartTime: number | null;
  GOALKEEPER_MAX_POSSESSION_TIME: number;
  DEFENDER_MAX_POSSESSION_TIME: number;
  MIDFIELDER_MAX_POSSESSION_TIME: number;
  STRIKER_MAX_POSSESSION_TIME: number;

  // Methods
  distanceBetween: (pos1: Vector3Like, pos2: Vector3Like) => number;
  getVisibleTeammates: () => SoccerPlayerEntity[];
  isPassDirectionSafe: (fromPosition: Vector3Like, direction: Vector3Like, distance: number) => boolean;
  startModelOneshotAnimations: (animations: string[]) => void;
  ensureTargetInBounds: (targetPoint: Vector3Like) => Vector3Like;
}

export class AIBallHandler {
  /**
   * Shoot the ball towards a target with distance-based physics
   *
   * @param context - Ball handler context
   * @param ball - The soccer ball entity
   * @param targetPoint - Where to shoot
   * @param powerMultiplier - Shot power multiplier (default 1.0)
   * @param attachedPlayer - Current player with ball possession
   * @param setAttachedPlayer - Function to set/clear ball possession
   * @returns true if shot was executed, false otherwise
   */
  shootBall(
    context: BallHandlerContext,
    ball: Entity,
    targetPoint: Vector3Like,
    powerMultiplier: number,
    attachedPlayer: any,
    setAttachedPlayer: (player: any) => void
  ): boolean {
    if (!ball || attachedPlayer !== context) return false;

    // Calculate direction towards target
    const dx = targetPoint.x - context.position.x;
    const dz = targetPoint.z - context.position.z;
    const distanceHorizontal = Math.sqrt(dx * dx + dz * dz);

    // Distance-based force scaling (realistic soccer physics)
    let distanceScaledForce = SHOT_FORCE;
    if (distanceHorizontal < 10) {
      distanceScaledForce = SHOT_FORCE * 1.2; // Close range: fast & powerful
      console.log(`<¯ Close-range shot (${distanceHorizontal.toFixed(1)}m) - Fast & low`);
    } else if (distanceHorizontal > 20) {
      distanceScaledForce = SHOT_FORCE * 0.7; // Long range: slower with arc
      console.log(`=€ Long-range shot (${distanceHorizontal.toFixed(1)}m) - Slow & arc`);
    } else {
      console.log(`½ Medium-range shot (${distanceHorizontal.toFixed(1)}m) - Balanced`);
    }

    // Distance-based arc scaling
    const arcMultiplier = Math.min(distanceHorizontal / 15, 2.0);
    const baseArc = distanceHorizontal * SHOT_ARC_FACTOR * arcMultiplier;
    const distanceBonus = Math.min(distanceHorizontal / 25, 1.2) * 1.2;
    const calculatedY = baseArc + distanceBonus;

    const direction = {
      x: dx,
      y: calculatedY,
      z: dz,
    };

    const length = Math.sqrt(
      direction.x * direction.x + direction.y * direction.y + direction.z * direction.z
    );
    if (length === 0) return false;

    // Normalize direction
    direction.x /= length;
    direction.y /= length;
    direction.z /= length;

    setAttachedPlayer(null);

    // Apply power multiplier with safety cap
    const effectiveShotForce = Math.min(distanceScaledForce * powerMultiplier, 10);

    // Control vertical component
    const verticalComponent = direction.y * effectiveShotForce;
    const maxVerticalForce = 6.5;
    const finalVerticalForce = Math.min(verticalComponent, maxVerticalForce);

    // Apply impulse
    ball.applyImpulse({
      x: direction.x * effectiveShotForce,
      y: finalVerticalForce,
      z: direction.z * effectiveShotForce,
    });

    // Reset angular velocity to prevent spin
    ball.setAngularVelocity({ x: 0, y: 0, z: 0 });

    // Continue resetting for 500ms
    let resetCount = 0;
    const maxResets = 10;
    const resetInterval = setInterval(() => {
      if (resetCount >= maxResets || !ball.isSpawned) {
        clearInterval(resetInterval);
        return;
      }
      ball.setAngularVelocity({ x: 0, y: 0, z: 0 });
      resetCount++;
    }, 50);

    context.startModelOneshotAnimations(["kick"]);
    return true;
  }

  /**
   * Pass the ball to the best available teammate
   *
   * @param context - Ball handler context
   * @param ball - The soccer ball entity
   * @param attachedPlayer - Current player with ball possession
   * @param sharedState - Game shared state for team access
   * @param forcePassFn - Function to execute the pass
   * @returns true if pass was attempted, false otherwise
   */
  passBall(
    context: BallHandlerContext,
    ball: Entity,
    attachedPlayer: any,
    sharedState: any,
    forcePassFn: (
      targetPlayer: PlayerEntity | null,
      targetPosition: Vector3Like,
      powerMultiplier: number
    ) => boolean
  ): boolean {
    if (!ball || attachedPlayer !== context) return false;

    const teammates = context.getVisibleTeammates();
    let bestTargetPlayer: PlayerEntity | null = null;
    let passTargetPosition: Vector3Like = { x: 0, y: 0, z: 0 };
    let bestScore = -Infinity;

    const opponentGoalX = context.team === "red" ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;

    // Evaluate each teammate as a pass target
    for (const teammate of teammates) {
      if (teammate === context) continue;

      const distanceToTeammate = context.distanceBetween(context.position, teammate.position);
      if (distanceToTeammate > 30) continue;

      // Calculate how open the teammate is
      let spaceScore = 10;
      const opponents =
        context.team === "red" ? sharedState.getBlueAITeam() : sharedState.getRedAITeam();
      for (const opponent of opponents) {
        if (!opponent.isSpawned) continue;
        const distanceToOpponent = context.distanceBetween(teammate.position, opponent.position);
        if (distanceToOpponent < 5) spaceScore -= 4;
        else if (distanceToOpponent < 10) spaceScore -= 2;
      }

      // Safety check: verify pass direction is safe
      const passDirection = {
        x: teammate.position.x - context.position.x,
        y: 0,
        z: teammate.position.z - context.position.z,
      };
      const passLength = Math.sqrt(passDirection.x * passDirection.x + passDirection.z * passDirection.z);
      if (passLength > 0) {
        passDirection.x /= passLength;
        passDirection.z /= passLength;

        if (!context.isPassDirectionSafe(context.position, passDirection, distanceToTeammate)) {
          console.log(
            `${context.aiRole} ${context.username} skipping unsafe pass to ${teammate.player.username}`
          );
          continue;
        }
      }

      // Calculate forward progression bonus
      const isForward =
        (context.team === "red" && teammate.position.x > context.position.x) ||
        (context.team === "blue" && teammate.position.x < context.position.x);
      const forwardPositionBonus = isForward ? 5 : 0;

      // Goal proximity bonus
      const teammateDistanceToGoal = Math.abs(teammate.position.x - opponentGoalX);
      const goalProximityBonus = 20 - Math.min(20, teammateDistanceToGoal / 2);

      // Role-based bonuses
      let roleBonus = 0;

      // Human player priority
      if (!(teammate instanceof (AIPlayerEntity as any))) {
        roleBonus = 50;
        console.log(
          `${context.aiRole} ${context.username} prioritizing human player ${teammate.player.username}`
        );
      } else {
        const aiTeammate = teammate as any;
        switch (aiTeammate.aiRole) {
          case "striker":
            roleBonus = 10;
            break;
          case "central-midfielder-1":
          case "central-midfielder-2":
            roleBonus = 5;
            break;
          case "left-back":
          case "right-back":
            roleBonus = isForward ? 3 : 0;
            break;
          case "goalkeeper":
            roleBonus = -15;
            break;
        }
      }

      // Final score calculation
      const score =
        30 -
        Math.min(30, distanceToTeammate) +
        spaceScore * 2 +
        forwardPositionBonus +
        goalProximityBonus +
        roleBonus +
        Math.random() * 2;

      if (score > bestScore) {
        bestScore = score;
        bestTargetPlayer = teammate;
      }
    }

    // Determine target position
    if (bestTargetPlayer) {
      const passDirectionX = bestTargetPlayer.position.x - context.position.x;
      const passDirectionZ = bestTargetPlayer.position.z - context.position.z;
      const passDist = Math.sqrt(passDirectionX * passDirectionX + passDirectionZ * passDirectionZ);

      if (passDist > 0) {
        const normDx = passDirectionX / passDist;
        const normDz = passDirectionZ / passDist;

        // Velocity-aware pass leading
        let teammateVelocity = { x: 0, z: 0 };
        if (bestTargetPlayer instanceof (SoccerPlayerEntity as any) && (bestTargetPlayer as any).linearVelocity) {
          teammateVelocity = {
            x: (bestTargetPlayer as any).linearVelocity.x,
            z: (bestTargetPlayer as any).linearVelocity.z,
          };
        }

        const passSpeed = 2.8;
        const passTravelTime = passDist / passSpeed;
        const predictedX = bestTargetPlayer.position.x + teammateVelocity.x * passTravelTime;
        const predictedZ = bestTargetPlayer.position.z + teammateVelocity.z * passTravelTime;

        // Safety margin
        let safetyMargin = 0.8;
        if (passDist < 10) safetyMargin = 0.5;
        else if (passDist > 20) safetyMargin = 1.2;

        passTargetPosition = {
          x: predictedX + normDx * safetyMargin,
          y: bestTargetPlayer.position.y,
          z: predictedZ + normDz * safetyMargin,
        };
      } else {
        passTargetPosition = bestTargetPlayer.position;
      }

      console.log(
        `${context.aiRole} ${context.username} passing to ${bestTargetPlayer.player.username} with score ${bestScore.toFixed(1)}`
      );
    } else {
      // No suitable teammate - make general forward pass
      console.log(`${context.aiRole} ${context.username} - no teammate target, forward pass`);

      const forwardDirection = context.team === "red" ? 1 : -1;
      const currentX = context.position.x;
      const fieldCenter = (AI_GOAL_LINE_X_RED + AI_GOAL_LINE_X_BLUE) / 2;

      let passDistance = 12;
      if (
        (context.team === "red" && currentX < fieldCenter) ||
        (context.team === "blue" && currentX > fieldCenter)
      ) {
        passDistance = 18;
      }

      passTargetPosition = {
        x: context.position.x + forwardDirection * passDistance,
        y: context.position.y,
        z: context.position.z + (Math.random() * 10 - 5),
      };
    }

    // Calculate power multiplier
    const distanceToTarget = context.distanceBetween(context.position, passTargetPosition);
    let powerMultiplier = Math.min(0.8, 0.4 + distanceToTarget / 50);

    // Reduce power for edge targets
    const fieldCenterX = (AI_GOAL_LINE_X_RED + AI_GOAL_LINE_X_BLUE) / 2;
    const fieldCenterZ = AI_FIELD_CENTER_Z;
    const distanceFromCenterX = Math.abs(passTargetPosition.x - fieldCenterX);
    const distanceFromCenterZ = Math.abs(passTargetPosition.z - fieldCenterZ);
    const fieldWidthX = Math.abs(FIELD_MAX_X - FIELD_MIN_X);
    const fieldWidthZ = Math.abs(FIELD_MAX_Z - FIELD_MIN_Z);

    if (distanceFromCenterX > fieldWidthX * 0.35 || distanceFromCenterZ > fieldWidthZ * 0.35) {
      powerMultiplier *= 0.7;
      console.log(`${context.aiRole} ${context.username} reducing pass power for edge target`);
    }

    // Execute the pass
    return forcePassFn(bestTargetPlayer, passTargetPosition, powerMultiplier);
  }

  /**
   * Get maximum possession time for a role
   */
  getMaxPossessionTime(aiRole: SoccerAIRole, context: BallHandlerContext): number {
    switch (aiRole) {
      case "goalkeeper":
        return context.GOALKEEPER_MAX_POSSESSION_TIME;
      case "left-back":
      case "right-back":
        return context.DEFENDER_MAX_POSSESSION_TIME;
      case "central-midfielder-1":
      case "central-midfielder-2":
        return context.MIDFIELDER_MAX_POSSESSION_TIME;
      case "striker":
        return context.STRIKER_MAX_POSSESSION_TIME;
      default:
        return 5000;
    }
  }
}
