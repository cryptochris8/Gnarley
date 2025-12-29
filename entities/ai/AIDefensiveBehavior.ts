import { type Vector3Like } from "hytopia";
import type AIPlayerEntity from "../AIPlayerEntity";
import type SoccerPlayerEntity from "../SoccerPlayerEntity";
import sharedState from "../../state/sharedState";

// Helper to get correct state from entity (room or global)
const getState = (entity: AIPlayerEntity) => entity.getSharedState();
import {
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_FIELD_CENTER_X,
  AI_FIELD_CENTER_Z,
  AI_DEFENSIVE_OFFSET_X,
  AI_MIDFIELD_OFFSET_X
} from '../../state/gameConfig';
import {
  type SoccerAIRole,
  ROLE_DEFINITIONS,
  ROLE_PURSUIT_PROBABILITY,
  POSITION_RECOVERY_MULTIPLIER
} from './AIRoleDefinitions';

/**
 * Context required for defensive behavior
 */
export interface DefensiveContext {
  entity: AIPlayerEntity;
  currentPosition: Vector3Like;
  ballPosition: Vector3Like;
  team: "red" | "blue";
  role: SoccerAIRole;
  goalLineX: number;
}

/**
 * Defensive positioning result
 */
export interface DefensivePositionResult {
  position: Vector3Like;
  shouldPursue: boolean;
  reason: string;
}

/**
 * AIDefensiveBehavior - Handles all defensive logic for AI players
 * Includes defensive positioning, marking, and fallback behavior
 */
export class AIDefensiveBehavior {
  /**
   * Calculate defensive position for a defender (left/right back)
   */
  public calculateDefenderPosition(
    context: DefensiveContext,
    wideZBoundary: number,
    isLeftBack: boolean
  ): DefensivePositionResult {
    const { entity, currentPosition, ballPosition, team, role, goalLineX } = context;
    const distanceToBall = entity.distanceBetween(currentPosition, ballPosition);

    // Analyze game situation
    const ballInOurHalf = (team === 'red' && ballPosition.x < AI_FIELD_CENTER_X) ||
                         (team === 'blue' && ballPosition.x > AI_FIELD_CENTER_X);
    const ballOnMyFlank = isLeftBack
      ? ballPosition.z < AI_FIELD_CENTER_Z
      : ballPosition.z > AI_FIELD_CENTER_Z;
    const ballInDefensiveThird = Math.abs(ballPosition.x - goalLineX) < AI_DEFENSIVE_OFFSET_X;

    // Get base defensive position
    const baseX = goalLineX + (team === 'red' ? AI_DEFENSIVE_OFFSET_X : -AI_DEFENSIVE_OFFSET_X);
    const baseZ = wideZBoundary * 0.75;

    let targetPos: Vector3Like;
    let shouldPursue = false;
    let reason = 'maintaining position';

    // 1. URGENT DEFENSIVE DUTY: Ball in our defensive third on my flank
    if (ballInDefensiveThird && ballOnMyFlank) {
      const goalSideZ = ballPosition.z + (AI_FIELD_CENTER_Z - ballPosition.z) * 0.3;

      targetPos = {
        x: Math.min(ballPosition.x + 2, baseX),
        y: currentPosition.y,
        z: goalSideZ
      };
      shouldPursue = true;
      reason = 'closing down immediate threat';
    }
    // 2. DEFENSIVE DUTY: Ball in our half - maintain defensive shape
    else if (ballInOurHalf) {
      const recoveryFactor = POSITION_RECOVERY_MULTIPLIER[role];
      const ballTrackingZ = AI_FIELD_CENTER_Z + (ballPosition.z - AI_FIELD_CENTER_Z) * (0.2 / recoveryFactor);
      const defendingZ = isLeftBack
        ? Math.max(wideZBoundary, Math.min(baseZ, ballTrackingZ))
        : Math.min(wideZBoundary, Math.max(baseZ, ballTrackingZ));

      const defensiveLineX = baseX + (ballPosition.x - baseX) * 0.2;

      targetPos = {
        x: Math.max(goalLineX + 5, defensiveLineX),
        y: currentPosition.y,
        z: defendingZ
      };
      reason = 'maintaining defensive shape';
    }
    // 3. SUPPORTING ATTACK: Ball in opponent's half
    else {
      const forwardLimit = AI_FIELD_CENTER_X + (team === 'red' ? AI_DEFENSIVE_OFFSET_X : -AI_DEFENSIVE_OFFSET_X);
      const supportX = Math.min(
        team === 'red' ? forwardLimit : goalLineX,
        Math.max(
          team === 'red' ? goalLineX : forwardLimit,
          ballPosition.x + (team === 'red' ? -10 : 10)
        )
      );

      const supportZ = isLeftBack
        ? Math.min(AI_FIELD_CENTER_Z - 5, wideZBoundary + 3)
        : Math.max(AI_FIELD_CENTER_Z + 5, wideZBoundary - 3);

      targetPos = {
        x: supportX,
        y: currentPosition.y,
        z: supportZ
      };
      reason = 'providing attacking width';
    }

    // Check for pursuit override
    const pursuitDecision = this.shouldPursueForDefender(
      entity,
      currentPosition,
      ballPosition,
      role,
      ballOnMyFlank,
      ballInDefensiveThird,
      distanceToBall
    );

    if (pursuitDecision.shouldPursue) {
      targetPos = pursuitDecision.position;
      shouldPursue = true;
      reason = pursuitDecision.reason;
    }

    return { position: targetPos, shouldPursue, reason };
  }

  /**
   * Determine if a defender should pursue the ball
   */
  private shouldPursueForDefender(
    entity: AIPlayerEntity,
    currentPosition: Vector3Like,
    ballPosition: Vector3Like,
    role: SoccerAIRole,
    ballOnMyFlank: boolean,
    ballInDefensiveThird: boolean,
    distanceToBall: number
  ): { shouldPursue: boolean; position: Vector3Like; reason: string } {
    const DEFENDER_PURSUIT_DISTANCE = 25;

    // Check if a teammate has the ball
    const playerWithBall = getState(entity).getAttachedPlayer();
    if (playerWithBall && playerWithBall !== entity &&
        playerWithBall instanceof (entity.constructor as any) &&
        (playerWithBall as any).team === entity.team) {
      return { shouldPursue: false, position: currentPosition, reason: 'teammate has ball' };
    }

    // Check if we should stop pursuit
    const shouldStop = entity.shouldStopPursuit(ballPosition);
    if (shouldStop) {
      return { shouldPursue: false, position: currentPosition, reason: 'ball too far' };
    }

    // Check basic pursuit conditions
    if (entity.isKickoffActive ||
        !getState(entity).getBallHasMoved() ||
        distanceToBall >= DEFENDER_PURSUIT_DISTANCE) {
      return { shouldPursue: false, position: currentPosition, reason: 'out of range' };
    }

    // Check if ball is too far to chase
    const ballTooFar = entity.isBallTooFarToChase(ballPosition);
    if (ballTooFar) {
      return { shouldPursue: false, position: currentPosition, reason: 'ball too far from area' };
    }

    // Calculate pursuit probability
    const isLooseBall = entity.isLooseBallInArea(ballPosition);
    const shouldPursue = entity.shouldPursueBasedOnTeamCoordination(ballPosition);

    let pursuitBonus = 0;
    if (ballOnMyFlank) pursuitBonus += 0.2;
    if (ballInDefensiveThird) pursuitBonus += 0.2;
    if (entity.isClosestTeammateToPosition(ballPosition)) pursuitBonus += 0.3;

    const roleDefinition = ROLE_DEFINITIONS[role];
    const positionRecoveryFactor = 1 - (roleDefinition.positionRecoverySpeed * POSITION_RECOVERY_MULTIPLIER[role]);
    const pursuitProbability = Math.min(0.8, ROLE_PURSUIT_PROBABILITY[role] * positionRecoveryFactor + pursuitBonus);

    // Decide whether to pursue
    if (isLooseBall ||
        (ballInDefensiveThird && ballOnMyFlank) ||
        entity.isClosestTeammateToPosition(ballPosition) ||
        (shouldPursue && Math.random() < pursuitProbability)) {

      const goalSidePosition = {
        x: ballPosition.x + (entity.team === 'red' ? 1 : -1),
        y: ballPosition.y,
        z: ballPosition.z + (AI_FIELD_CENTER_Z - ballPosition.z) * 0.2
      };

      return {
        shouldPursue: true,
        position: goalSidePosition,
        reason: isLooseBall ? 'loose ball' : 'defensive duty'
      };
    }

    return { shouldPursue: false, position: currentPosition, reason: 'holding position' };
  }

  /**
   * Calculate defensive position for a midfielder
   */
  public calculateMidfielderDefensivePosition(
    context: DefensiveContext
  ): DefensivePositionResult {
    const { entity, currentPosition, ballPosition, team, role, goalLineX } = context;

    const ballInDefensiveThird = Math.abs(ballPosition.x - goalLineX) < AI_MIDFIELD_OFFSET_X;

    if (!ballInDefensiveThird) {
      return {
        position: currentPosition,
        shouldPursue: false,
        reason: 'not in defensive third'
      };
    }

    // Ball in our defensive third - help defense
    const distanceToBall = entity.distanceBetween(currentPosition, ballPosition);

    if (distanceToBall < 12) {
      // Close enough to help - move between ball and goal
      const defenseX = goalLineX + (team === 'red' ? AI_DEFENSIVE_OFFSET_X * 0.5 : -AI_DEFENSIVE_OFFSET_X * 0.5);
      const defendingPosition = {
        x: defenseX,
        y: currentPosition.y,
        z: ballPosition.z
      };

      return {
        position: defendingPosition,
        shouldPursue: true,
        reason: 'helping defense - close to ball'
      };
    } else {
      // Too far to effectively help - hold deeper position
      const holdingPosition = {
        x: goalLineX + (team === 'red' ? AI_DEFENSIVE_OFFSET_X * 0.7 : -AI_DEFENSIVE_OFFSET_X * 0.7),
        y: currentPosition.y,
        z: AI_FIELD_CENTER_Z
      };

      return {
        position: holdingPosition,
        shouldPursue: false,
        reason: 'holding deep position'
      };
    }
  }

  /**
   * Handle opponent goalkeeper possession - maintain respect distance
   */
  public handleOpponentGoalkeeperPossession(
    entity: AIPlayerEntity,
    opponentGoalkeeper: SoccerPlayerEntity,
    role: SoccerAIRole
  ): Vector3Like {
    const gkPosition = opponentGoalkeeper.position;
    const formationPos = entity.getRoleBasedPosition();

    console.log(`🛡️ ${role} ${entity.player.username} respecting opponent GK possession`);

    // Different respect distances based on role
    if (role === 'striker') {
      // Strikers position to intercept passes, but not too close
      const minRespectDistance = 15;
      return this.maintainRespectDistance(entity, gkPosition, formationPos, minRespectDistance, 'intercepting passes');
    } else if (role.includes('midfielder')) {
      // Midfielders drop back slightly but stay ready
      const minRespectDistance = 18;
      const adjustedFormation = {
        x: formationPos.x + (entity.team === 'red' ? -5 : 5),
        y: formationPos.y,
        z: formationPos.z
      };
      return this.maintainRespectDistance(entity, gkPosition, adjustedFormation, minRespectDistance, 'ready to intercept');
    } else {
      // Defenders: Drop back to defensive position
      const defensiveAdjust = entity.team === 'red' ? -8 : 8;
      const defensivePosition = {
        x: formationPos.x + defensiveAdjust,
        y: formationPos.y,
        z: formationPos.z
      };
      console.log(`🛡️ Defender ${entity.player.username} holding defensive position while opponent GK has ball`);
      return defensivePosition;
    }
  }

  /**
   * Maintain a respect distance from opponent goalkeeper
   */
  private maintainRespectDistance(
    entity: AIPlayerEntity,
    gkPosition: Vector3Like,
    fallbackPosition: Vector3Like,
    minDistance: number,
    reason: string
  ): Vector3Like {
    const currentPos = entity.position;
    const distanceToGK = entity.distanceBetween(currentPos, gkPosition);

    if (distanceToGK < minDistance) {
      // Too close - move away to respect distance
      const awayX = currentPos.x - gkPosition.x;
      const awayZ = currentPos.z - gkPosition.z;
      const awayLength = Math.sqrt(awayX * awayX + awayZ * awayZ);

      if (awayLength > 0.1) {
        const targetDistance = minDistance + 2;
        return {
          x: gkPosition.x + (awayX / awayLength) * targetDistance,
          y: currentPos.y,
          z: gkPosition.z + (awayZ / awayLength) * targetDistance
        };
      }
    }

    // Far enough - use fallback position for strategic positioning
    console.log(`${entity.role} ${entity.player.username} ${reason}`);
    return fallbackPosition;
  }

  /**
   * Fall back to defensive position (for all roles)
   */
  public fallBackToDefense(
    entity: AIPlayerEntity,
    currentPosition: Vector3Like,
    role: SoccerAIRole,
    team: "red" | "blue"
  ): Vector3Like {
    const goalLineX = team === 'red' ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;
    const formationPos = entity.getRoleBasedPosition();

    // Apply defensive adjustment based on role
    let defensiveAdjust = 0;

    if (role === 'striker') {
      // Striker drops back to midfield area when defending
      defensiveAdjust = team === 'red' ? -AI_MIDFIELD_OFFSET_X * 0.5 : AI_MIDFIELD_OFFSET_X * 0.5;
    } else if (role.includes('midfielder')) {
      // Midfielders drop back toward defensive third
      defensiveAdjust = team === 'red' ? -AI_DEFENSIVE_OFFSET_X * 0.3 : AI_DEFENSIVE_OFFSET_X * 0.3;
    } else if (role.includes('back')) {
      // Defenders stay in defensive position
      defensiveAdjust = team === 'red' ? -AI_DEFENSIVE_OFFSET_X * 0.2 : AI_DEFENSIVE_OFFSET_X * 0.2;
    }

    return {
      x: formationPos.x + defensiveAdjust,
      y: formationPos.y,
      z: formationPos.z
    };
  }

  /**
   * Calculate pressing position (aggressive defensive positioning)
   */
  public calculatePressingPosition(
    entity: AIPlayerEntity,
    ballPosition: Vector3Like,
    currentPosition: Vector3Like
  ): Vector3Like {
    // Position between current position and ball, slightly goal-side
    const goalSideBias = entity.team === 'red' ? 1 : -1;

    return {
      x: ballPosition.x + goalSideBias * 2,
      y: currentPosition.y,
      z: ballPosition.z + (AI_FIELD_CENTER_Z - ballPosition.z) * 0.3
    };
  }

  /**
   * Check if player should mark an opponent
   */
  public shouldMarkOpponent(
    entity: AIPlayerEntity,
    role: SoccerAIRole
  ): { shouldMark: boolean; opponent: SoccerPlayerEntity | null } {
    // Defenders and midfielders should mark nearby opponents
    if (!role.includes('back') && !role.includes('midfielder')) {
      return { shouldMark: false, opponent: null };
    }

    const opponents = entity.team === 'red'
      ? getState(entity).getBlueAITeam()
      : getState(entity).getRedAITeam();

    const currentPosition = entity.position;
    const MARKING_RANGE = 15;

    let closestOpponent: SoccerPlayerEntity | null = null;
    let closestDistance = Infinity;

    for (const opponent of opponents) {
      if (!opponent.isSpawned) continue;

      const distance = entity.distanceBetween(currentPosition, opponent.position);
      if (distance < MARKING_RANGE && distance < closestDistance) {
        closestDistance = distance;
        closestOpponent = opponent;
      }
    }

    return {
      shouldMark: closestOpponent !== null,
      opponent: closestOpponent
    };
  }

  /**
   * Calculate marking position for an opponent
   */
  public calculateMarkingPosition(
    entity: AIPlayerEntity,
    opponent: SoccerPlayerEntity,
    ballPosition: Vector3Like
  ): Vector3Like {
    const opponentPos = opponent.position;
    const goalLineX = entity.team === 'red' ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;

    // Position between opponent and own goal, slightly closer to opponent
    const goalSideRatio = 0.3; // 30% toward goal, 70% toward opponent

    return {
      x: opponentPos.x + (goalLineX - opponentPos.x) * goalSideRatio,
      y: opponentPos.y,
      z: opponentPos.z + (AI_FIELD_CENTER_Z - opponentPos.z) * 0.2
    };
  }
}
