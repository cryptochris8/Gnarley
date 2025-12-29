/**
 * BallDistanceCache - Performance optimization for ball distance calculations
 *
 * Caches ball distances for all AI players to avoid O(n) calculations on every AI tick.
 * Instead of each AI player independently calculating distances to the ball, this cache
 * computes all distances once per game tick and provides O(1) lookups.
 *
 * Usage:
 * ```typescript
 * const cache = new BallDistanceCache();
 *
 * // Called once per tick to update all distances
 * cache.updateForTick(ball, allAIPlayers);
 *
 * // Each AI player can then quickly check distances
 * const distance = cache.getDistance(playerId);
 * const isClosest = cache.isClosestToBall(playerId);
 * ```
 */

import type { Entity } from "hytopia";
import type AIPlayerEntity from "../entities/AIPlayerEntity";

export interface PlayerDistanceInfo {
  playerId: string;
  distance: number;
  playerName: string;
  team: 'red' | 'blue';
  aiRole: string;
}

export class BallDistanceCache {
  private distanceMap: Map<string, number> = new Map();
  private closestPlayerId: string | null = null;
  private lastUpdateTick: number = 0;
  private playerInfoMap: Map<string, PlayerDistanceInfo> = new Map();

  constructor() {
    console.log('⚽ BallDistanceCache initialized');
  }

  /**
   * Update all ball distances for the current tick
   * This should be called once per game tick before AI decision-making
   *
   * @param ball The soccer ball entity
   * @param players Array of all AI players to track
   */
  updateForTick(ball: Entity, players: AIPlayerEntity[]): void {
    const currentTick = Date.now();

    // Clear previous tick data
    this.distanceMap.clear();
    this.playerInfoMap.clear();
    this.closestPlayerId = null;

    if (!ball || players.length === 0) {
      return;
    }

    let minDistance = Infinity;
    let closestPlayer: string | null = null;

    // Calculate all distances in one pass
    for (const player of players) {
      if (!player.isSpawned) {
        continue;
      }

      const playerId = player.player.id;

      // Calculate distance using the same method as AIPlayerEntity
      const dx = player.position.x - ball.position.x;
      const dz = player.position.z - ball.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      this.distanceMap.set(playerId, distance);

      // Store player info for debugging
      this.playerInfoMap.set(playerId, {
        playerId,
        distance,
        playerName: player.player.username,
        team: player.team,
        aiRole: player.aiRole
      });

      // Track closest player
      if (distance < minDistance) {
        minDistance = distance;
        closestPlayer = playerId;
      }
    }

    this.closestPlayerId = closestPlayer;
    this.lastUpdateTick = currentTick;
  }

  /**
   * Get cached distance for a specific player
   * O(1) lookup operation
   *
   * @param playerId Player ID to look up
   * @returns Distance to ball, or Infinity if not found
   */
  getDistance(playerId: string): number {
    return this.distanceMap.get(playerId) ?? Infinity;
  }

  /**
   * Check if a specific player is closest to the ball
   * O(1) lookup operation
   *
   * @param playerId Player ID to check
   * @returns True if this player is closest to the ball
   */
  isClosestToBall(playerId: string): boolean {
    return this.closestPlayerId === playerId;
  }

  /**
   * Get the ID of the player closest to the ball
   *
   * @returns Player ID of closest player, or null if none
   */
  getClosestPlayerId(): string | null {
    return this.closestPlayerId;
  }

  /**
   * Get all player distances sorted by distance
   * Useful for debugging and analysis
   *
   * @returns Array of player distance info sorted by distance
   */
  getAllDistancesSorted(): PlayerDistanceInfo[] {
    const distances = Array.from(this.playerInfoMap.values());
    distances.sort((a, b) => a.distance - b.distance);
    return distances;
  }

  /**
   * Get statistics about the cache
   *
   * @returns Cache statistics
   */
  getStats(): {
    trackedPlayers: number;
    closestPlayer: string | null;
    closestDistance: number;
    lastUpdateTick: number;
  } {
    const closestDistance = this.closestPlayerId
      ? this.distanceMap.get(this.closestPlayerId) ?? Infinity
      : Infinity;

    return {
      trackedPlayers: this.distanceMap.size,
      closestPlayer: this.closestPlayerId,
      closestDistance,
      lastUpdateTick: this.lastUpdateTick
    };
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.distanceMap.clear();
    this.playerInfoMap.clear();
    this.closestPlayerId = null;
  }

  /**
   * Get cached distance with team filtering
   *
   * @param playerId Player ID to check
   * @param team Optional team to filter by
   * @returns Distance if player matches team, Infinity otherwise
   */
  getDistanceForTeam(playerId: string, team?: 'red' | 'blue'): number {
    const playerInfo = this.playerInfoMap.get(playerId);
    if (!playerInfo) {
      return Infinity;
    }

    if (team && playerInfo.team !== team) {
      return Infinity;
    }

    return playerInfo.distance;
  }

  /**
   * Get closest player from a specific team
   *
   * @param team Team to filter by
   * @returns Player ID of closest player on that team, or null
   */
  getClosestPlayerForTeam(team: 'red' | 'blue'): string | null {
    let minDistance = Infinity;
    let closestPlayer: string | null = null;

    for (const [playerId, info] of this.playerInfoMap.entries()) {
      if (info.team === team && info.distance < minDistance) {
        minDistance = info.distance;
        closestPlayer = playerId;
      }
    }

    return closestPlayer;
  }
}

// Export singleton instance for global use
export const globalBallDistanceCache = new BallDistanceCache();
