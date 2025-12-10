/**
 * PassCalculator
 *
 * Utility for calculating optimal pass trajectories and lead positions.
 * Handles prediction of teammate movement and safety margins.
 */

import type { Vector3Like } from "hytopia";

export interface PassConfig {
  /** Base speed of passes (units per second) */
  passSpeed?: number;
  /** Whether this is for a goalkeeper (uses different safety margins) */
  isGoalkeeper?: boolean;
}

export class PassCalculator {
  /** Default pass speed (reduced for better accuracy) */
  private static readonly DEFAULT_PASS_SPEED = 2.8;

  /** Safety margin thresholds for different distances */
  private static readonly DISTANCE_THRESHOLDS = {
    SHORT: 10,  // Distance considered "short"
    LONG: 20,   // Distance considered "long"
  };

  /** Safety margins for field players */
  private static readonly FIELD_PLAYER_MARGINS = {
    SHORT: 0.5,  // Minimal margin for short passes
    MEDIUM: 0.8, // Base safety margin
    LONG: 1.2,   // More margin for long passes
  };

  /** Safety margins for goalkeepers (slightly larger for safety) */
  private static readonly GOALKEEPER_MARGINS = {
    SHORT: 0.6,  // Short distribution precision
    MEDIUM: 1.0, // Base margin
    LONG: 1.5,   // Long distribution margin
  };

  /**
   * Calculates the travel time for a pass
   * @param distance - Distance to target
   * @param passSpeed - Speed of the pass (defaults to 2.8)
   * @returns Travel time in seconds
   */
  public static calculatePassTravelTime(
    distance: number,
    passSpeed: number = PassCalculator.DEFAULT_PASS_SPEED
  ): number {
    return distance / passSpeed;
  }

  /**
   * Predicts where a teammate will be when the ball arrives
   * @param currentPosition - Teammate's current position
   * @param velocity - Teammate's velocity vector
   * @param passTravelTime - Time it takes for pass to arrive
   * @returns Predicted position
   */
  public static predictTeammatePosition(
    currentPosition: Vector3Like,
    velocity: Vector3Like,
    passTravelTime: number
  ): Vector3Like {
    return {
      x: currentPosition.x + (velocity.x * passTravelTime),
      y: currentPosition.y,
      z: currentPosition.z + (velocity.z * passTravelTime),
    };
  }

  /**
   * Calculates safety margin based on pass distance
   * @param distance - Distance to teammate
   * @param isGoalkeeper - Whether the passer is a goalkeeper
   * @returns Safety margin value
   */
  public static calculateSafetyMargin(
    distance: number,
    isGoalkeeper: boolean = false
  ): number {
    const margins = isGoalkeeper
      ? PassCalculator.GOALKEEPER_MARGINS
      : PassCalculator.FIELD_PLAYER_MARGINS;

    if (distance < PassCalculator.DISTANCE_THRESHOLDS.SHORT) {
      return margins.SHORT;
    } else if (distance > PassCalculator.DISTANCE_THRESHOLDS.LONG) {
      return margins.LONG;
    }

    return margins.MEDIUM;
  }

  /**
   * Calculates the optimal lead position for a pass
   * @param targetPosition - Target's current position
   * @param targetVelocity - Target's velocity vector
   * @param passSpeed - Speed of the pass
   * @param distance - Distance to target
   * @param config - Optional configuration
   * @returns Lead position with safety margin applied
   */
  public static calculateLeadPosition(
    targetPosition: Vector3Like,
    targetVelocity: Vector3Like,
    passSpeed: number,
    distance: number,
    config: PassConfig = {}
  ): Vector3Like {
    const {
      passSpeed: configPassSpeed = PassCalculator.DEFAULT_PASS_SPEED,
      isGoalkeeper = false,
    } = config;

    const actualPassSpeed = passSpeed || configPassSpeed;

    // Calculate pass travel time
    const passTravelTime = PassCalculator.calculatePassTravelTime(distance, actualPassSpeed);

    // Predict where teammate will be when ball arrives
    const predictedPosition = PassCalculator.predictTeammatePosition(
      targetPosition,
      targetVelocity,
      passTravelTime
    );

    // Calculate safety margin
    const safetyMargin = PassCalculator.calculateSafetyMargin(distance, isGoalkeeper);

    // Apply safety margin in direction of movement
    const velocityMagnitude = Math.sqrt(
      targetVelocity.x * targetVelocity.x + targetVelocity.z * targetVelocity.z
    );

    if (velocityMagnitude > 0.1) {
      // Teammate is moving, apply margin in movement direction
      const normalizedVelocity = {
        x: targetVelocity.x / velocityMagnitude,
        z: targetVelocity.z / velocityMagnitude,
      };

      return {
        x: predictedPosition.x + (normalizedVelocity.x * safetyMargin),
        y: predictedPosition.y,
        z: predictedPosition.z + (normalizedVelocity.z * safetyMargin),
      };
    }

    // Teammate is stationary, return predicted position without margin
    return predictedPosition;
  }

  /**
   * Validates if a pass target position is reasonable
   * @param passPosition - The target pass position
   * @param fieldBounds - Optional field boundary constraints
   * @returns Whether the pass position is valid
   */
  public static isValidPassPosition(
    passPosition: Vector3Like,
    fieldBounds?: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }
  ): boolean {
    if (!fieldBounds) {
      return true;
    }

    return (
      passPosition.x >= fieldBounds.minX &&
      passPosition.x <= fieldBounds.maxX &&
      passPosition.z >= fieldBounds.minZ &&
      passPosition.z <= fieldBounds.maxZ
    );
  }

  /**
   * Calculates the optimal pass direction vector
   * @param passerPosition - Position of the passer
   * @param leadPosition - Target lead position
   * @returns Normalized direction vector
   */
  public static calculatePassDirection(
    passerPosition: Vector3Like,
    leadPosition: Vector3Like
  ): { x: number; z: number; distance: number } {
    const dx = leadPosition.x - passerPosition.x;
    const dz = leadPosition.z - passerPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance === 0) {
      return { x: 0, z: 0, distance: 0 };
    }

    return {
      x: dx / distance,
      z: dz / distance,
      distance,
    };
  }
}
