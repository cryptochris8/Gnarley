/**
 * Physics Configuration
 *
 * Centralized physics constants for the soccer game.
 * All magic numbers related to movement, ball interactions, and gameplay physics.
 */

/**
 * Player Movement Physics
 */
export const MOVEMENT_PHYSICS = {
  /** Proportional gain for velocity control (K_p) */
  PROPORTIONAL_GAIN: 60,

  /** Maximum velocity error to prevent extreme impulses */
  MAX_VELOCITY_ERROR: 15,

  /** Damping factor for stability when no input */
  DAMPING_FACTOR: 0.98,

  /** Minimum speed threshold for applying damping */
  STABILITY_THRESHOLD: 0.05,

  /** Maximum velocity to prevent physics instability */
  MAX_VELOCITY: 20,

  /** Scale factor for velocity adjustments */
  VELOCITY_SCALE_FACTOR: 0.98,
} as const;

/**
 * Ball Interaction Physics
 */
export const BALL_PHYSICS = {
  /** Force applied when shooting the ball */
  SHOT_FORCE: 8,

  /** Force applied during tackles */
  TACKLE_FORCE: 12,

  /** Duration of tackle animation/effect in milliseconds */
  TACKLE_DURATION: 600,

  /** Minimum ball velocity to consider it "moving" */
  BALL_VELOCITY_THRESHOLD: 0.1,

  /** Interval for checking if ball is stuck (milliseconds) */
  BALL_STUCK_CHECK_INTERVAL: 2000,

  /** Time threshold for considering ball stuck (milliseconds) */
  BALL_STUCK_TIME_THRESHOLD: 3000,
} as const;

/**
 * Goalkeeper-Specific Physics
 */
export const GOALKEEPER_PHYSICS = {
  /** Range within which goalkeeper can perform headers */
  HEADER_RANGE: 3.5,

  /** Force applied during goalkeeper headers */
  HEADER_FORCE: 15,

  /** Horizontal force component for directional headers */
  HORIZONTAL_HEADER_FORCE: 3.0,

  /** Height threshold for considering ball "high" */
  HIGH_BALL_THRESHOLD: 2.0,

  /** Extra jump velocity boost for headers */
  JUMP_BOOST: 2.0,

  /** Maximum height for header opportunity */
  MAX_HEADER_HEIGHT: 4.0,
} as const;

/**
 * Power and Charging Mechanics
 */
export const POWER_MECHANICS = {
  /** Base power for charged shots (minimum) */
  BASE_CHARGE_POWER: 1.5,

  /** Maximum power for fully charged shots */
  MAX_CHARGE_POWER: 3.5,

  /** Base power for passing */
  BASE_PASS_POWER: 5.0,

  /** Power for directional passes */
  DIRECTIONAL_PASS_POWER: 5.0,
} as const;

/**
 * AI and Gameplay Mechanics
 */
export const GAMEPLAY_MECHANICS = {
  /** Optimal distance for AI passing decisions */
  OPTIMAL_PASS_DISTANCE: 12,

  /** Base score for space evaluation */
  BASE_SPACE_SCORE: 15,

  /** Interval for rotation updates (milliseconds) */
  ROTATION_UPDATE_INTERVAL: 100,

  /** Maximum number of position resets for stability */
  MAX_POSITION_RESETS: 8,

  /** Maximum resets for directional passes */
  MAX_DIRECTIONAL_PASS_RESETS: 6,

  /** Random factor for shot variation */
  SHOT_RANDOM_FACTOR: 0.3,

  /** Center Z-coordinate of goal */
  GOAL_CENTER_Z: 0,
} as const;

/**
 * Collision Detection Groups
 * Used for physics collision filtering
 */
export const COLLISION_GROUPS = {
  TERRAIN: 1,
  BLOCKS: 2,
  ENTITIES: 4,
  GOALS: 8,
} as const;

/**
 * Combined physics configuration
 * Export all configs as a single object for convenience
 */
export const PHYSICS_CONFIG = {
  MOVEMENT: MOVEMENT_PHYSICS,
  BALL: BALL_PHYSICS,
  GOALKEEPER: GOALKEEPER_PHYSICS,
  POWER: POWER_MECHANICS,
  GAMEPLAY: GAMEPLAY_MECHANICS,
  COLLISION_GROUPS,
} as const;

/**
 * Type definitions for type safety
 */
export type MovementPhysics = typeof MOVEMENT_PHYSICS;
export type BallPhysics = typeof BALL_PHYSICS;
export type GoalkeeperPhysics = typeof GOALKEEPER_PHYSICS;
export type PowerMechanics = typeof POWER_MECHANICS;
export type GameplayMechanics = typeof GAMEPLAY_MECHANICS;
export type PhysicsConfig = typeof PHYSICS_CONFIG;
