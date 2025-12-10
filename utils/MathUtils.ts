/**
 * MathUtils
 *
 * Optimized mathematical utilities for game performance.
 * Focuses on avoiding expensive operations like Math.sqrt() when possible.
 *
 * Performance Benefits:
 * - Squared distance calculations avoid Math.sqrt() (~10x faster)
 * - Use squared distances for comparisons and thresholds
 * - Only calculate actual distance when absolutely necessary
 */

import type { Vector3Like } from "hytopia";

/**
 * Calculate squared distance between two 3D points
 * Use this for distance comparisons instead of actual distance
 *
 * @param a - First position
 * @param b - Second position
 * @returns Squared distance (no sqrt, much faster)
 *
 * @example
 * // Instead of: distance < threshold
 * // Use: distanceSquared < (threshold * threshold)
 * const distSq = MathUtils.distanceSquared(playerPos, ballPos);
 * if (distSq < 25) { // 25 = 5 * 5
 *   // Player is within 5 units of ball
 * }
 */
export function distanceSquared(a: Vector3Like, b: Vector3Like): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Calculate squared distance between two points (2D, ignoring Y)
 * Useful for horizontal distance checks on a flat playing field
 *
 * @param a - First position
 * @param b - Second position
 * @returns Squared horizontal distance (no sqrt, much faster)
 */
export function distanceSquaredXZ(a: Vector3Like, b: Vector3Like): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * Calculate actual distance between two 3D points
 * Only use when you need the actual distance value
 * For comparisons, use distanceSquared instead
 *
 * @param a - First position
 * @param b - Second position
 * @returns Actual distance (uses Math.sqrt, slower)
 */
export function distance(a: Vector3Like, b: Vector3Like): number {
  return Math.sqrt(distanceSquared(a, b));
}

/**
 * Calculate actual horizontal distance between two points (2D)
 * Only use when you need the actual distance value
 *
 * @param a - First position
 * @param b - Second position
 * @returns Actual horizontal distance
 */
export function distanceXZ(a: Vector3Like, b: Vector3Like): number {
  return Math.sqrt(distanceSquaredXZ(a, b));
}

/**
 * Check if point A is within a certain distance of point B
 * Uses squared distance for performance
 *
 * @param a - First position
 * @param b - Second position
 * @param threshold - Maximum distance
 * @returns True if within threshold distance
 */
export function isWithinDistance(
  a: Vector3Like,
  b: Vector3Like,
  threshold: number
): boolean {
  const thresholdSq = threshold * threshold;
  return distanceSquared(a, b) <= thresholdSq;
}

/**
 * Check if point A is within a certain horizontal distance of point B
 * Uses squared distance for performance, ignores Y axis
 *
 * @param a - First position
 * @param b - Second position
 * @param threshold - Maximum horizontal distance
 * @returns True if within threshold distance (XZ plane)
 */
export function isWithinDistanceXZ(
  a: Vector3Like,
  b: Vector3Like,
  threshold: number
): boolean {
  const thresholdSq = threshold * threshold;
  return distanceSquaredXZ(a, b) <= thresholdSq;
}

/**
 * Find the closest entity to a target position
 * Uses squared distances for performance
 *
 * @param target - Target position
 * @param candidates - Array of entities with positions
 * @returns Closest entity or null if array is empty
 */
export function findClosest<T extends { position: Vector3Like }>(
  target: Vector3Like,
  candidates: T[]
): T | null {
  if (candidates.length === 0) {
    return null;
  }

  let closest: T = candidates[0];
  let closestDistSq = distanceSquared(target, candidates[0].position);

  for (let i = 1; i < candidates.length; i++) {
    const distSq = distanceSquared(target, candidates[i].position);
    if (distSq < closestDistSq) {
      closestDistSq = distSq;
      closest = candidates[i];
    }
  }

  return closest;
}

/**
 * Find all entities within a certain radius of a target position
 * Uses squared distances for performance
 *
 * @param target - Target position
 * @param candidates - Array of entities with positions
 * @param radius - Search radius
 * @returns Array of entities within radius
 */
export function findWithinRadius<T extends { position: Vector3Like }>(
  target: Vector3Like,
  candidates: T[],
  radius: number
): T[] {
  const radiusSq = radius * radius;
  const result: T[] = [];

  for (const candidate of candidates) {
    if (distanceSquared(target, candidate.position) <= radiusSq) {
      result.push(candidate);
    }
  }

  return result;
}

/**
 * Calculate normalized direction vector from A to B
 *
 * @param from - Start position
 * @param to - End position
 * @returns Normalized direction vector
 */
export function directionTo(from: Vector3Like, to: Vector3Like): Vector3Like {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;

  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: dx / length,
    y: dy / length,
    z: dz / length
  };
}

/**
 * Clamp a value between min and max
 *
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values
 *
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Linear interpolation between two 3D points
 *
 * @param a - Start position
 * @param b - End position
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated position
 */
export function lerpVector(a: Vector3Like, b: Vector3Like, t: number): Vector3Like {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t)
  };
}

/**
 * Calculate dot product of two 3D vectors
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Dot product
 */
export function dot(a: Vector3Like, b: Vector3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Calculate magnitude (length) of a vector
 *
 * @param v - Vector
 * @returns Magnitude
 */
export function magnitude(v: Vector3Like): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Calculate squared magnitude (length squared) of a vector
 * Use this for length comparisons to avoid sqrt
 *
 * @param v - Vector
 * @returns Squared magnitude
 */
export function magnitudeSquared(v: Vector3Like): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

/**
 * Normalize a vector (make it length 1)
 *
 * @param v - Vector to normalize
 * @returns Normalized vector
 */
export function normalize(v: Vector3Like): Vector3Like {
  const mag = magnitude(v);
  if (mag === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: v.x / mag,
    y: v.y / mag,
    z: v.z / mag
  };
}

/**
 * Convert squared distance to actual distance
 * Only use when you have a squared distance and need the actual value
 *
 * @param distanceSquared - Squared distance
 * @returns Actual distance
 */
export function sqrtDistance(distanceSquared: number): number {
  return Math.sqrt(distanceSquared);
}

// Namespace export for convenient usage
export const MathUtils = {
  distanceSquared,
  distanceSquaredXZ,
  distance,
  distanceXZ,
  isWithinDistance,
  isWithinDistanceXZ,
  findClosest,
  findWithinRadius,
  directionTo,
  clamp,
  lerp,
  lerpVector,
  dot,
  magnitude,
  magnitudeSquared,
  normalize,
  sqrtDistance
};

export default MathUtils;
