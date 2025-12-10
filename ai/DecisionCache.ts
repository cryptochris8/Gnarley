/**
 * DecisionCache - Performance optimization for AI decision-making
 *
 * Caches expensive AI calculations with TTL-based invalidation to reduce
 * redundant computations and improve overall game performance.
 *
 * Usage:
 * ```typescript
 * const cache = new DecisionCache();
 * const result = cache.get('targetPosition', () => calculateExpensivePosition());
 * ```
 */

export interface CacheEntry<T> {
  result: T;
  timestamp: number;
}

export class DecisionCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly TTL: number;
  private readonly maxSize: number;

  /**
   * Create a new decision cache
   * @param ttl Time-to-live in milliseconds (default: 100ms)
   * @param maxSize Maximum cache size before cleanup (default: 1000 entries)
   */
  constructor(ttl: number = 100, maxSize: number = 1000) {
    this.TTL = ttl;
    this.maxSize = maxSize;
  }

  /**
   * Get a cached value or compute it if not cached/expired
   * @param key Unique cache key
   * @param computeFn Function to compute the value if cache miss
   * @returns The cached or newly computed value
   */
  get<T>(key: string, computeFn: () => T): T {
    const cached = this.cache.get(key);
    const now = Date.now();

    // Return cached value if valid
    if (cached && (now - cached.timestamp) < this.TTL) {
      return cached.result as T;
    }

    // Compute new value
    const result = computeFn();
    this.cache.set(key, { result, timestamp: now });

    // Perform cleanup if cache is too large
    if (this.cache.size > this.maxSize) {
      this.cleanup();
    }

    return result;
  }

  /**
   * Get a value from cache without computing (returns undefined if not found)
   * @param key Cache key
   * @returns Cached value or undefined
   */
  peek<T>(key: string): T | undefined {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.TTL) {
      return cached.result as T;
    }

    return undefined;
  }

  /**
   * Set a value in the cache manually
   * @param key Cache key
   * @param value Value to cache
   */
  set<T>(key: string, value: T): void {
    this.cache.set(key, { result: value, timestamp: Date.now() });

    if (this.cache.size > this.maxSize) {
      this.cleanup();
    }
  }

  /**
   * Invalidate a specific cache entry
   * @param key Cache key to invalidate
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries matching a pattern
   * @param pattern String prefix to match
   */
  invalidatePattern(pattern: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries from cache
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    // Find expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.TTL) {
        keysToDelete.push(key);
      }
    }

    // Delete expired entries
    keysToDelete.forEach(key => this.cache.delete(key));

    // If still too large, remove oldest entries (FIFO)
    if (this.cache.size > this.maxSize) {
      const entriesToRemove = this.cache.size - this.maxSize;
      const sortedEntries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      for (let i = 0; i < entriesToRemove; i++) {
        this.cache.delete(sortedEntries[i][0]);
      }
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.TTL
    };
  }

  /**
   * Get all cache keys (useful for debugging)
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Singleton instance for global decision caching
 */
export const globalDecisionCache = new DecisionCache(100, 1000);
