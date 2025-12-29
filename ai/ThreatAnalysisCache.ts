/**
 * ThreatAnalysisCache - Performance optimization for defensive positioning
 *
 * Pre-computes opponent positions and threat levels to avoid expensive calculations
 * during defensive decision-making. This cache helps AI players quickly assess
 * defensive threats and make informed positioning decisions.
 *
 * Features:
 * - Spatial threat mapping using grid-based approach
 * - Nearest opponent lookups for marking decisions
 * - Threat level calculations based on proximity and danger
 * - Team-specific caching for red and blue teams
 *
 * Usage:
 * ```typescript
 * const cache = new ThreatAnalysisCache();
 *
 * // Update once per tick for each team
 * cache.updateForTeam('red', blueTeamOpponents);
 *
 * // Quick lookups during defensive decisions
 * const threatLevel = cache.getThreatLevel(myPosition);
 * const nearestOpponent = cache.getNearestOpponent(myPosition);
 * ```
 */

import type { Vector3Like } from "hytopia";
import type AIPlayerEntity from "../entities/AIPlayerEntity";

export interface OpponentInfo {
  playerId: string;
  playerName: string;
  position: Vector3Like;
  aiRole: string;
  team: 'red' | 'blue';
}

export interface ThreatZone {
  gridX: number;
  gridZ: number;
  threatLevel: number;
  nearestOpponentId: string | null;
  nearestOpponentDistance: number;
  opponentCount: number;
}

export interface ThreatAnalysisStats {
  opponentCount: number;
  highThreatZones: number;
  averageThreatLevel: number;
  lastUpdateTick: number;
}

export class ThreatAnalysisCache {
  // Grid size for spatial partitioning (units)
  private readonly GRID_SIZE = 5;
  // Threat radius around each opponent (units)
  private readonly THREAT_RADIUS = 15;
  // Maximum threat level
  private readonly MAX_THREAT = 100;

  // Team-specific opponent data
  private redTeamOpponents: OpponentInfo[] = [];
  private blueTeamOpponents: OpponentInfo[] = [];

  // Spatial threat grids
  private redThreatGrid: Map<string, ThreatZone> = new Map();
  private blueThreatGrid: Map<string, ThreatZone> = new Map();

  // Last update timestamps
  private redLastUpdate = 0;
  private blueLastUpdate = 0;

  constructor() {
    console.log('🛡️ ThreatAnalysisCache initialized');
  }

  /**
   * Update threat data for a specific team
   * This should be called once per game tick for each team
   *
   * @param team Team to update cache for ('red' or 'blue')
   * @param opponents Array of opponent AI players
   */
  updateForTeam(team: 'red' | 'blue', opponents: AIPlayerEntity[]): void {
    const currentTick = Date.now();

    // Collect opponent information
    const opponentInfo: OpponentInfo[] = [];
    for (const opponent of opponents) {
      if (!opponent.isSpawned) {
        continue;
      }

      opponentInfo.push({
        playerId: opponent.player.id,
        playerName: opponent.player.username,
        position: { ...opponent.position },
        aiRole: opponent.aiRole,
        team: opponent.team
      });
    }

    // Update team-specific data
    if (team === 'red') {
      this.redTeamOpponents = opponentInfo;
      this.redThreatGrid = this.buildThreatGrid(opponentInfo);
      this.redLastUpdate = currentTick;
    } else {
      this.blueTeamOpponents = opponentInfo;
      this.blueThreatGrid = this.buildThreatGrid(opponentInfo);
      this.blueLastUpdate = currentTick;
    }
  }

  /**
   * Get threat level at a specific position
   * Higher values indicate more dangerous areas (more opponents nearby)
   *
   * @param position Position to check threat at
   * @param team Team perspective ('red' or 'blue')
   * @returns Threat level (0-100)
   */
  getThreatLevel(position: Vector3Like, team?: 'red' | 'blue'): number {
    const grid = team === 'blue' ? this.blueThreatGrid : this.redThreatGrid;
    const gridKey = this.getGridKey(position);
    const zone = grid.get(gridKey);

    if (zone) {
      return zone.threatLevel;
    }

    // If not in cached grid, calculate directly
    const opponents = team === 'blue' ? this.blueTeamOpponents : this.redTeamOpponents;
    return this.calculateThreatAtPosition(position, opponents);
  }

  /**
   * Get the nearest opponent to a specific position
   * O(n) worst case, but typically much faster due to spatial partitioning
   *
   * @param position Position to check from
   * @param team Team perspective ('red' or 'blue')
   * @returns Nearest opponent entity or null if none found
   */
  getNearestOpponent(position: Vector3Like, team?: 'red' | 'blue'): OpponentInfo | null {
    const opponents = team === 'blue' ? this.blueTeamOpponents : this.redTeamOpponents;

    if (opponents.length === 0) {
      return null;
    }

    // First check the grid cell
    const grid = team === 'blue' ? this.blueThreatGrid : this.redThreatGrid;
    const gridKey = this.getGridKey(position);
    const zone = grid.get(gridKey);

    if (zone && zone.nearestOpponentId) {
      // Try to find the opponent from the cached ID
      const cachedOpponent = opponents.find(o => o.playerId === zone.nearestOpponentId);
      if (cachedOpponent) {
        return cachedOpponent;
      }
    }

    // Fallback: linear search for nearest opponent
    let nearestOpponent: OpponentInfo | null = null;
    let minDistance = Infinity;

    for (const opponent of opponents) {
      const dx = position.x - opponent.position.x;
      const dz = position.z - opponent.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < minDistance) {
        minDistance = distance;
        nearestOpponent = opponent;
      }
    }

    return nearestOpponent;
  }

  /**
   * Get all opponents within a certain radius
   *
   * @param position Center position
   * @param radius Search radius
   * @param team Team perspective ('red' or 'blue')
   * @returns Array of opponents within radius
   */
  getOpponentsInRadius(position: Vector3Like, radius: number, team?: 'red' | 'blue'): OpponentInfo[] {
    const opponents = team === 'blue' ? this.blueTeamOpponents : this.redTeamOpponents;
    const result: OpponentInfo[] = [];

    for (const opponent of opponents) {
      const dx = position.x - opponent.position.x;
      const dz = position.z - opponent.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= radius) {
        result.push(opponent);
      }
    }

    return result;
  }

  /**
   * Get count of opponents in a specific area
   *
   * @param position Center position
   * @param radius Search radius
   * @param team Team perspective ('red' or 'blue')
   * @returns Number of opponents in area
   */
  getOpponentCountInArea(position: Vector3Like, radius: number, team?: 'red' | 'blue'): number {
    return this.getOpponentsInRadius(position, radius, team).length;
  }

  /**
   * Check if a position is in a high-threat zone
   *
   * @param position Position to check
   * @param team Team perspective ('red' or 'blue')
   * @param threshold Threat threshold (default: 50)
   * @returns True if position has high threat
   */
  isHighThreatZone(position: Vector3Like, team?: 'red' | 'blue', threshold = 50): boolean {
    return this.getThreatLevel(position, team) >= threshold;
  }

  /**
   * Get all opponent positions for a team
   *
   * @param team Team perspective ('red' or 'blue')
   * @returns Array of opponent info
   */
  getAllOpponents(team: 'red' | 'blue'): OpponentInfo[] {
    return team === 'blue' ? [...this.blueTeamOpponents] : [...this.redTeamOpponents];
  }

  /**
   * Get statistics about threat analysis
   *
   * @param team Team to get stats for
   * @returns Threat analysis statistics
   */
  getStats(team: 'red' | 'blue'): ThreatAnalysisStats {
    const grid = team === 'blue' ? this.blueThreatGrid : this.redThreatGrid;
    const opponents = team === 'blue' ? this.blueTeamOpponents : this.redTeamOpponents;
    const lastUpdate = team === 'blue' ? this.blueLastUpdate : this.redLastUpdate;

    let highThreatZones = 0;
    let totalThreat = 0;

    for (const zone of grid.values()) {
      if (zone.threatLevel >= 50) {
        highThreatZones++;
      }
      totalThreat += zone.threatLevel;
    }

    const averageThreatLevel = grid.size > 0 ? totalThreat / grid.size : 0;

    return {
      opponentCount: opponents.length,
      highThreatZones,
      averageThreatLevel,
      lastUpdateTick: lastUpdate
    };
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.redTeamOpponents = [];
    this.blueTeamOpponents = [];
    this.redThreatGrid.clear();
    this.blueThreatGrid.clear();
  }

  /**
   * Clear data for a specific team
   *
   * @param team Team to clear
   */
  clearTeam(team: 'red' | 'blue'): void {
    if (team === 'red') {
      this.redTeamOpponents = [];
      this.redThreatGrid.clear();
    } else {
      this.blueTeamOpponents = [];
      this.blueThreatGrid.clear();
    }
  }

  /**
   * Build spatial threat grid from opponent positions
   */
  private buildThreatGrid(opponents: OpponentInfo[]): Map<string, ThreatZone> {
    const grid = new Map<string, ThreatZone>();

    if (opponents.length === 0) {
      return grid;
    }

    // For each opponent, create threat zones in surrounding grid cells
    for (const opponent of opponents) {
      const centerGridX = Math.floor(opponent.position.x / this.GRID_SIZE);
      const centerGridZ = Math.floor(opponent.position.z / this.GRID_SIZE);

      // Calculate how many grid cells the threat radius covers
      const gridRadius = Math.ceil(this.THREAT_RADIUS / this.GRID_SIZE);

      // Create threat in surrounding grid cells
      for (let gx = centerGridX - gridRadius; gx <= centerGridX + gridRadius; gx++) {
        for (let gz = centerGridZ - gridRadius; gz <= centerGridZ + gridRadius; gz++) {
          const gridKey = `${gx},${gz}`;

          // Calculate grid cell center position
          const cellCenterX = gx * this.GRID_SIZE + this.GRID_SIZE / 2;
          const cellCenterZ = gz * this.GRID_SIZE + this.GRID_SIZE / 2;

          // Calculate distance from opponent to grid cell center
          const dx = cellCenterX - opponent.position.x;
          const dz = cellCenterZ - opponent.position.z;
          const distance = Math.sqrt(dx * dx + dz * dz);

          // Only add threat if within radius
          if (distance <= this.THREAT_RADIUS) {
            // Threat falls off with distance (inverse square-ish)
            const threatContribution = this.MAX_THREAT * (1 - (distance / this.THREAT_RADIUS) ** 2);

            // Get or create zone
            let zone = grid.get(gridKey);
            if (!zone) {
              zone = {
                gridX: gx,
                gridZ: gz,
                threatLevel: 0,
                nearestOpponentId: null,
                nearestOpponentDistance: Infinity,
                opponentCount: 0
              };
              grid.set(gridKey, zone);
            }

            // Update zone
            zone.threatLevel += threatContribution;
            zone.opponentCount++;

            // Update nearest opponent if this one is closer
            if (distance < zone.nearestOpponentDistance) {
              zone.nearestOpponentDistance = distance;
              zone.nearestOpponentId = opponent.playerId;
            }
          }
        }
      }
    }

    // Clamp threat levels
    for (const zone of grid.values()) {
      zone.threatLevel = Math.min(zone.threatLevel, this.MAX_THREAT);
    }

    return grid;
  }

  /**
   * Calculate threat level at a position without using cache
   */
  private calculateThreatAtPosition(position: Vector3Like, opponents: OpponentInfo[]): number {
    let totalThreat = 0;

    for (const opponent of opponents) {
      const dx = position.x - opponent.position.x;
      const dz = position.z - opponent.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= this.THREAT_RADIUS) {
        const threatContribution = this.MAX_THREAT * (1 - (distance / this.THREAT_RADIUS) ** 2);
        totalThreat += threatContribution;
      }
    }

    return Math.min(totalThreat, this.MAX_THREAT);
  }

  /**
   * Get grid key for a position
   */
  private getGridKey(position: Vector3Like): string {
    const gridX = Math.floor(position.x / this.GRID_SIZE);
    const gridZ = Math.floor(position.z / this.GRID_SIZE);
    return `${gridX},${gridZ}`;
  }
}

// Export singleton instance for global use
export const globalThreatAnalysisCache = new ThreatAnalysisCache();
