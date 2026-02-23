import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DecisionCache } from '../../ai/DecisionCache';

describe('DecisionCache', () => {
  let cache: DecisionCache;

  beforeEach(() => {
    cache = new DecisionCache();
  });

  // ── Constructor ──────────────────────────────────────────────────
  describe('constructor', () => {
    it('uses default TTL of 100ms', () => {
      const stats = cache.getStats();
      expect(stats.ttl).toBe(100);
    });

    it('uses default maxSize of 1000', () => {
      const stats = cache.getStats();
      expect(stats.maxSize).toBe(1000);
    });

    it('starts with empty cache', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });

    it('accepts custom TTL', () => {
      const customCache = new DecisionCache(500);
      expect(customCache.getStats().ttl).toBe(500);
    });

    it('accepts custom maxSize', () => {
      const customCache = new DecisionCache(100, 50);
      expect(customCache.getStats().maxSize).toBe(50);
    });

    it('accepts both custom TTL and maxSize', () => {
      const customCache = new DecisionCache(250, 200);
      const stats = customCache.getStats();
      expect(stats.ttl).toBe(250);
      expect(stats.maxSize).toBe(200);
    });
  });

  // ── get(key, computeFn) ──────────────────────────────────────────
  describe('get', () => {
    it('computes and returns value on cache miss', () => {
      const result = cache.get('key1', () => 42);
      expect(result).toBe(42);
    });

    it('returns cached value on cache hit within TTL', () => {
      const computeFn = vi.fn(() => 'computed');
      cache.get('key1', computeFn);
      const result = cache.get('key1', computeFn);

      expect(result).toBe('computed');
      expect(computeFn).toHaveBeenCalledTimes(1);
    });

    it('calls computeFn exactly once for repeated gets within TTL', () => {
      const computeFn = vi.fn(() => 'value');

      cache.get('key1', computeFn);
      cache.get('key1', computeFn);
      cache.get('key1', computeFn);

      expect(computeFn).toHaveBeenCalledTimes(1);
    });

    it('recomputes value after TTL expires', async () => {
      const shortCache = new DecisionCache(50); // 50ms TTL
      let counter = 0;
      const computeFn = vi.fn(() => ++counter);

      const first = shortCache.get('key1', computeFn);
      expect(first).toBe(1);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      const second = shortCache.get('key1', computeFn);
      expect(second).toBe(2);
      expect(computeFn).toHaveBeenCalledTimes(2);
    });

    it('caches different keys independently', () => {
      const result1 = cache.get('key1', () => 'value1');
      const result2 = cache.get('key2', () => 'value2');

      expect(result1).toBe('value1');
      expect(result2).toBe('value2');
      expect(cache.getStats().size).toBe(2);
    });

    it('handles complex object values', () => {
      const obj = { x: 10, y: 20, z: 30 };
      const result = cache.get('position', () => obj);
      expect(result).toEqual({ x: 10, y: 20, z: 30 });

      // Same reference should be returned from cache
      const cached = cache.get('position', () => ({ x: 0, y: 0, z: 0 }));
      expect(cached).toBe(obj);
    });

    it('handles null and undefined values', () => {
      const nullResult = cache.get('null-key', () => null);
      expect(nullResult).toBeNull();

      const undefinedResult = cache.get('undef-key', () => undefined);
      expect(undefinedResult).toBeUndefined();
    });

    it('handles numeric zero value correctly', () => {
      const result = cache.get('zero', () => 0);
      expect(result).toBe(0);

      // Should return cached 0, not recompute
      const computeFn = vi.fn(() => 999);
      const cached = cache.get('zero', computeFn);
      expect(cached).toBe(0);
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('handles empty string value correctly', () => {
      cache.get('empty', () => '');
      const computeFn = vi.fn(() => 'new');
      const cached = cache.get('empty', computeFn);
      expect(cached).toBe('');
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('increases cache size on miss', () => {
      expect(cache.getStats().size).toBe(0);
      cache.get('a', () => 1);
      expect(cache.getStats().size).toBe(1);
      cache.get('b', () => 2);
      expect(cache.getStats().size).toBe(2);
    });
  });

  // ── peek(key) ────────────────────────────────────────────────────
  describe('peek', () => {
    it('returns undefined for non-existent key', () => {
      expect(cache.peek('nonexistent')).toBeUndefined();
    });

    it('returns cached value without computing', () => {
      cache.set('key1', 'value1');
      expect(cache.peek('key1')).toBe('value1');
    });

    it('does not call any compute function', () => {
      // peek should never trigger computation
      const result = cache.peek('missing');
      expect(result).toBeUndefined();
      // Cache size should remain 0
      expect(cache.getStats().size).toBe(0);
    });

    it('returns undefined for expired entries', async () => {
      const shortCache = new DecisionCache(30);
      shortCache.set('key1', 'value');

      expect(shortCache.peek('key1')).toBe('value');

      await new Promise(resolve => setTimeout(resolve, 40));

      expect(shortCache.peek('key1')).toBeUndefined();
    });

    it('returns value set via get()', () => {
      cache.get('computed', () => 'hello');
      expect(cache.peek('computed')).toBe('hello');
    });
  });

  // ── set(key, value) ──────────────────────────────────────────────
  describe('set', () => {
    it('manually sets a value in the cache', () => {
      cache.set('manual', 42);
      expect(cache.peek('manual')).toBe(42);
    });

    it('overwrites existing cached value', () => {
      cache.set('key', 'first');
      cache.set('key', 'second');
      expect(cache.peek('key')).toBe('second');
    });

    it('value is retrievable via get() without recomputing', () => {
      cache.set('preset', 'presetValue');
      const computeFn = vi.fn(() => 'computed');
      const result = cache.get('preset', computeFn);

      expect(result).toBe('presetValue');
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('increases cache size', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.getStats().size).toBe(3);
    });

    it('setting same key does not increase size', () => {
      cache.set('a', 1);
      cache.set('a', 2);
      expect(cache.getStats().size).toBe(1);
    });
  });

  // ── invalidate(key) ──────────────────────────────────────────────
  describe('invalidate', () => {
    it('removes a specific entry', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.invalidate('key1');

      expect(cache.peek('key1')).toBeUndefined();
      expect(cache.peek('key2')).toBe('value2');
    });

    it('decreases cache size', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.getStats().size).toBe(2);

      cache.invalidate('a');
      expect(cache.getStats().size).toBe(1);
    });

    it('does nothing for non-existent key', () => {
      cache.set('exists', 'value');
      cache.invalidate('nonexistent');
      expect(cache.getStats().size).toBe(1);
    });

    it('forces recomputation on next get()', () => {
      const computeFn = vi.fn(() => 'fresh');
      cache.set('key', 'old');
      cache.invalidate('key');

      const result = cache.get('key', computeFn);
      expect(result).toBe('fresh');
      expect(computeFn).toHaveBeenCalledTimes(1);
    });
  });

  // ── invalidatePattern(pattern) ───────────────────────────────────
  describe('invalidatePattern', () => {
    it('removes entries matching a prefix', () => {
      cache.set('player:1:pos', { x: 0, y: 0, z: 0 });
      cache.set('player:1:vel', { x: 1, y: 0, z: 0 });
      cache.set('player:2:pos', { x: 5, y: 0, z: 0 });
      cache.set('ball:pos', { x: 10, y: 0, z: 0 });

      cache.invalidatePattern('player:1');

      expect(cache.peek('player:1:pos')).toBeUndefined();
      expect(cache.peek('player:1:vel')).toBeUndefined();
      expect(cache.peek('player:2:pos')).toBeDefined();
      expect(cache.peek('ball:pos')).toBeDefined();
    });

    it('removes all entries when pattern is empty string', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.invalidatePattern('');

      expect(cache.getStats().size).toBe(0);
    });

    it('does nothing when no entries match', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.invalidatePattern('nonexistent');

      expect(cache.getStats().size).toBe(2);
    });

    it('correctly matches prefix, not substring', () => {
      cache.set('rolePos:striker', 'pos1');
      cache.set('rolePos:goalkeeper', 'pos2');
      cache.set('myRolePos:other', 'pos3');

      cache.invalidatePattern('rolePos:');

      expect(cache.peek('rolePos:striker')).toBeUndefined();
      expect(cache.peek('rolePos:goalkeeper')).toBeUndefined();
      // "myRolePos:other" should NOT be matched since "rolePos:" is not its prefix
      expect(cache.peek('myRolePos:other')).toBe('pos3');
    });

    it('updates size correctly after invalidation', () => {
      cache.set('team:red:1', 'a');
      cache.set('team:red:2', 'b');
      cache.set('team:blue:1', 'c');

      cache.invalidatePattern('team:red');

      expect(cache.getStats().size).toBe(1);
    });
  });

  // ── clear() ──────────────────────────────────────────────────────
  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.getStats().size).toBe(0);
      expect(cache.getKeys()).toEqual([]);
    });

    it('clears an already empty cache without error', () => {
      expect(() => cache.clear()).not.toThrow();
      expect(cache.getStats().size).toBe(0);
    });

    it('all keys return undefined after clear', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      expect(cache.peek('key1')).toBeUndefined();
      expect(cache.peek('key2')).toBeUndefined();
    });

    it('cache is fully usable after clear', () => {
      cache.set('old', 'value');
      cache.clear();
      cache.set('new', 'fresh');

      expect(cache.peek('new')).toBe('fresh');
      expect(cache.getStats().size).toBe(1);
    });
  });

  // ── getStats() ───────────────────────────────────────────────────
  describe('getStats', () => {
    it('returns correct structure', () => {
      const stats = cache.getStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('ttl');
    });

    it('size tracks current entries', () => {
      expect(cache.getStats().size).toBe(0);

      cache.set('a', 1);
      expect(cache.getStats().size).toBe(1);

      cache.set('b', 2);
      expect(cache.getStats().size).toBe(2);

      cache.invalidate('a');
      expect(cache.getStats().size).toBe(1);
    });

    it('maxSize and ttl reflect constructor params', () => {
      const custom = new DecisionCache(200, 500);
      const stats = custom.getStats();
      expect(stats.ttl).toBe(200);
      expect(stats.maxSize).toBe(500);
    });
  });

  // ── getKeys() ────────────────────────────────────────────────────
  describe('getKeys', () => {
    it('returns empty array when cache is empty', () => {
      expect(cache.getKeys()).toEqual([]);
    });

    it('returns all stored keys', () => {
      cache.set('alpha', 1);
      cache.set('beta', 2);
      cache.set('gamma', 3);

      const keys = cache.getKeys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
      expect(keys).toContain('gamma');
    });

    it('does not include invalidated keys', () => {
      cache.set('keep', 1);
      cache.set('remove', 2);
      cache.invalidate('remove');

      const keys = cache.getKeys();
      expect(keys).toEqual(['keep']);
    });

    it('returns fresh array (not internal reference)', () => {
      cache.set('key1', 1);
      const keys1 = cache.getKeys();
      const keys2 = cache.getKeys();

      expect(keys1).toEqual(keys2);
      expect(keys1).not.toBe(keys2); // Different array instances
    });
  });

  // ── Cleanup / maxSize enforcement ────────────────────────────────
  describe('maxSize cleanup', () => {
    it('triggers cleanup when cache exceeds maxSize via get()', () => {
      const tinyCache = new DecisionCache(100, 3);

      tinyCache.get('a', () => 1);
      tinyCache.get('b', () => 2);
      tinyCache.get('c', () => 3);

      expect(tinyCache.getStats().size).toBe(3);

      // Adding 4th entry should trigger cleanup
      tinyCache.get('d', () => 4);

      // Cache should not exceed maxSize
      expect(tinyCache.getStats().size).toBeLessThanOrEqual(3);
    });

    it('triggers cleanup when cache exceeds maxSize via set()', () => {
      const tinyCache = new DecisionCache(100, 3);

      tinyCache.set('a', 1);
      tinyCache.set('b', 2);
      tinyCache.set('c', 3);

      expect(tinyCache.getStats().size).toBe(3);

      // Adding 4th entry should trigger cleanup
      tinyCache.set('d', 4);

      expect(tinyCache.getStats().size).toBeLessThanOrEqual(3);
    });

    it('removes expired entries first during cleanup', async () => {
      const shortCache = new DecisionCache(30, 3);

      shortCache.set('old1', 'expired');
      shortCache.set('old2', 'expired');

      // Wait for old entries to expire
      await new Promise(resolve => setTimeout(resolve, 40));

      shortCache.set('new1', 'fresh');
      shortCache.set('new2', 'fresh');
      shortCache.set('new3', 'fresh');

      // The 4th entry triggers cleanup; old expired entries should be removed first
      shortCache.set('new4', 'fresh');

      expect(shortCache.getStats().size).toBeLessThanOrEqual(3);
      // New entries should be prioritized over expired ones
      expect(shortCache.peek('new4')).toBe('fresh');
    });

    it('removes oldest entries if all entries are still valid', () => {
      const tinyCache = new DecisionCache(10000, 2); // Very long TTL

      tinyCache.set('first', 1);
      tinyCache.set('second', 2);
      // 3rd entry triggers cleanup
      tinyCache.set('third', 3);

      // Size should be at most maxSize
      expect(tinyCache.getStats().size).toBeLessThanOrEqual(2);
      // Newest entry should survive
      expect(tinyCache.peek('third')).toBe(3);
    });
  });

  // ── TTL edge cases ───────────────────────────────────────────────
  describe('TTL edge cases', () => {
    it('zero TTL always recomputes', () => {
      const noCache = new DecisionCache(0);
      let counter = 0;
      const computeFn = vi.fn(() => ++counter);

      noCache.get('key', computeFn);
      noCache.get('key', computeFn);
      noCache.get('key', computeFn);

      // With 0 TTL, (now - timestamp) >= 0 which is NOT < 0, so it recomputes
      expect(computeFn).toHaveBeenCalledTimes(3);
    });

    it('very long TTL keeps values cached', () => {
      const longCache = new DecisionCache(999999);
      const computeFn = vi.fn(() => 'stable');

      longCache.get('key', computeFn);
      longCache.get('key', computeFn);
      longCache.get('key', computeFn);

      expect(computeFn).toHaveBeenCalledTimes(1);
    });
  });

  // ── Interaction between methods ──────────────────────────────────
  describe('method interactions', () => {
    it('set then get returns set value without recomputing', () => {
      cache.set('preset', 100);
      const computeFn = vi.fn(() => 999);
      expect(cache.get('preset', computeFn)).toBe(100);
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('invalidate then get recomputes value', () => {
      cache.set('key', 'old');
      cache.invalidate('key');

      const result = cache.get('key', () => 'new');
      expect(result).toBe('new');
    });

    it('clear then get recomputes all values', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();

      const computeA = vi.fn(() => 10);
      const computeB = vi.fn(() => 20);

      expect(cache.get('a', computeA)).toBe(10);
      expect(cache.get('b', computeB)).toBe(20);
      expect(computeA).toHaveBeenCalledTimes(1);
      expect(computeB).toHaveBeenCalledTimes(1);
    });

    it('invalidatePattern then peek returns undefined for removed keys', () => {
      cache.set('role:gk:pos', { x: 0, y: 0, z: 0 });
      cache.set('role:gk:vel', { x: 0, y: 0, z: 0 });
      cache.set('role:st:pos', { x: 10, y: 0, z: 0 });

      cache.invalidatePattern('role:gk');

      expect(cache.peek('role:gk:pos')).toBeUndefined();
      expect(cache.peek('role:gk:vel')).toBeUndefined();
      expect(cache.peek('role:st:pos')).toBeDefined();
    });
  });
});
