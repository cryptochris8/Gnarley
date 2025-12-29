import { type Vector3Like } from "hytopia";
import type AIPlayerEntity from "../AIPlayerEntity";
import sharedState from "../../state/sharedState";

// Helper to get correct state from entity (room or global)
const getState = (entity: AIPlayerEntity) => entity.getSharedState();
import {
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_FIELD_CENTER_X,
  AI_FIELD_CENTER_Z,
  AI_DEFENSIVE_OFFSET_X,
  AI_MIDFIELD_OFFSET_X,
  AI_FORWARD_OFFSET_X,
  AI_WIDE_Z_BOUNDARY_MIN,
  AI_WIDE_Z_BOUNDARY_MAX,
  AI_MIDFIELD_Z_BOUNDARY_MIN,
  AI_MIDFIELD_Z_BOUNDARY_MAX,
  FIELD_MIN_X,
  FIELD_MAX_X,
  FIELD_MIN_Z,
  FIELD_MAX_Z,
  SAFE_SPAWN_Y
} from '../../state/gameConfig';
import {
  type SoccerAIRole,
  ROLE_DEFINITIONS,
  POSITION_DISCIPLINE_FACTOR,
  TEAMMATE_REPULSION_DISTANCE,
  TEAMMATE_REPULSION_STRENGTH
} from './AIRoleDefinitions';

/**
 * Formation constants
 */
const BALL_ANTICIPATION_FACTOR = 1.5;
const KICKOFF_SPACING_MULTIPLIER = 2.0;
const RESTART_FORMATION_DISCIPLINE = 0.9;
const CENTER_AVOIDANCE_RADIUS = 12.0;

/**
 * Formation context
 */
export interface FormationContext {
  entity: AIPlayerEntity;
  team: "red" | "blue";
  role: SoccerAIRole;
  ballPosition: Vector3Like;
  isKickoffActive: boolean;
}

/**
 * AIFormationController - Handles team formation, positioning, and spacing
 * Manages strategic positioning based on game state and role
 */
export class AIFormationController {
  /**
   * Get the base formation position for a given role
   */
  public getRoleBasedPosition(role: SoccerAIRole, team: "red" | "blue"): Vector3Like {
    const isRed = team === 'red';
    const y = SAFE_SPAWN_Y;
    let x = 0;
    let z = 0;

    // Determine own goal line and forward direction
    const ownGoalLineX = isRed ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;
    const forwardXMultiplier = isRed ? -1 : 1;

    // Check if constants are defined
    if (ownGoalLineX === undefined || AI_FIELD_CENTER_Z === undefined ||
        AI_DEFENSIVE_OFFSET_X === undefined || AI_MIDFIELD_OFFSET_X === undefined ||
        AI_FORWARD_OFFSET_X === undefined ||
        AI_WIDE_Z_BOUNDARY_MIN === undefined || AI_WIDE_Z_BOUNDARY_MAX === undefined ||
        AI_MIDFIELD_Z_BOUNDARY_MIN === undefined || AI_MIDFIELD_Z_BOUNDARY_MAX === undefined) {
      console.error(`Missing gameConfig constants in getRoleBasedPosition for ${role}. Defaulting to origin.`);
      return { x: 0, y: SAFE_SPAWN_Y, z: 0 };
    }

    // Define standard formation positions
    switch (role) {
      case 'goalkeeper':
        x = ownGoalLineX + (1 * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z;
        break;

      case 'left-back':
        x = ownGoalLineX + (AI_DEFENSIVE_OFFSET_X * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z + (AI_WIDE_Z_BOUNDARY_MIN - AI_FIELD_CENTER_Z) * 0.6;
        break;

      case 'right-back':
        x = ownGoalLineX + (AI_DEFENSIVE_OFFSET_X * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z + (AI_WIDE_Z_BOUNDARY_MAX - AI_FIELD_CENTER_Z) * 0.6;
        break;

      case 'central-midfielder-1':
        x = ownGoalLineX + (AI_MIDFIELD_OFFSET_X * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z + (AI_MIDFIELD_Z_BOUNDARY_MIN - AI_FIELD_CENTER_Z) * 0.5;
        break;

      case 'central-midfielder-2':
        x = ownGoalLineX + (AI_MIDFIELD_OFFSET_X * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z + (AI_MIDFIELD_Z_BOUNDARY_MAX - AI_FIELD_CENTER_Z) * 0.5;
        break;

      case 'striker':
        x = ownGoalLineX + (AI_FORWARD_OFFSET_X * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z;
        break;

      default:
        console.warn(`Unknown role '${role}' in getRoleBasedPosition. Using default midfield position.`);
        x = ownGoalLineX + (AI_MIDFIELD_OFFSET_X * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z;
    }

    // Check for NaN results
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      console.error(`Calculated NaN position for role ${role}, team ${team}. Defaulting to origin.`);
      return { x: 0, y: SAFE_SPAWN_Y, z: 0 };
    }

    return { x, y, z };
  }

  /**
   * Calculate enhanced kickoff position with proper spacing
   */
  public calculateKickoffPosition(
    context: FormationContext,
    entity: AIPlayerEntity
  ): Vector3Like {
    const { role, team, ballPosition } = context;

    // Get base formation position
    const formationPosition = this.getRoleBasedPosition(role, team);

    // Enhanced spacing to prevent center-field clustering
    const spreadFactor = KICKOFF_SPACING_MULTIPLIER;
    const teamDirectionX = team === "red" ? -1 : 1;

    // Calculate distance from field center
    const distanceFromCenter = this.distanceBetween(formationPosition,
      { x: AI_FIELD_CENTER_X, y: formationPosition.y, z: AI_FIELD_CENTER_Z });

    // Apply center avoidance
    let centerAvoidanceX = 0;
    let centerAvoidanceZ = 0;

    if (distanceFromCenter < CENTER_AVOIDANCE_RADIUS) {
      const awayFromCenterX = formationPosition.x - AI_FIELD_CENTER_X;
      const awayFromCenterZ = formationPosition.z - AI_FIELD_CENTER_Z;
      const awayLength = Math.sqrt(awayFromCenterX * awayFromCenterX + awayFromCenterZ * awayFromCenterZ);

      if (awayLength > 0.1) {
        const pushFactor = (CENTER_AVOIDANCE_RADIUS - distanceFromCenter) / CENTER_AVOIDANCE_RADIUS;
        centerAvoidanceX = (awayFromCenterX / awayLength) * pushFactor * 8;
        centerAvoidanceZ = (awayFromCenterZ / awayLength) * pushFactor * 8;
      }
    }

    // Start with formation position and apply avoidance
    let kickoffPosition = {
      x: formationPosition.x + centerAvoidanceX,
      y: formationPosition.y,
      z: formationPosition.z + centerAvoidanceZ
    };

    // Apply role-specific positioning
    const disciplineFactor = POSITION_DISCIPLINE_FACTOR[role];

    if (role.includes('midfielder')) {
      const lateralSeparation = role === 'central-midfielder-1' ? -8 : 8;
      kickoffPosition.z += lateralSeparation * spreadFactor * disciplineFactor;
      kickoffPosition.x += teamDirectionX * -3 * spreadFactor;
    } else if (role === 'striker') {
      kickoffPosition.x += teamDirectionX * 8 * spreadFactor;
      kickoffPosition.z += ((Math.random() - 0.5) * 6);
    } else if (role === 'left-back') {
      kickoffPosition.x += teamDirectionX * -2 * spreadFactor;
      kickoffPosition.z -= 10 * spreadFactor * disciplineFactor;
    } else if (role === 'right-back') {
      kickoffPosition.x += teamDirectionX * -2 * spreadFactor;
      kickoffPosition.z += 10 * spreadFactor * disciplineFactor;
    } else if (role === 'goalkeeper') {
      kickoffPosition = formationPosition; // Minimal change
    }

    // Apply formation discipline
    const disciplineVariation = (1.0 - RESTART_FORMATION_DISCIPLINE);
    const randomOffset = {
      x: (Math.random() - 0.5) * disciplineVariation * 3,
      y: 0,
      z: (Math.random() - 0.5) * disciplineVariation * 3
    };

    // Final position with constraints
    let finalPosition = {
      x: kickoffPosition.x + randomOffset.x,
      y: kickoffPosition.y,
      z: kickoffPosition.z + randomOffset.z
    };

    // Ensure position stays within field boundaries
    finalPosition = this.constrainToPreferredArea(finalPosition, role, team);

    // Apply enhanced spacing
    finalPosition = this.adjustPositionForSpacing(entity, finalPosition);

    return finalPosition;
  }

  /**
   * Adjust position to maintain spacing between teammates
   */
  public adjustPositionForSpacing(
    entity: AIPlayerEntity,
    targetPos: Vector3Like
  ): Vector3Like {
    const teammates = entity.team === 'red'
      ? getState(entity).getRedAITeam()
      : getState(entity).getBlueAITeam();

    let adjustedX = targetPos.x;
    let adjustedZ = targetPos.z;

    // Repulsion from nearby teammates
    for (const teammate of teammates) {
      if (teammate === entity || !teammate.isSpawned) continue;

      const dx = targetPos.x - teammate.position.x;
      const dz = targetPos.z - teammate.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < TEAMMATE_REPULSION_DISTANCE && distance > 0.1) {
        const repulsionForce = TEAMMATE_REPULSION_STRENGTH *
                              (1 - distance / TEAMMATE_REPULSION_DISTANCE);
        adjustedX += (dx / distance) * repulsionForce;
        adjustedZ += (dz / distance) * repulsionForce;
      }
    }

    return { x: adjustedX, y: targetPos.y, z: adjustedZ };
  }

  /**
   * Check if a position is within a role's preferred area
   */
  public isPositionInPreferredArea(
    position: Vector3Like,
    role: SoccerAIRole,
    team: "red" | "blue"
  ): boolean {
    const roleDefinition = ROLE_DEFINITIONS[role];
    if (!roleDefinition) return true;

    const ownGoalLineX = team === 'red' ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;
    const forwardXMultiplier = team === 'red' ? -1 : 1;

    // Calculate role's area boundaries
    const minX = ownGoalLineX + (roleDefinition.minX * forwardXMultiplier);
    const maxX = ownGoalLineX + (roleDefinition.maxX * forwardXMultiplier);
    const minZ = AI_FIELD_CENTER_Z + roleDefinition.minZ;
    const maxZ = AI_FIELD_CENTER_Z + roleDefinition.maxZ;

    // Check if position is within boundaries
    const withinX = team === 'red'
      ? (position.x <= Math.max(minX, maxX) && position.x >= Math.min(minX, maxX))
      : (position.x >= Math.min(minX, maxX) && position.x <= Math.max(minX, maxX));
    const withinZ = position.z >= minZ && position.z <= maxZ;

    return withinX && withinZ;
  }

  /**
   * Constrain a position to a role's preferred area
   */
  public constrainToPreferredArea(
    position: Vector3Like,
    role: SoccerAIRole,
    team: "red" | "blue"
  ): Vector3Like {
    const roleDefinition = ROLE_DEFINITIONS[role];
    if (!roleDefinition) {
      // No role definition, just constrain to field boundaries
      return this.constrainToFieldBoundaries(position);
    }

    const ownGoalLineX = team === 'red' ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;
    const forwardXMultiplier = team === 'red' ? -1 : 1;

    // Calculate role's area boundaries
    const minX = ownGoalLineX + (roleDefinition.minX * forwardXMultiplier);
    const maxX = ownGoalLineX + (roleDefinition.maxX * forwardXMultiplier);
    const minZ = AI_FIELD_CENTER_Z + roleDefinition.minZ;
    const maxZ = AI_FIELD_CENTER_Z + roleDefinition.maxZ;

    // Constrain to role area
    let constrainedX = position.x;
    let constrainedZ = position.z;

    if (team === 'red') {
      constrainedX = Math.max(Math.min(minX, maxX), Math.min(Math.max(minX, maxX), position.x));
    } else {
      constrainedX = Math.min(Math.max(minX, maxX), Math.max(Math.min(minX, maxX), position.x));
    }

    constrainedZ = Math.max(minZ, Math.min(maxZ, position.z));

    // Also constrain to field boundaries
    return this.constrainToFieldBoundaries({
      x: constrainedX,
      y: position.y,
      z: constrainedZ
    });
  }

  /**
   * Constrain position to field boundaries
   */
  private constrainToFieldBoundaries(position: Vector3Like): Vector3Like {
    const safetyMargin = 2;

    return {
      x: Math.max(FIELD_MIN_X + safetyMargin, Math.min(FIELD_MAX_X - safetyMargin, position.x)),
      y: position.y,
      z: Math.max(FIELD_MIN_Z + safetyMargin, Math.min(FIELD_MAX_Z - safetyMargin, position.z))
    };
  }

  /**
   * Calculate support position for teammate with ball
   */
  public calculateTeammateSupportPosition(
    entity: AIPlayerEntity,
    ballCarrierPosition: Vector3Like,
    role: SoccerAIRole,
    team: "red" | "blue"
  ): Vector3Like {
    const formationPosition = this.getRoleBasedPosition(role, team);
    const forwardDir = team === 'red' ? 1 : -1;

    let supportPos = { ...formationPosition };

    if (role === 'striker') {
      // Striker moves ahead to provide forward pass option
      supportPos.x += forwardDir * 10;
      supportPos.z += (Math.random() > 0.5 ? 5 : -5);
    } else if (role.includes('midfielder')) {
      // Midfielders provide wide passing options
      supportPos.x += forwardDir * 5;
      supportPos.z += (role === 'central-midfielder-1' ? -8 : 8);
    } else if (role.includes('back')) {
      // Defenders move up slightly but maintain defensive shape
      supportPos.x += forwardDir * 3;
    }

    return this.adjustPositionForSpacing(entity, supportPos);
  }

  /**
   * Calculate dynamic formation position based on ball position
   */
  public calculateDynamicFormationPosition(
    entity: AIPlayerEntity,
    ballPosition: Vector3Like,
    role: SoccerAIRole,
    team: "red" | "blue"
  ): Vector3Like {
    const basePosition = this.getRoleBasedPosition(role, team);
    const roleDefinition = ROLE_DEFINITIONS[role];

    if (!roleDefinition) return basePosition;

    // Apply ball attraction/avoidance based on role
    const ballAttractionFactor = roleDefinition.ballAttractionStrength || 0;

    if (ballAttractionFactor > 0) {
      // Move toward ball based on attraction factor
      const toBallX = (ballPosition.x - basePosition.x) * ballAttractionFactor;
      const toBallZ = (ballPosition.z - basePosition.z) * ballAttractionFactor;

      const dynamicPosition = {
        x: basePosition.x + toBallX,
        y: basePosition.y,
        z: basePosition.z + toBallZ
      };

      return this.constrainToPreferredArea(dynamicPosition, role, team);
    }

    return basePosition;
  }

  /**
   * Calculate distance between two positions
   */
  private distanceBetween(pos1: Vector3Like, pos2: Vector3Like): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Get all formation positions for a team
   */
  public getTeamFormation(team: "red" | "blue"): Map<SoccerAIRole, Vector3Like> {
    const formation = new Map<SoccerAIRole, Vector3Like>();
    const roles: SoccerAIRole[] = [
      'goalkeeper',
      'left-back',
      'right-back',
      'central-midfielder-1',
      'central-midfielder-2',
      'striker'
    ];

    for (const role of roles) {
      formation.set(role, this.getRoleBasedPosition(role, team));
    }

    return formation;
  }

  /**
   * Check if team is maintaining formation shape
   */
  public isFormationMaintained(
    team: "red" | "blue",
    toleranceDistance: number = 10
  ): boolean {
    const teamPlayers = team === 'red'
      ? getState(entity).getRedAITeam()
      : getState(entity).getBlueAITeam();

    for (const player of teamPlayers) {
      if (!player.isSpawned) continue;

      const expectedPosition = this.getRoleBasedPosition(
        (player as any).aiRole,
        team
      );

      const distance = this.distanceBetween(player.position, expectedPosition);

      if (distance > toleranceDistance) {
        return false;
      }
    }

    return true;
  }
}
