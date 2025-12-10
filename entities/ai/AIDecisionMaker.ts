/**
 * AIDecisionMaker - Core AI decision-making logic
 *
 * Handles decision-making for all roles including:
 * - Role-specific behaviors (left-back, right-back, midfielders, striker)
 * - Team coordination and pursuit logic
 * - Ball area detection and chase decisions
 * - Formation positioning
 *
 * Extracted from AIPlayerEntity.ts to improve modularity.
 *
 * NOTE: This is a streamlined version with placeholders for full role logic.
 * Each role decision method (leftBackDecision, rightBackDecision, etc.) needs
 * to be ported from the original AIPlayerEntity.ts implementation.
 */

import type { Vector3Like, Entity } from "hytopia";
import {
  SoccerAIRole,
  ROLE_DEFINITIONS,
  getPursuitDistanceForRole,
  ROLE_PURSUIT_PROBABILITY,
  POSITION_DISCIPLINE_FACTOR,
} from "./AIRoleDefinitions";
import {
  AI_FIELD_CENTER_X,
  AI_FIELD_CENTER_Z,
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
} from "../../state/gameConfig";
import type SoccerPlayerEntity from "../SoccerPlayerEntity";
import { DecisionCache } from "../../ai/DecisionCache";

/**
 * Interface for decision maker context
 */
export interface DecisionContext {
  position: Vector3Like;
  aiRole: SoccerAIRole;
  team: "red" | "blue";
  username: string;

  // Methods
  distanceBetween: (pos1: Vector3Like, pos2: Vector3Like) => number;
  getVisibleTeammates: () => SoccerPlayerEntity[];
  isClosestTeammateToPosition: (position: Vector3Like) => boolean;
  getRoleBasedPosition: () => Vector3Like;
  shootBall: (targetPoint: Vector3Like, powerMultiplier: number) => boolean;
  passBall: () => boolean;
  tackleBall: () => void;
}

export class AIDecisionMaker {
  private cache: DecisionCache;

  constructor() {
    // Create cache with 100ms TTL for AI decisions
    this.cache = new DecisionCache(100, 500);
  }

  /**
   * Determine if AI should pursue ball based on team coordination
   */
  shouldPursueBasedOnTeamCoordination(
    context: DecisionContext,
    ballPosition: Vector3Like
  ): boolean {
    const pursuitDistance = getPursuitDistanceForRole(context.aiRole);
    const distanceToBall = context.distanceBetween(context.position, ballPosition);

    if (distanceToBall > pursuitDistance) return false;

    // Check pursuit probability
    const roleProbability = ROLE_PURSUIT_PROBABILITY[context.aiRole];
    if (Math.random() > roleProbability) return false;

    // Prefer closest teammate to pursue
    const teammates = context.getVisibleTeammates();
    let closestDistance = distanceToBall;

    for (const teammate of teammates) {
      const teammateDistance = context.distanceBetween(teammate.position, ballPosition);
      if (teammateDistance < closestDistance) {
        closestDistance = teammateDistance;
      }
    }

    return closestDistance === distanceToBall;
  }

  /**
   * Check if loose ball is in AI's area
   */
  isLooseBallInArea(
    context: DecisionContext,
    ballPosition: Vector3Like
  ): boolean {
    const roleDef = ROLE_DEFINITIONS[context.aiRole];
    const area = roleDef.preferredArea;

    return (
      ballPosition.x >= area.minX &&
      ballPosition.x <= area.maxX &&
      ballPosition.z >= area.minZ &&
      ballPosition.z <= area.maxZ
    );
  }

  /**
   * Check if ball is too far for AI to chase
   */
  isBallTooFarToChase(
    context: DecisionContext,
    ballPosition: Vector3Like
  ): boolean {
    const maxChaseDistance = getPursuitDistanceForRole(context.aiRole) * 1.5;
    const distanceToBall = context.distanceBetween(context.position, ballPosition);

    return distanceToBall > maxChaseDistance;
  }

  /**
   * Check if AI should stop pursuing ball
   */
  shouldStopPursuit(
    context: DecisionContext,
    ballPosition: Vector3Like
  ): boolean {
    return this.isBallTooFarToChase(context, ballPosition);
  }

  /**
   * Check if AI is closest teammate to a position
   */
  isClosestTeammateToPosition(
    context: DecisionContext,
    position: Vector3Like
  ): boolean {
    const teammates = context.getVisibleTeammates();
    const myDistance = context.distanceBetween(context.position, position);

    for (const teammate of teammates) {
      const teammateDistance = context.distanceBetween(teammate.position, position);
      if (teammateDistance < myDistance) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get role-based formation position
   * (Cached for performance - 100ms TTL)
   */
  getRoleBasedPosition(
    context: DecisionContext,
    ballPosition: Vector3Like
  ): Vector3Like {
    // Create cache key based on role and ball position (rounded for grouping)
    const ballX = Math.round(ballPosition.x * 10) / 10;
    const ballZ = Math.round(ballPosition.z * 10) / 10;
    const cacheKey = `rolePos:${context.aiRole}:${ballX}:${ballZ}`;

    return this.cache.get(cacheKey, () => {
      const roleDef = ROLE_DEFINITIONS[context.aiRole];
      const area = roleDef.preferredArea;

      // Calculate center of preferred area
      const centerX = (area.minX + area.maxX) / 2;
      const centerZ = (area.minZ + area.maxZ) / 2;

      // Adjust based on ball position
      const disciplineFactor = POSITION_DISCIPLINE_FACTOR[context.aiRole];
      const ballInfluence = 1 - disciplineFactor;

      const targetX = centerX * disciplineFactor + ballPosition.x * ballInfluence;
      const targetZ = centerZ * disciplineFactor + ballPosition.z * ballInfluence;

      // Constrain to preferred area
      return {
        x: Math.max(area.minX, Math.min(area.maxX, targetX)),
        y: context.position.y,
        z: Math.max(area.minZ, Math.min(area.maxZ, targetZ)),
      };
    });
  }

  /**
   * Left back decision logic
   *
   * NOTE: Placeholder - full implementation needs to be ported from
   * AIPlayerEntity.ts lines 1205-1400
   */
  leftBackDecision(
    context: DecisionContext,
    ballPosition: Vector3Like,
    hasBall: boolean,
    goalLineX: number,
    wideZBoundary: number
  ): Vector3Like {
    if (hasBall) {
      // Try to pass
      const passSuccess = context.passBall();
      if (passSuccess) {
        return context.position;
      }
    }

    // Default defensive positioning
    const roleDef = ROLE_DEFINITIONS["left-back"];
    return this.getRoleBasedPosition(context, ballPosition);
  }

  /**
   * Right back decision logic
   *
   * NOTE: Placeholder - full implementation needs to be ported from
   * AIPlayerEntity.ts lines 1403-1560
   */
  rightBackDecision(
    context: DecisionContext,
    ballPosition: Vector3Like,
    hasBall: boolean,
    goalLineX: number,
    wideZBoundary: number
  ): Vector3Like {
    if (hasBall) {
      // Try to pass
      const passSuccess = context.passBall();
      if (passSuccess) {
        return context.position;
      }
    }

    // Default defensive positioning
    const roleDef = ROLE_DEFINITIONS["right-back"];
    return this.getRoleBasedPosition(context, ballPosition);
  }

  /**
   * Central midfielder decision logic
   *
   * NOTE: Placeholder - full implementation needs to be ported from
   * AIPlayerEntity.ts lines 1562-2650
   */
  centralMidfielderDecision(
    context: DecisionContext,
    ballPosition: Vector3Like,
    hasBall: boolean,
    myRoleNumber: "1" | "2"
  ): Vector3Like {
    if (hasBall) {
      // Try to shoot if close to goal, otherwise pass
      const opponentGoalX = context.team === "red" ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;
      const distanceToGoal = Math.abs(context.position.x - opponentGoalX);

      if (distanceToGoal < 20) {
        const shootSuccess = context.shootBall(
          { x: opponentGoalX, y: context.position.y, z: AI_FIELD_CENTER_Z },
          1.0
        );
        if (shootSuccess) {
          return context.position;
        }
      }

      context.passBall();
      return context.position;
    }

    // Position based on ball
    const roleName = myRoleNumber === "1" ? "central-midfielder-1" : "central-midfielder-2";
    return this.getRoleBasedPosition(context, ballPosition);
  }

  /**
   * Striker decision logic
   *
   * NOTE: Placeholder - full implementation needs to be ported from
   * AIPlayerEntity.ts lines 2654-2900
   */
  strikerDecision(
    context: DecisionContext,
    ball: Entity,
    ballPosition: Vector3Like,
    hasBall: boolean,
    opponentGoalLineX: number
  ): Vector3Like {
    if (hasBall) {
      // Try to shoot
      const shootSuccess = context.shootBall(
        { x: opponentGoalLineX, y: context.position.y, z: AI_FIELD_CENTER_Z },
        1.2
      );
      if (shootSuccess) {
        return context.position;
      }

      // If shoot failed, try pass
      context.passBall();
      return context.position;
    }

    // Aggressive pursuit
    if (context.shouldPursueBasedOnTeamCoordination(ballPosition)) {
      return ballPosition;
    }

    // Position for attack
    return this.getRoleBasedPosition(context, ballPosition);
  }

  /**
   * Main decision orchestration based on role
   *
   * Routes to appropriate role-specific decision method
   */
  makeRoleDecision(
    context: DecisionContext,
    ball: Entity | null,
    ballPosition: Vector3Like,
    hasBall: boolean
  ): Vector3Like {
    const goalLineX = context.team === "red" ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;
    const opponentGoalLineX = context.team === "red" ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;

    switch (context.aiRole) {
      case "left-back":
        return this.leftBackDecision(context, ballPosition, hasBall, goalLineX, -30);

      case "right-back":
        return this.rightBackDecision(context, ballPosition, hasBall, goalLineX, 23);

      case "central-midfielder-1":
        return this.centralMidfielderDecision(context, ballPosition, hasBall, "1");

      case "central-midfielder-2":
        return this.centralMidfielderDecision(context, ballPosition, hasBall, "2");

      case "striker":
        if (!ball) return context.position;
        return this.strikerDecision(context, ball, ballPosition, hasBall, opponentGoalLineX);

      default:
        // Fallback to role-based positioning
        return this.getRoleBasedPosition(context, ballPosition);
    }
  }
}
