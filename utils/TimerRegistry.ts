/**
 * TimerRegistry - Centralized timer tracking to prevent memory leaks
 *
 * All setInterval and setTimeout calls should be registered here
 * so they can be properly cleaned up when matches end or modes change.
 */

export interface TimerEntry {
  id: string;
  timer: NodeJS.Timeout;
  context: string;  // e.g., "arcade-mode", "match-timer", "ai-player-123"
  type: 'interval' | 'timeout';
  createdAt: number;
}

export class TimerRegistry {
  private timers: Map<string, TimerEntry> = new Map();

  /**
   * Register a timer for tracking and automatic cleanup
   * @param id - Unique identifier for this timer
   * @param timer - The NodeJS.Timeout from setInterval/setTimeout
   * @param context - Context string for batch cleanup (e.g., "arcade-mode", "match", "ai-player-123")
   * @param type - Whether this is an interval or timeout
   */
  register(id: string, timer: NodeJS.Timeout, context: string, type: 'interval' | 'timeout' = 'interval'): void {
    // If a timer with this ID already exists, clear it first
    if (this.timers.has(id)) {
      console.warn(`⚠️ TimerRegistry: Timer with id "${id}" already exists. Clearing old timer.`);
      this.unregister(id);
    }

    const entry: TimerEntry = {
      id,
      timer,
      context,
      type,
      createdAt: Date.now()
    };

    this.timers.set(id, entry);
    console.log(`✅ TimerRegistry: Registered ${type} "${id}" in context "${context}"`);
  }

  /**
   * Unregister and clear a specific timer by ID
   * @param id - The timer ID to unregister
   */
  unregister(id: string): void {
    const entry = this.timers.get(id);
    if (entry) {
      if (entry.type === 'interval') {
        clearInterval(entry.timer);
      } else {
        clearTimeout(entry.timer);
      }
      this.timers.delete(id);
      console.log(`🗑️ TimerRegistry: Unregistered ${entry.type} "${id}" from context "${entry.context}"`);
    }
  }

  /**
   * Clear all timers matching a specific context
   * Useful for cleaning up mode-specific timers or player-specific timers
   * @param context - The context string to match
   */
  clearByContext(context: string): void {
    let clearedCount = 0;

    for (const [id, entry] of this.timers.entries()) {
      if (entry.context === context) {
        if (entry.type === 'interval') {
          clearInterval(entry.timer);
        } else {
          clearTimeout(entry.timer);
        }
        this.timers.delete(id);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      console.log(`🧹 TimerRegistry: Cleared ${clearedCount} timer(s) from context "${context}"`);
    }
  }

  /**
   * Clear all registered timers
   * Use this during server shutdown or complete reset
   */
  clearAll(): void {
    const totalCount = this.timers.size;

    for (const [id, entry] of this.timers.entries()) {
      if (entry.type === 'interval') {
        clearInterval(entry.timer);
      } else {
        clearTimeout(entry.timer);
      }
    }

    this.timers.clear();

    if (totalCount > 0) {
      console.log(`🧹 TimerRegistry: Cleared all ${totalCount} timer(s)`);
    }
  }

  /**
   * Get all currently active timers
   * Useful for debugging and monitoring
   */
  getActiveTimers(): TimerEntry[] {
    return Array.from(this.timers.values());
  }

  /**
   * Get all timers for a specific context
   * @param context - The context string to filter by
   */
  getTimersByContext(context: string): TimerEntry[] {
    return Array.from(this.timers.values()).filter(entry => entry.context === context);
  }

  /**
   * Get debugging information about active timers
   */
  getDebugInfo(): string {
    const contextGroups = new Map<string, number>();

    for (const entry of this.timers.values()) {
      const count = contextGroups.get(entry.context) || 0;
      contextGroups.set(entry.context, count + 1);
    }

    const lines = [`Total active timers: ${this.timers.size}`];
    for (const [context, count] of contextGroups.entries()) {
      lines.push(`  - ${context}: ${count} timer(s)`);
    }

    return lines.join('\n');
  }
}

// Global singleton instance
export const globalTimerRegistry = new TimerRegistry();
