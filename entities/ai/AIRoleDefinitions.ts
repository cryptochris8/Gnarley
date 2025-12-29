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
// PRO SOCCER SETTINGS: Players can push forward during attacks while maintaining defensive shape
export const ROLE_DEFINITIONS: Record<SoccerAIRole, RoleDefinition> = {
  goalkeeper: {
    name: "Goalkeeper",
    description: "Defends the goal, organizes defense, initiates counterattacks",
    primaryDuties: ["Block shots on goal", "Command defensive line", "Distribute ball after saves"],
    defensiveContribution: 10,
    offensiveContribution: 1,
    preferredArea: {
      minX: -10,  // Goal box area
      maxX: 10,
      minZ: -15,
      maxZ: 8,
    },
    pursuitTendency: 0.3,
    positionRecoverySpeed: 1.5,
    supportDistance: 12,
    interceptDistance: 12,
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
      minX: -20,  // Can drop deep in defense
      maxX: 35,   // Can overlap into attacking third during attacks
      minZ: -30,  // Left side of field
      maxZ: 0,    // Can come inside slightly
    },
    pursuitTendency: 0.4,
    positionRecoverySpeed: 0.9,
    supportDistance: 25,
    interceptDistance: 12,
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
      minX: -20,  // Can drop deep in defense
      maxX: 35,   // Can overlap into attacking third during attacks
      minZ: -5,   // Can come inside slightly
      maxZ: 24,   // Right side of field
    },
    pursuitTendency: 0.4,
    positionRecoverySpeed: 0.9,
    supportDistance: 25,
    interceptDistance: 12,
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
      minX: -15,  // Can drop back to help defense
      maxX: 42,   // Can push into penalty area during attacks
      minZ: -25,  // Left-center of field
      maxZ: 10,   // Can drift central
    },
    pursuitTendency: 0.5,
    positionRecoverySpeed: 0.8,
    supportDistance: 30,
    interceptDistance: 15,
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
      minX: -15,  // Can drop back to help defense
      maxX: 42,   // Can push into penalty area during attacks
      minZ: -15,  // Can drift central
      maxZ: 20,   // Right-center of field
    },
    pursuitTendency: 0.5,
    positionRecoverySpeed: 0.8,
    supportDistance: 30,
    interceptDistance: 15,
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
      minX: -5,   // Can drop to midfield to link play
      maxX: 48,   // Right up to opponent goal
      minZ: -22,  // Full width in attacking third
      maxZ: 16,   // Full width in attacking third
    },
    pursuitTendency: 0.6,
    positionRecoverySpeed: 0.7,
    supportDistance: 28,
    interceptDistance: 12,
  },
};

// ===================================================================
// AI BEHAVIOR CONSTANTS - PRO SOCCER MODE
// ===================================================================

// Teammate spacing and interaction - INCREASED for better spacing
export const TEAMMATE_REPULSION_DISTANCE = 14.0;  // Was 9.0 - more spacing between players
export const TEAMMATE_REPULSION_STRENGTH = 1.2;   // Was 0.8 - stronger repulsion
export const BALL_ANTICIPATION_FACTOR = 1.0;      // Was 1.5 - less anticipation = more positional play

// Position discipline - how strongly players stick to their positions
// INCREASED ALL VALUES for more structured play
export const POSITION_DISCIPLINE_FACTOR: Record<SoccerAIRole, number> = {
  goalkeeper: 0.98,    // Was 0.95 - almost never leaves zone
  "left-back": 0.90,   // Was 0.8 - stay in defensive position
  "right-back": 0.90,  // Was 0.8 - stay in defensive position
  "central-midfielder-1": 0.80,  // Was 0.6 - hold midfield better
  "central-midfielder-2": 0.80,  // Was 0.6 - hold midfield better
  striker: 0.70,       // Was 0.5 - stay forward, wait for passes
};

// Pursuit distances by role - REDUCED to keep players in zones
export const GOALKEEPER_PURSUIT_DISTANCE = 6.0;    // Was 8.0 - stay in goal
export const DEFENDER_PURSUIT_DISTANCE = 12.0;     // Was 20.0 - don't chase into midfield
export const MIDFIELDER_PURSUIT_DISTANCE = 15.0;   // Was 25.0 - hold midfield line
export const STRIKER_PURSUIT_DISTANCE = 18.0;      // Was 30.0 - don't track back too far

// Pursuit probabilities by role - REDUCED to encourage passing over chasing
export const ROLE_PURSUIT_PROBABILITY: Record<SoccerAIRole, number> = {
  goalkeeper: 0.10,    // Was 0.15 - rarely chase
  "left-back": 0.20,   // Was 0.3 - stay in position
  "right-back": 0.20,  // Was 0.3 - stay in position
  "central-midfielder-1": 0.30,  // Was 0.4 - more passing less chasing
  "central-midfielder-2": 0.30,  // Was 0.4 - more passing less chasing
  striker: 0.35,       // Was 0.5 - stay forward for outlet passes
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
export const SHOT_ARC_FACTOR = 0.08;   // Low arc for driven shots (reduced from 0.20 - shots were going over goal)
export const PASS_ARC_FACTOR = 0.03;   // Flat passes
export const PASS_FORCE = 3.5;         // Balanced pass power (human range: 2.5-4.5)
export const SHOT_FORCE = 4.0;         // INCREASED to match human player power (human range: 1.5-5.0)

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
