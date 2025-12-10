/**
 * SpatialGrid
 *
 * Spatial partitioning system for efficient proximity queries.
 * Divides the game world into a grid of cells for O(1) lookups.
 *
 * Performance Benefits:
 * - Reduces proximity queries from O(n²) to O(k) where k = entities per cell
 * - Typical performance improvement: 10-100x for large entity counts
 * - Essential for games with many entities (players, AI, projectiles)
 *
 * Usage:
 * ```typescript
 * const grid = new SpatialGrid(10); // 10-unit cell size
 * grid.insert(player1);
 * grid.insert(player2);
 *
 * // Find nearby entities
 * const nearby = grid.queryRadius(playerPos, 15);
 * ```
 */

import type { Vector3Like } from "hytopia";
import { distanceSquared } from "./MathUtils";

export interface Positioned {
  position: Vector3Like;
}

interface GridCell {
  entities: Set<Positioned>;
}

/**
 * 2D spatial grid for efficient proximity queries
 * Uses XZ plane (horizontal), ignores Y axis
 */
export class SpatialGrid<T extends Positioned> {
  private cellSize: number;
  private grid: Map<string, GridCell>;

  /**
   * Create a new spatial grid
   * @param cellSize - Size of each grid cell (larger = fewer cells, more entities per cell)
   *                   Optimal size: approximately the most common query radius
   */
  constructor(cellSize: number = 10) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  /**
   * Get grid cell key for a position
   * @param position - World position
   * @returns Grid cell key string
   */
  private getCellKey(position: Vector3Like): string {
    const cellX = Math.floor(position.x / this.cellSize);
    const cellZ = Math.floor(position.z / this.cellSize);
    return `${cellX},${cellZ}`;
  }

  /**
   * Get all cell keys within a radius of a position
   * @param position - Center position
   * @param radius - Search radius
   * @returns Array of cell keys to check
   */
  private getCellKeysInRadius(position: Vector3Like, radius: number): string[] {
    const keys: string[] = [];

    // Calculate cell range to check
    const cellRadius = Math.ceil(radius / this.cellSize);
    const centerCellX = Math.floor(position.x / this.cellSize);
    const centerCellZ = Math.floor(position.z / this.cellSize);

    // Check all cells in range
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const cellX = centerCellX + dx;
        const cellZ = centerCellZ + dz;
        keys.push(`${cellX},${cellZ}`);
      }
    }

    return keys;
  }

  /**
   * Insert an entity into the grid
   * @param entity - Entity to insert
   */
  public insert(entity: T): void {
    const key = this.getCellKey(entity.position);
    let cell = this.grid.get(key);

    if (!cell) {
      cell = { entities: new Set() };
      this.grid.set(key, cell);
    }

    cell.entities.add(entity);
  }

  /**
   * Remove an entity from the grid
   * @param entity - Entity to remove
   */
  public remove(entity: T): void {
    const key = this.getCellKey(entity.position);
    const cell = this.grid.get(key);

    if (cell) {
      cell.entities.delete(entity);

      // Clean up empty cells
      if (cell.entities.size === 0) {
        this.grid.delete(key);
      }
    }
  }

  /**
   * Update an entity's position in the grid
   * Call this when an entity moves to a different grid cell
   * @param entity - Entity to update
   * @param oldPosition - Previous position
   */
  public update(entity: T, oldPosition: Vector3Like): void {
    const oldKey = this.getCellKey(oldPosition);
    const newKey = this.getCellKey(entity.position);

    // Only update if entity moved to a different cell
    if (oldKey !== newKey) {
      this.remove({ position: oldPosition } as T);
      this.insert(entity);
    }
  }

  /**
   * Query all entities within a radius of a position
   * @param position - Center position
   * @param radius - Search radius
   * @returns Array of entities within radius
   */
  public queryRadius(position: Vector3Like, radius: number): T[] {
    const result: T[] = [];
    const radiusSq = radius * radius;
    const cellKeys = this.getCellKeysInRadius(position, radius);

    // Check all relevant cells
    for (const key of cellKeys) {
      const cell = this.grid.get(key);
      if (!cell) continue;

      // Check each entity in the cell
      for (const entity of cell.entities) {
        if (distanceSquared(position, entity.position) <= radiusSq) {
          result.push(entity as T);
        }
      }
    }

    return result;
  }

  /**
   * Find the closest entity to a position within a maximum radius
   * @param position - Center position
   * @param maxRadius - Maximum search radius
   * @returns Closest entity or null if none found
   */
  public findClosest(position: Vector3Like, maxRadius: number): T | null {
    let closest: T | null = null;
    let closestDistSq = maxRadius * maxRadius;
    const cellKeys = this.getCellKeysInRadius(position, maxRadius);

    // Check all relevant cells
    for (const key of cellKeys) {
      const cell = this.grid.get(key);
      if (!cell) continue;

      // Check each entity in the cell
      for (const entity of cell.entities) {
        const distSq = distanceSquared(position, entity.position);
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closest = entity as T;
        }
      }
    }

    return closest;
  }

  /**
   * Query all entities in a specific grid cell
   * @param position - Position to get cell for
   * @returns Array of entities in the same cell
   */
  public queryCell(position: Vector3Like): T[] {
    const key = this.getCellKey(position);
    const cell = this.grid.get(key);
    return cell ? Array.from(cell.entities) as T[] : [];
  }

  /**
   * Clear all entities from the grid
   */
  public clear(): void {
    this.grid.clear();
  }

  /**
   * Get total number of entities in the grid
   * @returns Total entity count
   */
  public size(): number {
    let count = 0;
    for (const cell of this.grid.values()) {
      count += cell.entities.size;
    }
    return count;
  }

  /**
   * Get number of occupied cells
   * @returns Cell count
   */
  public cellCount(): number {
    return this.grid.size;
  }

  /**
   * Get debug information about grid occupancy
   * @returns Debug statistics
   */
  public getDebugInfo(): {
    totalCells: number;
    totalEntities: number;
    avgEntitiesPerCell: number;
    maxEntitiesPerCell: number;
    cellSize: number;
  } {
    let maxEntities = 0;
    let totalEntities = 0;

    for (const cell of this.grid.values()) {
      const count = cell.entities.size;
      totalEntities += count;
      maxEntities = Math.max(maxEntities, count);
    }

    const avgEntities = this.grid.size > 0 ? totalEntities / this.grid.size : 0;

    return {
      totalCells: this.grid.size,
      totalEntities,
      avgEntitiesPerCell: Math.round(avgEntities * 100) / 100,
      maxEntitiesPerCell: maxEntities,
      cellSize: this.cellSize
    };
  }
}

/**
 * Create a spatial grid optimized for soccer field dimensions
 * @param fieldWidth - Field width (X axis)
 * @param fieldLength - Field length (Z axis)
 * @returns Optimized spatial grid
 */
export function createSoccerFieldGrid<T extends Positioned>(
  fieldWidth: number = 80,
  fieldLength: number = 120
): SpatialGrid<T> {
  // Cell size of ~10-15 units is optimal for soccer fields
  // This balances cell count vs entities per cell
  const cellSize = Math.min(fieldWidth, fieldLength) / 8;
  return new SpatialGrid<T>(cellSize);
}

export default SpatialGrid;
