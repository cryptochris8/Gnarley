// Timer cleanup registry for crash prevention

export interface TimerReference {
  id: NodeJS.Timeout;
  type: string;
  created: number;
  playerId?: string;
}

export class ArcadeTimerManager {
  private activeTimers: TimerReference[] = [];
  private isDestroyed: boolean = false;

  constructor() {
    console.log("ArcadeTimerManager initialized");
  }

  /**
   * Register a timer for cleanup tracking
   * @param timer - The timer to track
   * @param type - Type of timer (interval/timeout)
   * @param playerId - Optional player ID associated with timer
   * @returns The timer reference
   */
  registerTimer(timer: NodeJS.Timeout, type: string, playerId?: string): NodeJS.Timeout {
    if (this.isDestroyed) {
      clearTimeout(timer);
      return timer;
    }

    const timerRef: TimerReference = {
      id: timer,
      type,
      created: Date.now(),
      playerId
    };

    this.activeTimers.push(timerRef);

    // Auto-cleanup old timers (older than 5 minutes)
    this.cleanupOldTimers();

    return timer;
  }

  /**
   * Clear all registered timers
   */
  clearAllTimers(): void {
    console.log(`🧹 Clearing ${this.activeTimers.length} active timers...`);

    this.activeTimers.forEach(timerRef => {
      try {
        if (timerRef.type === 'interval') {
          clearInterval(timerRef.id);
        } else {
          clearTimeout(timerRef.id);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to clear timer ${timerRef.type}:`, error);
      }
    });

    this.activeTimers = [];
  }

  /**
   * Cleanup timers older than max age
   */
  private cleanupOldTimers(): void {
    const maxAge = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    this.activeTimers = this.activeTimers.filter(timerRef => {
      if (now - timerRef.created > maxAge) {
        console.warn(`🧹 Cleaning up old timer (${timerRef.type}) from ${new Date(timerRef.created).toISOString()}`);
        try {
          clearTimeout(timerRef.id);
        } catch (error) {
          console.warn("⚠️ Failed to clear old timer:", error);
        }
        return false;
      }
      return true;
    });
  }

  /**
   * Mark manager as destroyed
   */
  destroy(): void {
    this.isDestroyed = true;
    this.clearAllTimers();
  }

  /**
   * Check if manager is destroyed
   */
  get destroyed(): boolean {
    return this.isDestroyed;
  }
}
