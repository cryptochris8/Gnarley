import { type Vector3Like, Entity } from "hytopia";
import type AIPlayerEntity from "../AIPlayerEntity";
import sharedState from "../../state/sharedState";

// Helper to get correct state from entity (room or global)
const getState = (entity: AIPlayerEntity) => entity.getSharedState();
import {
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_FIELD_CENTER_X,
  AI_FIELD_CENTER_Z,
  AI_FORWARD_OFFSET_X,
  AI_MIDFIELD_OFFSET_X
} from '../../state/gameConfig';
import {
  type SoccerAIRole,
  SHOT_FORCE,
  SHOT_ARC_FACTOR
} from './AIRoleDefinitions';

/**
 * Context required for offensive behavior
 */
export interface OffensiveContext {
  entity: AIPlayerEntity;
  ball: Entity;
  currentPosition: Vector3Like;
  team: "red" | "blue";
  role: SoccerAIRole;
}

/**
 * Shooting decision result
 */
export interface ShootingDecision {
  shouldShoot: boolean;
  targetPoint: Vector3Like;
  powerMultiplier: number;
  reason: string;
}

/**
 * Dribbling decision result
 */
export interface DribblingDecision {
  shouldDribble: boolean;
  targetPosition: Vector3Like;
  reason: string;
}

/**
 * AIOffensiveBehavior - Handles all offensive logic for AI players
 * Includes shooting decisions, dribbling, and attacking positioning
 */
export class AIOffensiveBehavior {
  /**
   * Evaluate whether to shoot at goal
   * AGGRESSIVE SHOOTING: Take the shot when in good positions!
   */
  public evaluateShootingOpportunity(context: OffensiveContext): ShootingDecision {
    const { entity, currentPosition, team, role } = context;

    const opponentGoalTarget: Vector3Like = {
      x: team === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED,
      y: 1,
      z: AI_FIELD_CENTER_Z
    };

    const distanceToGoal = entity.distanceBetween(currentPosition, opponentGoalTarget);
    const centralPosition = Math.abs(currentPosition.z - AI_FIELD_CENTER_Z) < 15;

    // Role-specific shooting parameters - AGGRESSIVE
    let inPrimeShootingRange = false;
    let inDecentShootingRange = false;
    let shootingProbability = 0;
    let powerMultiplier = 1.0;

    if (role === 'striker') {
      // Strikers: VERY aggressive shooting
      inPrimeShootingRange = distanceToGoal < 20;
      inDecentShootingRange = distanceToGoal < 28;
      shootingProbability = 0.85; // High base probability

      if (inPrimeShootingRange) shootingProbability = 0.95; // Almost always shoot when close
      if (centralPosition) shootingProbability += 0.05;

      powerMultiplier = distanceToGoal > 22 ? 1.3 : 1.15;
    } else if (role.includes('midfielder')) {
      // Midfielders: Aggressive shooting
      inPrimeShootingRange = distanceToGoal < 18;
      inDecentShootingRange = distanceToGoal < 25;
      shootingProbability = 0.70;

      if (inPrimeShootingRange) shootingProbability = 0.85;
      if (centralPosition) shootingProbability += 0.10;

      powerMultiplier = distanceToGoal > 20 ? 1.25 : 1.1;
    } else {
      // Defenders: Shoot when opportunity presents
      inPrimeShootingRange = distanceToGoal < 15;
      inDecentShootingRange = distanceToGoal < 20;
      shootingProbability = 0.50;

      if (inPrimeShootingRange) shootingProbability = 0.70;
      if (centralPosition) shootingProbability += 0.15;

      powerMultiplier = 1.1;
    }

    // ALWAYS shoot if we're very close and central - don't leave chances!
    if (distanceToGoal < 12 && centralPosition) {
      console.log(`🎯 ${role} taking guaranteed shot from ${distanceToGoal.toFixed(1)}m!`);
      return {
        shouldShoot: true,
        targetPoint: {
          x: opponentGoalTarget.x,
          y: opponentGoalTarget.y,
          z: opponentGoalTarget.z + ((Math.random() * 4) - 2) // Aim for corners
        },
        powerMultiplier: 1.2,
        reason: `prime scoring chance at ${distanceToGoal.toFixed(1)}m`
      };
    }

    // Decide whether to shoot based on probability
    const shouldShoot = (inPrimeShootingRange || (inDecentShootingRange && centralPosition)) &&
                       Math.random() < shootingProbability;

    if (shouldShoot) {
      // Add slight randomness to shot placement - aim for corners
      const shootTarget = {
        x: opponentGoalTarget.x,
        y: opponentGoalTarget.y,
        z: opponentGoalTarget.z + ((Math.random() * 6) - 3)
      };

      return {
        shouldShoot: true,
        targetPoint: shootTarget,
        powerMultiplier,
        reason: `${inPrimeShootingRange ? 'prime' : 'decent'} shooting position at ${distanceToGoal.toFixed(1)}m`
      };
    }

    return {
      shouldShoot: false,
      targetPoint: opponentGoalTarget,
      powerMultiplier: 1.0,
      reason: `not in shooting range (${distanceToGoal.toFixed(1)}m) or failed probability check`
    };
  }

  /**
   * Execute a shot on goal
   */
  public executeShot(
    entity: AIPlayerEntity,
    targetPoint: Vector3Like,
    powerMultiplier: number = 1.0
  ): boolean {
    const ball = getState(entity).getSoccerBall();
    if (!ball || getState(entity).getAttachedPlayer() !== entity) return false;

    const currentPosition = entity.position;

    // Calculate direction components towards the targetPoint
    const dx = targetPoint.x - currentPosition.x;
    const dz = targetPoint.z - currentPosition.z;

    // Calculate horizontal distance for arc calculation
    const distanceHorizontal = Math.sqrt(dx * dx + dz * dz);

    // DISTANCE-BASED FORCE SCALING - Matched to human player power
    // SHOT_FORCE = 4.0, human range is 1.5-5.0
    let distanceScaledForce = SHOT_FORCE;
    if (distanceHorizontal < 10) {
      // Close range: Quick powerful finish
      distanceScaledForce = SHOT_FORCE * 0.9; // 3.6
      console.log(`🎯 Close-range shot (${distanceHorizontal.toFixed(1)}m) - Quick finish`);
    } else if (distanceHorizontal > 25) {
      // Long range: Full power driven shot
      distanceScaledForce = SHOT_FORCE * 1.1; // 4.4
      console.log(`🚀 Long-range shot (${distanceHorizontal.toFixed(1)}m) - Full power`);
    } else {
      // Medium range: Solid strike
      distanceScaledForce = SHOT_FORCE * 1.0; // 4.0
      // console.log(`⚽ Medium-range shot (${distanceHorizontal.toFixed(1)}m) - Solid strike`);
    }

    // DISTANCE-BASED ARC SCALING - Keep shots LOW like driven shots
    const arcMultiplier = Math.min(distanceHorizontal / 25, 1.2); // Reduced to keep arcs lower
    const baseArc = distanceHorizontal * SHOT_ARC_FACTOR * arcMultiplier;
    const distanceBonus = Math.min(distanceHorizontal / 40, 0.5) * 0.5; // Reduced bonus
    const calculatedY = Math.min(baseArc + distanceBonus, 3.0); // Cap Y at 3.0

    const direction = {
      x: dx,
      y: calculatedY,
      z: dz
    };

    const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (length === 0) return false;

    // Normalize the direction vector
    direction.x /= length;
    direction.y /= length;
    direction.z /= length;

    getState(entity).setAttachedPlayer(null);

    // Calculate effective shot force
    const effectiveShotForce = Math.min(distanceScaledForce * powerMultiplier, 10);

    // Controlled vertical component - keep shots low
    const verticalComponent = direction.y * effectiveShotForce;
    const maxVerticalForce = 3.5; // Reduced from 6.5 - keeps shots on target
    const finalVerticalForce = Math.min(verticalComponent, maxVerticalForce);

    // Apply impulse
    ball.applyImpulse({
      x: direction.x * effectiveShotForce,
      y: finalVerticalForce,
      z: direction.z * effectiveShotForce
    });

    // Reset angular velocity to prevent spinning
    ball.setAngularVelocity({ x: 0, y: 0, z: 0 });

    // Continue resetting angular velocity for 500ms
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

    entity.startModelOneshotAnimations(["kick"]);
    return true;
  }

  /**
   * Evaluate dribbling decision (move toward goal with ball)
   */
  public evaluateDribblingDecision(context: OffensiveContext): DribblingDecision {
    const { entity, currentPosition, team, role } = context;

    const opponentGoalLineX = team === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;
    const forwardDirection = team === 'red' ? 1 : -1;

    // Role-specific dribbling behavior
    if (role === 'striker') {
      // Strikers: Aggressive dribbling toward goal
      const dribbleTarget = {
        x: currentPosition.x + (forwardDirection * 8),
        y: currentPosition.y,
        z: AI_FIELD_CENTER_Z + ((Math.random() - 0.5) * 10) // Some lateral variation
      };

      return {
        shouldDribble: true,
        targetPosition: dribbleTarget,
        reason: 'striker dribbling toward goal'
      };
    } else if (role.includes('midfielder')) {
      // Midfielders: Measured advancement
      const distanceToGoal = Math.abs(currentPosition.x - opponentGoalLineX);

      if (distanceToGoal > 20) {
        // Far from goal - advance moderately
        const dribbleTarget = {
          x: currentPosition.x + (forwardDirection * 6),
          y: currentPosition.y,
          z: currentPosition.z + ((Math.random() - 0.5) * 6)
        };

        return {
          shouldDribble: true,
          targetPosition: dribbleTarget,
          reason: 'midfielder advancing from distance'
        };
      } else {
        // Near goal - look for better positioning
        const dribbleTarget = {
          x: currentPosition.x + (forwardDirection * 4),
          y: currentPosition.y,
          z: AI_FIELD_CENTER_Z + ((currentPosition.z - AI_FIELD_CENTER_Z) * 0.5) // Move toward center
        };

        return {
          shouldDribble: true,
          targetPosition: dribbleTarget,
          reason: 'midfielder positioning for shot'
        };
      }
    } else {
      // Defenders: Cautious advancement
      const dribbleTarget = {
        x: currentPosition.x + (forwardDirection * 5),
        y: currentPosition.y,
        z: currentPosition.z // Stay on same lateral position
      };

      return {
        shouldDribble: true,
        targetPosition: dribbleTarget,
        reason: 'defender advancing cautiously'
      };
    }
  }

  /**
   * Calculate attacking run position (off-ball movement)
   */
  public calculateAttackingRunPosition(
    entity: AIPlayerEntity,
    ballPosition: Vector3Like,
    currentPosition: Vector3Like,
    role: SoccerAIRole,
    team: "red" | "blue"
  ): Vector3Like {
    const opponentGoalLineX = team === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;
    const forwardDirection = team === 'red' ? 1 : -1;

    if (role === 'striker') {
      // Striker: Run toward goal, ahead of ball
      const runTarget = {
        x: Math.min(
          Math.max(ballPosition.x, currentPosition.x) + (forwardDirection * 10),
          opponentGoalLineX - (forwardDirection * 5)
        ),
        y: currentPosition.y,
        z: AI_FIELD_CENTER_Z + ((Math.random() - 0.5) * 12) // Wide variation for unpredictability
      };

      return runTarget;
    } else if (role.includes('midfielder')) {
      // Midfielder: Support the attack, but stay behind striker
      const runTarget = {
        x: ballPosition.x + (forwardDirection * 6),
        y: currentPosition.y,
        z: currentPosition.z + ((Math.random() - 0.5) * 8)
      };

      return runTarget;
    } else {
      // Defender: Cautious support, stay well behind ball
      const runTarget = {
        x: ballPosition.x + (forwardDirection * -5), // Stay behind ball
        y: currentPosition.y,
        z: currentPosition.z
      };

      return runTarget;
    }
  }

  /**
   * Calculate position to receive a pass
   */
  public calculatePassReceivingPosition(
    entity: AIPlayerEntity,
    ballPosition: Vector3Like,
    currentPosition: Vector3Like,
    role: SoccerAIRole,
    team: "red" | "blue"
  ): Vector3Like {
    const forwardDirection = team === 'red' ? 1 : -1;

    // Move to open space to receive pass
    const lateralOffset = (Math.random() - 0.5) * 10;
    const forwardOffset = role === 'striker' ? 8 : 5;

    return {
      x: ballPosition.x + (forwardDirection * forwardOffset),
      y: currentPosition.y,
      z: ballPosition.z + lateralOffset
    };
  }

  /**
   * Check if player is in a good attacking position
   */
  public isInGoodAttackingPosition(
    entity: AIPlayerEntity,
    currentPosition: Vector3Like,
    team: "red" | "blue"
  ): boolean {
    const opponentGoalLineX = team === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;
    const distanceToGoal = Math.abs(currentPosition.x - opponentGoalLineX);

    // Check if in attacking third and relatively central
    const inAttackingThird = distanceToGoal < AI_FORWARD_OFFSET_X * 1.5;
    const reasonablyCentral = Math.abs(currentPosition.z - AI_FIELD_CENTER_Z) < 20;

    return inAttackingThird && reasonablyCentral;
  }

  /**
   * Calculate position for hold-up play (striker backs into defender)
   */
  public calculateHoldUpPosition(
    entity: AIPlayerEntity,
    currentPosition: Vector3Like,
    ballPosition: Vector3Like
  ): Vector3Like {
    // Stay close to current position, shield the ball
    return {
      x: currentPosition.x,
      y: currentPosition.y,
      z: currentPosition.z + ((Math.random() - 0.5) * 2) // Minimal movement
    };
  }

  /**
   * Evaluate whether to attempt a through ball
   */
  public shouldAttemptThroughBall(
    entity: AIPlayerEntity,
    currentPosition: Vector3Like,
    team: "red" | "blue"
  ): boolean {
    // Check if there are teammates making runs ahead
    const teammates = entity.getVisibleTeammates();
    const opponentGoalLineX = team === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;

    for (const teammate of teammates) {
      if (teammate === entity) continue;

      // Check if teammate is ahead and moving forward
      const isAhead = team === 'red'
        ? teammate.position.x > currentPosition.x
        : teammate.position.x < currentPosition.x;

      if (isAhead) {
        const distanceToGoal = Math.abs(teammate.position.x - opponentGoalLineX);
        if (distanceToGoal < 20) {
          // Teammate in good position for through ball
          return Math.random() < 0.3; // 30% chance
        }
      }
    }

    return false;
  }

  /**
   * Calculate cross position (wide players crossing into box)
   */
  public calculateCrossingPosition(
    entity: AIPlayerEntity,
    currentPosition: Vector3Like,
    team: "red" | "blue"
  ): Vector3Like {
    const opponentGoalLineX = team === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;

    // Cross target: In front of goal, center area
    return {
      x: opponentGoalLineX + (team === 'red' ? 5 : -5),
      y: 2, // Elevated for header
      z: AI_FIELD_CENTER_Z + ((Math.random() - 0.5) * 8)
    };
  }

  /**
   * Check if player should attempt a cross
   */
  public shouldAttemptCross(
    entity: AIPlayerEntity,
    currentPosition: Vector3Like,
    team: "red" | "blue",
    role: SoccerAIRole
  ): boolean {
    // Only wide players should cross
    if (!role.includes('back')) return false;

    const opponentGoalLineX = team === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;
    const distanceToGoal = Math.abs(currentPosition.x - opponentGoalLineX);
    const isWide = Math.abs(currentPosition.z - AI_FIELD_CENTER_Z) > 15;

    // In final third and wide position
    return distanceToGoal < 20 && isWide && Math.random() < 0.25;
  }
}
