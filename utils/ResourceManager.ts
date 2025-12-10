/**
 * ResourceManager - Centralized resource lifecycle management
 *
 * Tracks and cleans up resources to prevent memory leaks.
 * Use this for managing event listeners, timers, and other resources
 * that need cleanup when an entity or system is destroyed.
 *
 * @example
 * class MyEntity extends Entity {
 *   private resourceManager = new ResourceManager();
 *
 *   init() {
 *     const listener = this.on(EntityEvent.TICK, () => {...});
 *     this.resourceManager.trackEventListener(listener);
 *
 *     const timer = setTimeout(() => {...}, 1000);
 *     this.resourceManager.trackTimer(timer);
 *   }
 *
 *   cleanup() {
 *     this.resourceManager.cleanup();
 *     this.despawn();
 *   }
 * }
 */

export class ResourceManager {
  private eventListeners: Set<any> = new Set();
  private timers: Set<NodeJS.Timeout> = new Set();
  private intervals: Set<NodeJS.Timeout> = new Set();
  private cleanupFunctions: Set<() => void> = new Set();

  /**
   * Track an event listener for cleanup
   * Note: Hytopia SDK event listeners may not have a remove() method,
   * so this is mainly for documentation and custom cleanup
   *
   * @param listener - Event listener to track
   */
  trackEventListener(listener: any): void {
    this.eventListeners.add(listener);
  }

  /**
   * Track a timeout for cleanup
   *
   * @param timer - setTimeout handle
   */
  trackTimer(timer: NodeJS.Timeout): void {
    this.timers.add(timer);
  }

  /**
   * Track an interval for cleanup
   *
   * @param interval - setInterval handle
   */
  trackInterval(interval: NodeJS.Timeout): void {
    this.intervals.add(interval);
  }

  /**
   * Track a custom cleanup function
   * Useful for complex cleanup logic
   *
   * @param fn - Function to call during cleanup
   */
  trackCleanup(fn: () => void): void {
    this.cleanupFunctions.add(fn);
  }

  /**
   * Clean up all tracked resources
   * Should be called when destroying the owning object
   */
  cleanup(): void {
    // Clear all timers
    this.timers.forEach(timer => {
      try {
        clearTimeout(timer);
      } catch (error) {
        console.error('Error clearing timer:', error);
      }
    });
    this.timers.clear();

    // Clear all intervals
    this.intervals.forEach(interval => {
      try {
        clearInterval(interval);
      } catch (error) {
        console.error('Error clearing interval:', error);
      }
    });
    this.intervals.clear();

    // Run custom cleanup functions
    this.cleanupFunctions.forEach(fn => {
      try {
        fn();
      } catch (error) {
        console.error('Error in cleanup function:', error);
      }
    });
    this.cleanupFunctions.clear();

    // Clear event listeners (note: SDK may handle this automatically)
    this.eventListeners.clear();
  }

  /**
   * Get count of tracked resources (for debugging)
   */
  getResourceCount(): {
    eventListeners: number;
    timers: number;
    intervals: number;
    cleanupFunctions: number;
  } {
    return {
      eventListeners: this.eventListeners.size,
      timers: this.timers.size,
      intervals: this.intervals.size,
      cleanupFunctions: this.cleanupFunctions.size
    };
  }

  /**
   * Check if any resources are tracked
   */
  hasResources(): boolean {
    return this.eventListeners.size > 0 ||
           this.timers.size > 0 ||
           this.intervals.size > 0 ||
           this.cleanupFunctions.size > 0;
  }
}
