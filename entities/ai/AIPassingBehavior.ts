import { type Vector3Like, PlayerEntity } from "hytopia";
import type SoccerPlayerEntity from "../SoccerPlayerEntity";
import type AIPlayerEntity from "../AIPlayerEntity";
import sharedState from "../../state/sharedState";

// Helper to get correct state from entity (room or global)
const getState = (entity: AIPlayerEntity) => entity.getSharedState();
import {
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_FIELD_CENTER_Z,
  FIELD_MAX_X,
  FIELD_MIN_X,
  FIELD_MAX_Z,
  FIELD_MIN_Z
} from '../../state/gameConfig';
import { PASS_FORCE, PASS_ARC_FACTOR } from './AIRoleDefinitions';

/**
 * Context required for passing behavior
 */
export interface PassingContext {
  entity: AIPlayerEntity;
  ball: any;
  currentPosition: Vector3Like;
  team: "red" | "blue";
  role: string;
}

/**
 * FIFA-like passing state machine states
 */
export type PassingState = 'none' | 'stopping' | 'ready' | 'passed';

/**
 * AIPassingBehavior - Handles all passing-related logic for AI players
 * Includes FIFA-like stop-and-pass mechanics, target selection, and pass execution
 */
export class AIPassingBehavior {
  // FIFA-like stop-and-pass state machine
  private passingState: PassingState = 'none';
  private passingStateStartTime: number | null = null;
  private readonly PASS_STOPPING_TIME = 300; // 300ms to stop and plant feet (FIFA-like)
  private readonly PASS_RECOVERY_TIME = 200; // 200ms delay after pass before moving

  /**
   * Get the current passing state
   */
  public getPassingState(): PassingState {
    return this.passingState;
  }

  /**
   * Get the time when the current passing state started
   */
  public getPassingStateStartTime(): number | null {
    return this.passingStateStartTime;
  }

  /**
   * Reset the passing state to 'none'
   */
  public resetPassingState(): void {
    this.passingState = 'none';
    this.passingStateStartTime = null;
  }

  /**
   * Execute FIFA-like stop-and-pass state machine
   * Returns the target position for the player during the passing sequence
   */
  public executePassingStateMachine(
    context: PassingContext,
    onPassSuccess?: () => void
  ): Vector3Like | null {
    const { entity, currentPosition, ball } = context;
    const ballPosition = ball.position;

    switch (this.passingState) {
      case 'none':
        // Start stopping to pass
        console.log(`${entity.player.username} 🛑 starting stop-and-pass sequence`);
        this.passingState = 'stopping';
        this.passingStateStartTime = Date.now();

        // STOP MOVING - set target to current position
        return {
          x: currentPosition.x,
          y: currentPosition.y,
          z: currentPosition.z
        };

      case 'stopping':
        // Wait for player to slow down and plant feet
        const stoppingTime = Date.now() - this.passingStateStartTime!;

        if (stoppingTime >= this.PASS_STOPPING_TIME) {
          console.log(`${entity.player.username} ⚽ ready to pass (planted feet)`);
          this.passingState = 'ready';
        }

        // STAY STOPPED
        return {
          x: currentPosition.x,
          y: currentPosition.y,
          z: currentPosition.z
        };

      case 'ready':
        // Execute the crisp pass
        console.log(`${entity.player.username} ✅ executing FIFA-like crisp pass`);
        const passSuccess = this.executeBestPass(context);

        if (passSuccess) {
          this.passingState = 'passed';
          this.passingStateStartTime = Date.now();
          if (onPassSuccess) onPassSuccess();
        } else {
          // Pass failed, reset and try dribbling
          console.log(`${entity.player.username} ❌ pass failed, resetting`);
          this.resetPassingState();
        }

        // STILL STOPPED during pass execution
        return {
          x: currentPosition.x,
          y: currentPosition.y,
          z: currentPosition.z
        };

      case 'passed':
        // Move to support position after pass
        const timeSincePass = Date.now() - this.passingStateStartTime!;

        if (timeSincePass >= this.PASS_RECOVERY_TIME) {
          console.log(`${entity.player.username} 🏃 moving to support position`);
          this.resetPassingState();
        }

        // Move to intelligent support position
        return this.calculateSupportPosition(currentPosition, ballPosition, context.team);
    }

    return null;
  }

  /**
   * Calculate support position after making a pass
   */
  private calculateSupportPosition(
    myPosition: Vector3Like,
    ballPosition: Vector3Like,
    team: "red" | "blue"
  ): Vector3Like {
    const forwardDir = team === 'red' ? 1 : -1;

    // Backs: Move slightly forward but maintain defensive shape
    const supportOffset = 5;
    const lateralOffset = (Math.random() - 0.5) * 8;

    return {
      x: myPosition.x + (forwardDir * supportOffset),
      y: myPosition.y,
      z: myPosition.z + lateralOffset
    };
  }

  /**
   * Find the best teammate to pass to and execute the pass
   */
  public executeBestPass(context: PassingContext): boolean {
    const { entity, team, role, currentPosition } = context;
    const ball = getState(entity).getSoccerBall();
    if (!ball || getState(entity).getAttachedPlayer() !== entity) return false;

    const teammates = entity.getVisibleTeammates();
    let bestTargetPlayer: PlayerEntity | null = null;
    let passTargetPosition: Vector3Like = { x: 0, y: 0, z: 0 };
    let bestScore = -Infinity;

    const opponentGoalX = team === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;

    // Process all teammates to find best pass target
    for (const teammate of teammates) {
      if (teammate === entity) continue;

      // Calculate distance to teammate
      const distanceToTeammate = entity.distanceBetween(currentPosition, teammate.position);

      // FIFA-LIKE: Role-based pass range (allows long balls)
      let maxPassRange = 30; // Default
      if (role === 'goalkeeper') maxPassRange = 45; // GK can launch long
      if (role === 'central-midfielder-1') maxPassRange = 40; // CM can play long
      if (role === 'central-midfielder-2') maxPassRange = 40; // CM can play long

      if (distanceToTeammate > maxPassRange) continue;

      // Calculate how open the teammate is (space score)
      let spaceScore = 10;
      const opponents = team === 'red' ? getState(entity).getBlueAITeam() : getState(entity).getRedAITeam();
      for (const opponent of opponents) {
        if (!opponent.isSpawned) continue;
        const distanceToOpponent = entity.distanceBetween(teammate.position, opponent.position);
        if (distanceToOpponent < 5) spaceScore -= 4;
        else if (distanceToOpponent < 10) spaceScore -= 2;
      }

      // SAFETY CHECK: Verify pass direction is safe
      const passDirection = {
        x: teammate.position.x - currentPosition.x,
        y: 0,
        z: teammate.position.z - currentPosition.z
      };
      const passLength = Math.sqrt(passDirection.x * passDirection.x + passDirection.z * passDirection.z);
      if (passLength > 0) {
        passDirection.x /= passLength;
        passDirection.z /= passLength;

        // Check if this pass direction is safe
        if (!this.isPassDirectionSafe(entity, currentPosition, passDirection, distanceToTeammate)) {
          console.log(`${role} ${entity.player.username} skipping unsafe pass to ${teammate.player.username}`);
          continue;
        }
      }

      // Calculate forward progression bonus
      const isForward = (team === 'red' && teammate.position.x < currentPosition.x) ||
                       (team === 'blue' && teammate.position.x > currentPosition.x);
      const forwardPositionBonus = isForward ? 5 : 0;

      // Calculate proximity to goal bonus
      const teammateDistanceToGoal = Math.abs(teammate.position.x - opponentGoalX);
      const goalProximityBonus = 20 - Math.min(20, teammateDistanceToGoal / 2);

      // Role-based scoring adjustments
      let roleBonus = 0;

      // HUMAN PLAYER PRIORITY: Give human players massive bonus
      if (!(teammate instanceof (entity.constructor as any))) {
        roleBonus = 50;
        console.log(`${role} ${entity.player.username} prioritizing human player ${teammate.player.username} for pass`);
      } else {
        // AI player role bonuses
        const teammateEntity = teammate as any;
        switch (teammateEntity.aiRole) {
          case 'striker':
            roleBonus = 10;
            break;
          case 'central-midfielder-1':
          case 'central-midfielder-2':
            roleBonus = 5;
            break;
          case 'left-back':
          case 'right-back':
            roleBonus = isForward ? 3 : 0;
            break;
          case 'goalkeeper':
            roleBonus = -15;
            break;
        }
      }

      // Final score calculation
      const score = (30 - Math.min(30, distanceToTeammate)) +
                   spaceScore * 2 +
                   forwardPositionBonus +
                   goalProximityBonus +
                   roleBonus +
                   (Math.random() * 2);

      if (score > bestScore) {
        bestScore = score;
        bestTargetPlayer = teammate;
      }
    }

    // Determine the target position based on the best teammate
    if (bestTargetPlayer) {
      passTargetPosition = this.calculatePassTarget(entity, currentPosition, bestTargetPlayer);
      console.log(`${role} ${entity.player.username} passing to ${bestTargetPlayer.player.username} with score ${bestScore.toFixed(1)}`);
    } else {
      // No suitable teammate found, make a general forward pass
      passTargetPosition = this.calculateForwardPassTarget(entity, currentPosition, team);
      console.log(`${role} ${entity.player.username} - no specific teammate target, making a general forward pass`);
    }

    // Calculate power multiplier based on distance - BALANCED PASSES
    const distanceToTarget = entity.distanceBetween(currentPosition, passTargetPosition);

    // BALANCED power range: 0.70 to 0.95 for good passes that reach teammates
    let powerMultiplier: number;
    if (distanceToTarget < 8) {
      powerMultiplier = 0.70; // Short passes - controlled touch
    } else if (distanceToTarget < 15) {
      powerMultiplier = 0.80; // Medium passes - solid
    } else if (distanceToTarget < 25) {
      powerMultiplier = 0.90; // Longer passes - firm
    } else {
      powerMultiplier = 0.95; // Long passes - full power
    }

    // Reduce power slightly if target is near field boundaries
    const fieldCenterX = (AI_GOAL_LINE_X_RED + AI_GOAL_LINE_X_BLUE) / 2;
    const fieldCenterZ = AI_FIELD_CENTER_Z;
    const distanceFromCenterX = Math.abs(passTargetPosition.x - fieldCenterX);
    const distanceFromCenterZ = Math.abs(passTargetPosition.z - fieldCenterZ);
    const fieldWidthX = Math.abs(FIELD_MAX_X - FIELD_MIN_X);
    const fieldWidthZ = Math.abs(FIELD_MAX_Z - FIELD_MIN_Z);

    if (distanceFromCenterX > fieldWidthX * 0.35 || distanceFromCenterZ > fieldWidthZ * 0.35) {
      powerMultiplier *= 0.85; // Slight reduction for edge passes
      console.log(`${role} ${entity.player.username} reducing pass power for edge target`);
    }

    // Execute the pass
    return entity.forcePass(bestTargetPlayer, passTargetPosition, powerMultiplier);
  }

  /**
   * Calculate the exact target position for a pass, accounting for teammate movement
   */
  private calculatePassTarget(
    entity: AIPlayerEntity,
    fromPosition: Vector3Like,
    targetPlayer: PlayerEntity
  ): Vector3Like {
    const passDirectionX = targetPlayer.position.x - fromPosition.x;
    const passDirectionZ = targetPlayer.position.z - fromPosition.z;
    const passDist = Math.sqrt(passDirectionX * passDirectionX + passDirectionZ * passDirectionZ);

    if (passDist > 0) {
      const normDx = passDirectionX / passDist;
      const normDz = passDirectionZ / passDist;

      // Check if teammate is moving - only lead if they're running fast
      let teammateVelocity = { x: 0, z: 0 };
      if (targetPlayer instanceof (entity.constructor as any) && (targetPlayer as any).linearVelocity) {
        const vel = (targetPlayer as any).linearVelocity;
        const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        // Only account for velocity if teammate is moving fast (running)
        if (speed > 3) {
          teammateVelocity = { x: vel.x * 0.3, z: vel.z * 0.3 }; // Reduced prediction factor
        }
      }

      // Predict where teammate will be - minimal lead for accurate "to feet" passes
      const passSpeed = 4.5; // Faster ball travel = less lead needed
      const passTravelTime = passDist / passSpeed;
      const predictedX = targetPlayer.position.x + (teammateVelocity.x * passTravelTime);
      const predictedZ = targetPlayer.position.z + (teammateVelocity.z * passTravelTime);

      // MINIMAL LEAD: Pass directly to feet, tiny buffer only for long passes
      let safetyMargin = 0.0; // No lead for short passes - direct to feet
      if (passDist > 25) {
        safetyMargin = 0.3; // Tiny lead only for very long passes
      }

      return {
        x: predictedX + normDx * safetyMargin,
        y: targetPlayer.position.y,
        z: predictedZ + normDz * safetyMargin
      };
    } else {
      return targetPlayer.position;
    }
  }

  /**
   * Calculate a forward pass target when no specific teammate is available
   */
  private calculateForwardPassTarget(
    entity: AIPlayerEntity,
    fromPosition: Vector3Like,
    team: "red" | "blue"
  ): Vector3Like {
    const forwardDirection = team === 'red' ? 1 : -1;
    const currentX = fromPosition.x;
    const fieldCenter = (AI_GOAL_LINE_X_RED + AI_GOAL_LINE_X_BLUE) / 2;

    // Adjust pass distance based on field position
    let passDistance = 12;

    // If on own half, make a longer pass
    if ((team === 'red' && currentX < fieldCenter) ||
        (team === 'blue' && currentX > fieldCenter)) {
      passDistance = 18;
    }

    return {
      x: fromPosition.x + (forwardDirection * passDistance),
      y: fromPosition.y,
      z: fromPosition.z + ((Math.random() * 10) - 5)
    };
  }

  /**
   * Check if a pass in a given direction would be safe (not out of bounds)
   */
  private isPassDirectionSafe(
    entity: AIPlayerEntity,
    fromPosition: Vector3Like,
    direction: Vector3Like,
    distance: number
  ): boolean {
    // Project the pass target along the direction
    const targetX = fromPosition.x + direction.x * distance;
    const targetZ = fromPosition.z + direction.z * distance;

    // Check X boundaries with safety margin
    const safetyMargin = 3;
    if (targetX < FIELD_MIN_X + safetyMargin || targetX > FIELD_MAX_X - safetyMargin) {
      return false;
    }

    // Check Z boundaries with safety margin
    if (targetZ < FIELD_MIN_Z + safetyMargin || targetZ > FIELD_MAX_Z - safetyMargin) {
      return false;
    }

    return true;
  }

  /**
   * Start the FIFA-like passing sequence
   */
  public initiatePass(): void {
    if (this.passingState === 'none') {
      this.passingState = 'stopping';
      this.passingStateStartTime = Date.now();
    }
  }

  /**
   * Check if currently in a passing sequence
   */
  public isInPassingSequence(): boolean {
    return this.passingState !== 'none';
  }

  /**
   * Get time constants for passing behavior
   */
  public getPassingTimeConstants() {
    return {
      PASS_STOPPING_TIME: this.PASS_STOPPING_TIME,
      PASS_RECOVERY_TIME: this.PASS_RECOVERY_TIME
    };
  }
}
