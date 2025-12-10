/**
 * AI Role Definitions and Constants
 *
 * Defines all soccer position roles, their characteristics, and behavioral constants.
 * Extracted from AIPlayerEntity.ts to improve modularity and reusability.
 */

// Define the specific roles for the 6v6 setup
export type SoccerAIRole =
  | "goalkeeper"
  | "left-back"
  | "right-back"
  | "central-midfielder-1"
  | "central-midfielder-2"
  | "striker";

/**
 * Enhanced role definitions based on detailed soccer position descriptions
 * These will help guide AI behavior to better match real soccer positions
 */
export interface RoleDefinition {
  name: string; // Human-readable name
  description: string; // Brief description of the role
  primaryDuties: string[]; // Main responsibilities
  defensiveContribution: number; // 0-10 scale, how much they focus on defense
  offensiveContribution: number; // 0-10 scale, how much they focus on offense
  preferredArea: {
    // Areas of the field they prefer to operate in
    minX: number; // Minimum X value (closest to own goal)
    maxX: number; // Maximum X value (furthest from own goal)
    minZ: number; // Minimum Z value (left side of field)
    maxZ: number; // Maximum Z value (right side of field)
  };
  pursuitTendency: number; // 0-1 probability scale for pursuing the ball
  positionRecoverySpeed: number; // 0-1 scale, how quickly they return to position
  supportDistance: number; // How close they stay to teammates with the ball
  interceptDistance: number; // How far they'll move to intercept passes
}

// Define role characteristics for each position to guide AI behavior
export const ROLE_DEFINITIONS: Record<SoccerAIRole, RoleDefinition> = {
  goalkeeper: {
    name: "Goalkeeper",
    description: "Defends the goal, organizes defense, initiates counterattacks",
    primaryDuties: ["Block shots on goal", "Command defensive line", "Distribute ball after saves"],
    defensiveContribution: 10,
    offensiveContribution: 1,
    preferredArea: {
      minX: -12,
      maxX: 12,
      minZ: -15,
      maxZ: 9,
    },
    pursuitTendency: 0.7,
    positionRecoverySpeed: 1.2,
    supportDistance: 0.5,
    interceptDistance: 18,
  },
  "left-back": {
    name: "Left Back",
    description: "Defends left flank, supports attacks down left side",
    primaryDuties: [
      "Defend against opposition right winger",
      "Support midfield in build-up play",
      "Provide width in attack occasionally",
    ],
    defensiveContribution: 8,
    offensiveContribution: 5,
    preferredArea: {
      minX: -40, // EXPANDED from -25 to cover full field width
      maxX: 55, // EXPANDED from 30 to cover full field length
      minZ: -35, // EXPANDED from -30 to cover outer boundary
      maxZ: -5, // EXPANDED from -8 to cover more area
    },
    pursuitTendency: 0.7, // INCREASED from 0.6 for better ball pursuit
    positionRecoverySpeed: 0.7,
    supportDistance: 18,
    interceptDistance: 15,
  },
  "right-back": {
    name: "Right Back",
    description: "Defends right flank, supports attacks down right side",
    primaryDuties: [
      "Defend against opposition left winger",
      "Support midfield in build-up play",
      "Provide width in attack occasionally",
    ],
    defensiveContribution: 8,
    offensiveContribution: 5,
    preferredArea: {
      minX: -40, // EXPANDED from -25 to cover full field width
      maxX: 55, // EXPANDED from 30 to cover full field length
      minZ: -1, // EXPANDED from 2 to cover more area
      maxZ: 30, // EXPANDED from 23 to cover outer boundary
    },
    pursuitTendency: 0.7, // INCREASED from 0.6 for better ball pursuit
    positionRecoverySpeed: 0.7,
    supportDistance: 18,
    interceptDistance: 15,
  },
  "central-midfielder-1": {
    name: "Left Central Midfielder",
    description: "Controls central areas, links defense to attack on left side",
    primaryDuties: [
      "Link defense to attack",
      "Control central area of pitch",
      "Support both defensive and offensive phases",
    ],
    defensiveContribution: 6,
    offensiveContribution: 7,
    preferredArea: {
      minX: -40, // EXPANDED from -20 to cover full field width
      maxX: 55, // EXPANDED from 35 to cover full field length
      minZ: -25, // EXPANDED from -20 to cover more area
      maxZ: 8, // EXPANDED from 5 to cover more area
    },
    pursuitTendency: 0.85, // INCREASED from 0.75 for aggressive ball pursuit
    positionRecoverySpeed: 0.6,
    supportDistance: 22,
    interceptDistance: 18,
  },
  "central-midfielder-2": {
    name: "Right Central Midfielder",
    description: "Controls central areas, links defense to attack on right side",
    primaryDuties: [
      "Link defense to attack",
      "Control central area of pitch",
      "Support both defensive and offensive phases",
    ],
    defensiveContribution: 6,
    offensiveContribution: 7,
    preferredArea: {
      minX: -40, // EXPANDED from -20 to cover full field width
      maxX: 55, // EXPANDED from 35 to cover full field length
      minZ: -14, // EXPANDED from -11 to cover more area
      maxZ: 25, // EXPANDED from 20 to cover more area
    },
    pursuitTendency: 0.85, // INCREASED from 0.75 for aggressive ball pursuit
    positionRecoverySpeed: 0.6,
    supportDistance: 22,
    interceptDistance: 18,
  },
  striker: {
    name: "Striker",
    description: "Main goal threat, leads pressing, creates space for others",
    primaryDuties: [
      "Score goals",
      "Hold up play",
      "Press opposition defenders",
      "Create space for midfielders",
    ],
    defensiveContribution: 3,
    offensiveContribution: 10,
    preferredArea: {
      minX: -40, // EXPANDED from -10 to cover full field width
      maxX: 55, // EXPANDED from 45 to cover full field length
      minZ: -30, // EXPANDED from -18 to cover more area
      maxZ: 25, // EXPANDED from 12 to cover more area
    },
    pursuitTendency: 0.95, // INCREASED from 0.85 for most aggressive ball pursuit
    positionRecoverySpeed: 0.5,
    supportDistance: 20,
    interceptDistance: 15,
  },
};

// ===================================================================
// AI BEHAVIOR CONSTANTS
// ===================================================================

// Teammate spacing and interaction
export const TEAMMATE_REPULSION_DISTANCE = 9.0;
export const TEAMMATE_REPULSION_STRENGTH = 0.8;
export const BALL_ANTICIPATION_FACTOR = 1.5;

// Position discipline - how strongly players stick to their positions
export const POSITION_DISCIPLINE_FACTOR: Record<SoccerAIRole, number> = {
  goalkeeper: 0.95,
  "left-back": 0.8,
  "right-back": 0.8,
  "central-midfielder-1": 0.6,
  "central-midfielder-2": 0.6,
  striker: 0.5,
};

// Pursuit distances by role
export const GOALKEEPER_PURSUIT_DISTANCE = 8.0;
export const DEFENDER_PURSUIT_DISTANCE = 20.0;
export const MIDFIELDER_PURSUIT_DISTANCE = 25.0;
export const STRIKER_PURSUIT_DISTANCE = 30.0;

// Pursuit probabilities by role
export const ROLE_PURSUIT_PROBABILITY: Record<SoccerAIRole, number> = {
  goalkeeper: 0.15,
  "left-back": 0.3,
  "right-back": 0.3,
  "central-midfielder-1": 0.4,
  "central-midfielder-2": 0.4,
  striker: 0.5,
};

// Position recovery speeds
export const POSITION_RECOVERY_MULTIPLIER: Record<SoccerAIRole, number> = {
  goalkeeper: 1.5,
  "left-back": 1.4,
  "right-back": 1.4,
  "central-midfielder-1": 1.3,
  "central-midfielder-2": 1.3,
  striker: 1.2,
};

// Formation spacing during kickoffs and restarts
export const KICKOFF_SPACING_MULTIPLIER = 2.0;
export const RESTART_FORMATION_DISCIPLINE = 0.9;
export const CENTER_AVOIDANCE_RADIUS = 12.0;

// Shot and pass physics constants
export const SHOT_ARC_FACTOR = 0.3;
export const PASS_ARC_FACTOR = 0.05;
export const PASS_FORCE = 2.8;
export const SHOT_FORCE = 2.2;

/**
 * Get pursuit distance for a specific role
 */
export function getPursuitDistanceForRole(role: SoccerAIRole): number {
  switch (role) {
    case "goalkeeper":
      return GOALKEEPER_PURSUIT_DISTANCE;
    case "left-back":
    case "right-back":
      return DEFENDER_PURSUIT_DISTANCE;
    case "central-midfielder-1":
    case "central-midfielder-2":
      return MIDFIELDER_PURSUIT_DISTANCE;
    case "striker":
      return STRIKER_PURSUIT_DISTANCE;
  }
}
