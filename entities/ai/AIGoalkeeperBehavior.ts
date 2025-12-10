/**
 * AIGoalkeeperBehavior - Goalkeeper-specific AI logic
 *
 * Handles all goalkeeper decision-making including:
 * - Predictive positioning and shot anticipation
 * - Shot response and ball interception
 * - Ball distribution and clearing
 * - Penalty area management
 *
 * Extracted from AIPlayerEntity.ts to improve modularity.
 */

import type { Vector3Like, Entity } from "hytopia";
import { SoccerAIRole, ROLE_DEFINITIONS } from "./AIRoleDefinitions";
import {
  AI_FIELD_CENTER_X,
  AI_FIELD_CENTER_Z,
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  FIELD_MIN_X,
  FIELD_MAX_X,
  FIELD_MIN_Z,
  FIELD_MAX_Z,
} from "../../state/gameConfig";
import SoccerPlayerEntity from "../SoccerPlayerEntity";

/**
 * Interface for goalkeeper context needed by this behavior module
 */
export interface GoalkeeperContext {
  team: "red" | "blue";
  position: Vector3Like;
  linearVelocity: Vector3Like | undefined;
  isSpawned: boolean;
  username: string;
  ballPossessionStartTime: number | null;
  GOALKEEPER_MAX_POSSESSION_TIME: number;
  aiRole: SoccerAIRole;

  // Methods
  distanceBetween: (pos1: Vector3Like, pos2: Vector3Like) => number;
  setLinearVelocity: (velocity: Vector3Like) => void;
  startModelOneshotAnimations: (animations: string[]) => void;
  stopModelAnimations: (animations: string[]) => void;
  isClosestTeammateToPosition: (position: Vector3Like) => boolean;
  getVisibleTeammates: () => SoccerPlayerEntity[];
  forcePass: (targetPlayer: SoccerPlayerEntity | null, passToPoint: Vector3Like, powerMultiplier: number) => boolean;
  ensureTargetInBounds: (targetPoint: Vector3Like) => Vector3Like;
  shouldStopPursuit: (ballPosition: Vector3Like) => boolean;
  isBallTooFarToChase: (ballPosition: Vector3Like) => boolean;
  constrainToPreferredArea: (position: Vector3Like, role: SoccerAIRole) => Vector3Like;
  adjustPositionForSpacing: (targetPos: Vector3Like) => Vector3Like;
  getRoleBasedPosition: () => Vector3Like;
}

export class AIGoalkeeperBehavior {
  /**
   * Calculate predictive goalkeeper positioning based on ball trajectory
   */
  calculatePredictivePosition(
    ballPosition: Vector3Like,
    ballVelocity: Vector3Like,
    team: "red" | "blue",
    currentPosition: Vector3Like
  ): Vector3Like {
    // Predict where ball will be in 0.5 seconds
    const predictionTime = 0.5;
    const predictedBallPos = {
      x: ballPosition.x + ballVelocity.x * predictionTime,
      y: ballPosition.y + ballVelocity.y * predictionTime,
      z: ballPosition.z + ballVelocity.z * predictionTime,
    };

    // Calculate goal center position
    const goalCenterX = team === "red" ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;
    const goalCenterZ = AI_FIELD_CENTER_Z;

    // Position to cut off the angle between predicted ball position and goal center
    const direction = team === "red" ? 1 : -1;
    const interceptX = goalCenterX + 3 * direction; // Stay 3 units in front of goal line

    // Calculate Z position to cut off shooting angle
    const ballToGoalZ = goalCenterZ - predictedBallPos.z;
    const optimalZ = goalCenterZ + ballToGoalZ * 0.4; // Position 40% toward ball's Z

    // Clamp Z position to stay within goal area
    const maxGoalWidth = 8;
    const clampedZ = Math.max(
      goalCenterZ - maxGoalWidth,
      Math.min(goalCenterZ + maxGoalWidth, optimalZ)
    );

    return { x: interceptX, y: currentPosition.y, z: clampedZ };
  }

  /**
   * Check if ball is heading towards goal based on velocity
   */
  isBallHeadingTowardsGoal(
    ballPosition: Vector3Like,
    ballVelocity: Vector3Like,
    team: "red" | "blue"
  ): boolean {
    const goalCenterZ = AI_FIELD_CENTER_Z;

    // Enhanced shot detection with lower thresholds
    const isMovingTowardsGoalX =
      team === "red" ? ballVelocity.x < -1.0 : ballVelocity.x > 1.0;

    // Predictive positioning - check where ball will be in 0.3 seconds
    const predictionTime = 0.3;
    const predictedZ = ballPosition.z + ballVelocity.z * predictionTime;

    // Expanded goal range for better coverage
    const goalZMin = goalCenterZ - 12;
    const goalZMax = goalCenterZ + 12;
    const isInGoalZRange = predictedZ >= goalZMin && predictedZ <= goalZMax;

    return isMovingTowardsGoalX && isInGoalZRange;
  }

  /**
   * Calculate where goalkeeper should position to intercept ball
   */
  calculateBallInterceptionPoint(
    ballPosition: Vector3Like,
    ballVelocity: Vector3Like,
    team: "red" | "blue",
    currentPosition: Vector3Like
  ): Vector3Like | null {
    const goalCenterX = team === "red" ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;
    const goalCenterZ = AI_FIELD_CENTER_Z;

    // Ball trajectory prediction - calculate where ball will cross goal line
    const goalLineX = goalCenterX;
    const timeToGoalLine = Math.abs((goalLineX - ballPosition.x) / ballVelocity.x);

    // Ignore unrealistic trajectories - don't chase balls going away or too slow
    if (timeToGoalLine <= 0 || timeToGoalLine > 3.0) return null;

    // Predicted ball position when it reaches goal line
    const predictedGoalZ = ballPosition.z + ballVelocity.z * timeToGoalLine;

    // Goalkeeper reach calculation - can the goalkeeper get there in time?
    const goalkeeperSpeed = 8.0;
    const maxReachableDistance = goalkeeperSpeed * timeToGoalLine;

    // Interception point - position slightly in front of goal line
    const interceptX = goalLineX + (team === "red" ? 2 : -2);
    const interceptZ = Math.max(
      goalCenterZ - 8,
      Math.min(goalCenterZ + 8, predictedGoalZ)
    ); // Clamp to goal width

    // Reachability check - only attempt saves within reach
    const distanceToIntercept = Math.sqrt(
      (interceptX - currentPosition.x) ** 2 + (interceptZ - currentPosition.z) ** 2
    );

    if (distanceToIntercept <= maxReachableDistance) {
      return { x: interceptX, y: currentPosition.y, z: interceptZ };
    }

    return null; // Ball is unreachable
  }

  /**
   * Apply rapid response movement for urgent shots
   */
  applyRapidResponse(
    context: GoalkeeperContext,
    ballPosition: Vector3Like,
    ballVelocity: Vector3Like
  ): Vector3Like | null {
    const ballSpeed = Math.sqrt(ballVelocity.x * ballVelocity.x + ballVelocity.z * ballVelocity.z);

    // Enhanced shot detection - react to medium-speed shots too
    if (ballSpeed > 2.0) {
      // Direct ball interception - calculate exact interception point
      const interceptionPoint = this.calculateBallInterceptionPoint(
        ballPosition,
        ballVelocity,
        context.team,
        context.position
      );

      if (interceptionPoint) {
        // Explosive goalkeeper movement - apply immediate velocity toward interception
        const directionToIntercept = {
          x: interceptionPoint.x - context.position.x,
          z: interceptionPoint.z - context.position.z,
        };

        const distanceToIntercept = Math.sqrt(
          directionToIntercept.x * directionToIntercept.x +
            directionToIntercept.z * directionToIntercept.z
        );

        if (distanceToIntercept > 0.5) {
          // Goalkeeper dive mechanics - apply explosive movement
          const urgentSpeed = 10.0;
          const normalizedX = directionToIntercept.x / distanceToIntercept;
          const normalizedZ = directionToIntercept.z / distanceToIntercept;

          // Direct velocity application - bypass gradual physics for urgent saves
          context.setLinearVelocity({
            x: normalizedX * urgentSpeed,
            y: context.linearVelocity?.y || 0,
            z: normalizedZ * urgentSpeed,
          });

          console.log(
            `>E GOALKEEPER DIVE: ${context.username} diving to intercept (speed: ${urgentSpeed.toFixed(1)})`
          );

          // Goalkeeper save animation
          if (context.isSpawned) {
            context.startModelOneshotAnimations(["kick"]); // Using kick as diving animation

            setTimeout(() => {
              if (context.isSpawned) {
                context.stopModelAnimations(["kick"]);
              }
            }, 800);
          }
        }

        return interceptionPoint;
      }
    }

    return null;
  }

  /**
   * Main goalkeeper decision-making logic
   */
  makeGoalkeeperDecision(
    context: GoalkeeperContext,
    ball: Entity | null,
    ballPosition: Vector3Like,
    ballVelocity: Vector3Like,
    hasBall: boolean,
    playerWithBall: SoccerPlayerEntity | null
  ): Vector3Like {
    const roleDefinition = ROLE_DEFINITIONS["goalkeeper"];
    const goalLineX = context.team === "red" ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;

    const ballSpeed = Math.sqrt(ballVelocity.x * ballVelocity.x + ballVelocity.z * ballVelocity.z);

    // Define goal width and penalty area
    const goalWidth = 10;
    const penaltyAreaRadius = 18;

    const distanceFromGoalToBall = Math.abs(ballPosition.x - goalLineX);
    const ballInPenaltyArea = distanceFromGoalToBall < penaltyAreaRadius;
    const distanceToBall = context.distanceBetween(ballPosition, context.position);

    // Enhanced shot detection
    const isShotOnGoal = this.isBallHeadingTowardsGoal(ballPosition, ballVelocity, context.team);
    const isFastShot = ballSpeed > 5.0;
    const isMediumShot = ballSpeed > 2.0;

    // PRIORITY 1: URGENT SHOT RESPONSE
    if (isShotOnGoal && (isFastShot || isMediumShot)) {
      console.log(
        `>E URGENT SAVE: ${context.username} responding to shot (speed: ${ballSpeed.toFixed(1)})`
      );
      const rapidTarget = this.applyRapidResponse(context, ballPosition, ballVelocity);
      if (rapidTarget) {
        return rapidTarget;
      }
    }

    // PRIORITY 2: BALL INTERCEPTION
    if (ballSpeed > 1.0 && distanceToBall < 15) {
      const interceptionPoint = this.calculateBallInterceptionPoint(
        ballPosition,
        ballVelocity,
        context.team,
        context.position
      );
      if (interceptionPoint) {
        console.log(`<¯ INTERCEPTION: ${context.username} moving to intercept ball`);
        return interceptionPoint;
      }
    }

    // Check if ball is in corner near own goal
    const isInCorner =
      (Math.abs(ballPosition.x - FIELD_MIN_X) < 8 || Math.abs(ballPosition.x - FIELD_MAX_X) < 8) &&
      (Math.abs(ballPosition.z - FIELD_MIN_Z) < 8 || Math.abs(ballPosition.z - FIELD_MAX_Z) < 8);

    const cornerNearOwnGoal =
      (context.team === "red" && Math.abs(ballPosition.x - FIELD_MIN_X) < 8) ||
      (context.team === "blue" && Math.abs(ballPosition.x - FIELD_MAX_X) < 8);

    if (
      isInCorner &&
      cornerNearOwnGoal &&
      context.isClosestTeammateToPosition(ballPosition) &&
      distanceToBall < 25
    ) {
      console.log(`Goalkeeper ${context.username} moving to retrieve ball from corner`);

      if (hasBall) {
        // Clear from corner
        const teammates = context.getVisibleTeammates().filter((t) => t !== context);
        let bestTarget: SoccerPlayerEntity | null = null;
        let bestScore = -Infinity;

        const fieldCenterX = AI_FIELD_CENTER_X;
        const fieldCenterZ = AI_FIELD_CENTER_Z;

        for (const teammate of teammates) {
          const distanceToTeammate = context.distanceBetween(context.position, teammate.position);

          if (distanceToTeammate < 8 || distanceToTeammate > 30) continue;

          const distanceToSidelines = Math.min(
            Math.abs(teammate.position.z - FIELD_MIN_Z),
            Math.abs(teammate.position.z - FIELD_MAX_Z)
          );
          if (distanceToSidelines < 8) continue;

          const centralityScore = 15 - Math.min(15, Math.abs(teammate.position.z - fieldCenterZ) / 2);
          const score = centralityScore + (20 - Math.min(20, distanceToTeammate / 2));

          if (score > bestScore) {
            bestScore = score;
            bestTarget = teammate;
          }
        }

        if (bestTarget && bestScore > 5) {
          console.log(`Goalkeeper ${context.username} passing from corner to teammate`);
          context.forcePass(bestTarget, bestTarget.position, 0.7);
        } else {
          console.log(`Goalkeeper ${context.username} clearing from corner to mid-field`);
          const clearTarget = {
            x: fieldCenterX + (context.team === "red" ? -2 : 2),
            y: context.position.y,
            z: fieldCenterZ,
          };
          const safeTarget = context.ensureTargetInBounds(clearTarget);
          context.forcePass(null, safeTarget, 0.7);
        }
      }

      return ballPosition;
    }

    // GK has the ball - distribute it
    if (hasBall) {
      if (context.ballPossessionStartTime === null) {
        context.ballPossessionStartTime = Date.now();
      }

      const possessionTime = Date.now() - context.ballPossessionStartTime;

      // Force clearance after max possession time
      if (possessionTime >= context.GOALKEEPER_MAX_POSSESSION_TIME) {
        console.log(`Goalkeeper ${context.username} FORCED clearing after possession limit`);

        const forwardDirection = context.team === "red" ? 1 : -1;
        const clearDistance = 10;
        const fieldCenterZ = AI_FIELD_CENTER_Z;

        const clearTarget = {
          x: context.position.x + forwardDirection * clearDistance,
          y: context.position.y,
          z: fieldCenterZ + (Math.random() * 6 - 3),
        };

        context.forcePass(null, clearTarget, 0.7);
        context.ballPossessionStartTime = null;
        return context.position;
      }

      // Immediate distribution
      const teammates = context.getVisibleTeammates().filter((t) => t !== context);

      if (teammates.length > 0) {
        // Try to pass - implementation would go here
        // For now, default to clearing
        const fieldCenterX = AI_FIELD_CENTER_X;
        const fieldCenterZ = AI_FIELD_CENTER_Z;

        const clearTargetX =
          fieldCenterX + (context.team === "red" ? -(Math.random() * 5) : Math.random() * 5);
        const clearTargetZ = fieldCenterZ + (Math.random() * 8 - 4);

        const clearTarget = {
          x: clearTargetX,
          y: context.position.y,
          z: clearTargetZ,
        };

        const safeTarget = context.ensureTargetInBounds(clearTarget);
        context.forcePass(null, safeTarget, 0.7);
      }

      context.ballPossessionStartTime = null;
      return context.position;
    }

    // Ball in penalty area - decide whether to come out or stay
    if (ballInPenaltyArea && distanceToBall < penaltyAreaRadius) {
      context.ballPossessionStartTime = null;

      // Never pursue if teammate has the ball
      if (
        playerWithBall &&
        playerWithBall instanceof SoccerPlayerEntity &&
        playerWithBall.team === context.team
      ) {
        return {
          x: goalLineX + (context.team === "red" ? 1 : -1),
          y: context.position.y,
          z: Math.max(
            AI_FIELD_CENTER_Z - goalWidth / 2,
            Math.min(AI_FIELD_CENTER_Z + goalWidth / 2, ballPosition.z * 0.7 + AI_FIELD_CENTER_Z * 0.3)
          ),
        };
      }

      const shouldStop = context.shouldStopPursuit(ballPosition);

      if (shouldStop) {
        return {
          x: goalLineX + (context.team === "red" ? 1 : -1),
          y: context.position.y,
          z: Math.max(
            AI_FIELD_CENTER_Z - goalWidth / 2,
            Math.min(AI_FIELD_CENTER_Z + goalWidth / 2, ballPosition.z * 0.7 + AI_FIELD_CENTER_Z * 0.3)
          ),
        };
      }

      const dangerLevel = 1 - distanceFromGoalToBall / penaltyAreaRadius;
      const ballIsTooFar = context.isBallTooFarToChase(ballPosition);
      const shouldComeOut =
        (dangerLevel > 0.7 || Math.random() < roleDefinition.pursuitTendency * dangerLevel) &&
        !ballIsTooFar;

      if (shouldComeOut) {
        console.log(`Goalkeeper ${context.username} coming out to claim the ball`);
        return ballPosition;
      } else {
        return {
          x: goalLineX + (context.team === "red" ? 1 : -1),
          y: context.position.y,
          z: Math.max(
            AI_FIELD_CENTER_Z - goalWidth / 2,
            Math.min(AI_FIELD_CENTER_Z + goalWidth / 2, ballPosition.z * 0.7 + AI_FIELD_CENTER_Z * 0.3)
          ),
        };
      }
    }

    // Enhanced positioning based on ball speed and trajectory
    context.ballPossessionStartTime = null;

    if ((isMediumShot && isShotOnGoal) || (ballSpeed > 3.0 && distanceToBall < 20)) {
      return this.calculatePredictivePosition(
        ballPosition,
        ballVelocity,
        context.team,
        context.position
      );
    } else {
      // Standard positioning - angle-based
      const ballAngle = Math.atan2(
        ballPosition.z - AI_FIELD_CENTER_Z,
        ballPosition.x - goalLineX
      );

      const angleResponse = 0.8;
      const targetZ = AI_FIELD_CENTER_Z + Math.sin(ballAngle) * (goalWidth / 2) * angleResponse;

      return {
        x: goalLineX + (context.team === "red" ? 1 : -1),
        y: context.position.y,
        z: targetZ,
      };
    }
  }
}
