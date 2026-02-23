import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialGrid, createSoccerFieldGrid } from '../../utils/SpatialGrid';
import { createPositionedEntity } from '../__mocks__/hytopia';

interface TestEntity {
  position: { x: number; y: number; z: number };
  id: string;
}

describe('SpatialGrid', () => {
  let grid: SpatialGrid<TestEntity>;

  beforeEach(() => {
    grid = new SpatialGrid<TestEntity>(10);
  });

  // ── Construction ──────────────────────────────────────────────
  describe('constructor', () => {
    it('creates empty grid', () => {
      expect(grid.size()).toBe(0);
      expect(grid.cellCount()).toBe(0);
    });

    it('uses default cell size of 10', () => {
      const info = grid.getDebugInfo();
      expect(info.cellSize).toBe(10);
    });

    it('accepts custom cell size', () => {
      const custom = new SpatialGrid(20);
      expect(custom.getDebugInfo().cellSize).toBe(20);
    });
  });

  // ── Insert ────────────────────────────────────────────────────
  describe('insert', () => {
    it('increases size by 1', () => {
      grid.insert(createPositionedEntity(5, 0, 5, 'e1') as TestEntity);
      expect(grid.size()).toBe(1);
    });

    it('creates a cell for the entity', () => {
      grid.insert(createPositionedEntity(5, 0, 5, 'e1') as TestEntity);
      expect(grid.cellCount()).toBe(1);
    });

    it('places entities in same cell if close', () => {
      grid.insert(createPositionedEntity(1, 0, 1, 'e1') as TestEntity);
      grid.insert(createPositionedEntity(2, 0, 2, 'e2') as TestEntity);
      expect(grid.cellCount()).toBe(1);
      expect(grid.size()).toBe(2);
    });

    it('places entities in different cells if far apart', () => {
      grid.insert(createPositionedEntity(0, 0, 0, 'e1') as TestEntity);
      grid.insert(createPositionedEntity(50, 0, 50, 'e2') as TestEntity);
      expect(grid.cellCount()).toBe(2);
    });
  });

  // ── Remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('decreases size', () => {
      const entity = createPositionedEntity(5, 0, 5, 'e1') as TestEntity;
      grid.insert(entity);
      grid.remove(entity);
      expect(grid.size()).toBe(0);
    });

    it('cleans up empty cells', () => {
      const entity = createPositionedEntity(5, 0, 5, 'e1') as TestEntity;
      grid.insert(entity);
      grid.remove(entity);
      expect(grid.cellCount()).toBe(0);
    });

    it('handles removing non-existent entity gracefully', () => {
      const entity = createPositionedEntity(5, 0, 5, 'e1') as TestEntity;
      expect(() => grid.remove(entity)).not.toThrow();
    });
  });

  // ── Update ────────────────────────────────────────────────────
  describe('update', () => {
    it('moves entity between cells when position changes', () => {
      const entity = createPositionedEntity(5, 0, 5, 'e1') as TestEntity;
      grid.insert(entity);
      const oldPos = { ...entity.position };
      entity.position = { x: 50, y: 0, z: 50 };
      grid.update(entity, oldPos);
      // Entity should be findable at new position
      const found = grid.queryRadius(entity.position, 5);
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(entity);
    });

    it('does not duplicate when staying in same cell', () => {
      const entity = createPositionedEntity(5, 0, 5, 'e1') as TestEntity;
      grid.insert(entity);
      const oldPos = { ...entity.position };
      entity.position = { x: 6, y: 0, z: 6 }; // Same cell (within 10-unit range)
      grid.update(entity, oldPos);
      expect(grid.size()).toBe(1);
    });
  });

  // ── queryRadius ───────────────────────────────────────────────
  describe('queryRadius', () => {
    it('returns empty array when grid is empty', () => {
      expect(grid.queryRadius({ x: 0, y: 0, z: 0 }, 10)).toEqual([]);
    });

    it('finds nearby entities', () => {
      const e1 = createPositionedEntity(3, 0, 3, 'e1') as TestEntity;
      const e2 = createPositionedEntity(100, 0, 100, 'e2') as TestEntity;
      grid.insert(e1);
      grid.insert(e2);
      const result = grid.queryRadius({ x: 0, y: 0, z: 0 }, 10);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(e1);
    });

    it('finds all entities within radius', () => {
      grid.insert(createPositionedEntity(1, 0, 1, 'e1') as TestEntity);
      grid.insert(createPositionedEntity(2, 0, 2, 'e2') as TestEntity);
      grid.insert(createPositionedEntity(3, 0, 3, 'e3') as TestEntity);
      const result = grid.queryRadius({ x: 0, y: 0, z: 0 }, 10);
      expect(result).toHaveLength(3);
    });

    it('excludes entities beyond radius', () => {
      grid.insert(createPositionedEntity(1, 0, 1, 'near') as TestEntity);
      grid.insert(createPositionedEntity(50, 0, 50, 'far') as TestEntity);
      const result = grid.queryRadius({ x: 0, y: 0, z: 0 }, 5);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('near');
    });

    it('uses 3D distance including Y', () => {
      grid.insert(createPositionedEntity(0, 100, 0, 'high') as TestEntity);
      const result = grid.queryRadius({ x: 0, y: 0, z: 0 }, 5);
      expect(result).toHaveLength(0); // 100 units up, out of range
    });
  });

  // ── findClosest ───────────────────────────────────────────────
  describe('findClosest', () => {
    it('returns null when grid is empty', () => {
      expect(grid.findClosest({ x: 0, y: 0, z: 0 }, 100)).toBeNull();
    });

    it('finds the closest entity', () => {
      const near = createPositionedEntity(2, 0, 0, 'near') as TestEntity;
      const far = createPositionedEntity(8, 0, 0, 'far') as TestEntity;
      grid.insert(near);
      grid.insert(far);
      const result = grid.findClosest({ x: 0, y: 0, z: 0 }, 20);
      expect(result).toBe(near);
    });

    it('returns null when no entity within max radius', () => {
      grid.insert(createPositionedEntity(100, 0, 100, 'far') as TestEntity);
      expect(grid.findClosest({ x: 0, y: 0, z: 0 }, 5)).toBeNull();
    });
  });

  // ── queryCell ─────────────────────────────────────────────────
  describe('queryCell', () => {
    it('returns empty for unoccupied cell', () => {
      expect(grid.queryCell({ x: 0, y: 0, z: 0 })).toEqual([]);
    });

    it('returns entities in the same cell', () => {
      grid.insert(createPositionedEntity(1, 0, 1, 'e1') as TestEntity);
      grid.insert(createPositionedEntity(2, 0, 2, 'e2') as TestEntity);
      const result = grid.queryCell({ x: 1, y: 0, z: 1 });
      expect(result).toHaveLength(2);
    });
  });

  // ── clear ─────────────────────────────────────────────────────
  describe('clear', () => {
    it('removes all entities', () => {
      grid.insert(createPositionedEntity(1, 0, 1, 'e1') as TestEntity);
      grid.insert(createPositionedEntity(50, 0, 50, 'e2') as TestEntity);
      grid.clear();
      expect(grid.size()).toBe(0);
      expect(grid.cellCount()).toBe(0);
    });
  });

  // ── getDebugInfo ──────────────────────────────────────────────
  describe('getDebugInfo', () => {
    it('returns correct statistics', () => {
      grid.insert(createPositionedEntity(1, 0, 1, 'e1') as TestEntity);
      grid.insert(createPositionedEntity(2, 0, 2, 'e2') as TestEntity);
      grid.insert(createPositionedEntity(50, 0, 50, 'e3') as TestEntity);
      const info = grid.getDebugInfo();
      expect(info.totalEntities).toBe(3);
      expect(info.totalCells).toBe(2);
      expect(info.maxEntitiesPerCell).toBe(2);
      expect(info.cellSize).toBe(10);
    });

    it('returns zeros for empty grid', () => {
      const info = grid.getDebugInfo();
      expect(info.totalEntities).toBe(0);
      expect(info.totalCells).toBe(0);
      expect(info.avgEntitiesPerCell).toBe(0);
      expect(info.maxEntitiesPerCell).toBe(0);
    });
  });
});

// ── createSoccerFieldGrid ───────────────────────────────────────
describe('createSoccerFieldGrid', () => {
  it('creates a grid with optimized cell size', () => {
    const grid = createSoccerFieldGrid(80, 120);
    const info = grid.getDebugInfo();
    expect(info.cellSize).toBe(10); // min(80,120) / 8 = 10
  });

  it('uses default dimensions', () => {
    const grid = createSoccerFieldGrid();
    const info = grid.getDebugInfo();
    expect(info.cellSize).toBe(10); // min(80,120) / 8 = 10
  });
});
