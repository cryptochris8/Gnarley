// Match timer management with stoppage time and half transitions

import { MATCH_DURATION, HALF_DURATION, HALFTIME_DURATION } from "../gameConfig";

export interface TimerState {
  currentHalf: number;
  halfTimeRemaining: number;
  isHalftime: boolean;
  halftimeTimeRemaining: number;
  stoppageTimeAdded: number;
  stoppageTimeNotified: boolean;
  timeRemaining: number;
  overtimeTimeRemaining: number;
}

export class MatchTimer {
  private state: TimerState;

  constructor() {
    this.state = {
      currentHalf: 1,
      halfTimeRemaining: HALF_DURATION,
      isHalftime: false,
      halftimeTimeRemaining: 0,
      stoppageTimeAdded: 0,
      stoppageTimeNotified: false,
      timeRemaining: MATCH_DURATION,
      overtimeTimeRemaining: 0
    };
    console.log("MatchTimer initialized");
  }

  /**
   * Decrement time counters
   */
  decrementTime(): void {
    if (this.state.isHalftime) {
      return; // Manual halftime - no automatic countdown
    }

    this.state.halfTimeRemaining--;
    this.state.timeRemaining--;
  }

  /**
   * Check if stoppage time should be added
   * @returns True if stoppage time should be added
   */
  shouldAddStoppageTime(): boolean {
    // Add stoppage time when 60 seconds remaining and not yet notified
    return this.state.halfTimeRemaining === 60 && !this.state.stoppageTimeNotified;
  }

  /**
   * Add stoppage time to current half
   * @returns Amount of stoppage time added
   */
  addStoppageTime(): number {
    // Calculate stoppage time (1-3 minutes)
    const stoppageTime = Math.floor(Math.random() * 3) + 1;
    this.state.stoppageTimeAdded = stoppageTime * 60; // Convert to seconds
    this.state.stoppageTimeNotified = true;
    return this.state.stoppageTimeAdded;
  }

  /**
   * Check if half should end
   * @returns True if half should end
   */
  shouldEndHalf(): boolean {
    // Half ends when timer reaches negative value equal to stoppage time
    const endThreshold = -this.state.stoppageTimeAdded;
    return this.state.halfTimeRemaining <= endThreshold;
  }

  /**
   * Check if ticking sound should play
   * @returns True if ticking sound should play
   */
  shouldPlayTickingSound(): boolean {
    // Play in last 5 seconds (including stoppage time)
    const effectiveTimeRemaining = this.state.halfTimeRemaining;
    return effectiveTimeRemaining === 5;
  }

  /**
   * Check if time should be logged
   * @returns True if time should be logged
   */
  shouldLog(): boolean {
    return this.state.halfTimeRemaining % 30 === 0 || this.state.halfTimeRemaining <= 10;
  }

  /**
   * Get log message for current time
   * @returns Log message
   */
  getTimeLogMessage(): string {
    if (this.state.halfTimeRemaining > 0) {
      return `⏰ ${this.state.currentHalf === 1 ? '1st' : '2nd'} Half: ${this.state.halfTimeRemaining}s remaining`;
    } else {
      const stoppageTimeElapsed = Math.abs(this.state.halfTimeRemaining);
      return `⏰ ${this.state.currentHalf === 1 ? '1st' : '2nd'} Half: Stoppage Time +${stoppageTimeElapsed}s (ends at +${this.state.stoppageTimeAdded}s)`;
    }
  }

  /**
   * Get half end log message
   * @returns Half end log message
   */
  getHalfEndLogMessage(): string {
    return `⏰ END OF ${this.state.currentHalf === 1 ? '1ST' : '2ND'} HALF! ${this.state.stoppageTimeAdded > 0 ? `(${this.state.stoppageTimeAdded}s stoppage time played)` : ''}`;
  }

  /**
   * Get stoppage time notification message
   * @param stoppageTime - Amount of stoppage time
   * @returns Notification message
   */
  getStoppageTimeNotification(stoppageTime: number): string {
    return `${stoppageTime / 60} ${stoppageTime === 60 ? 'minute' : 'minutes'} of stoppage time will be added to the ${this.state.currentHalf === 1 ? 'first' : 'second'} half`;
  }

  /**
   * Start halftime
   */
  startHalftime(): void {
    this.state.isHalftime = true;
    this.state.halftimeTimeRemaining = 0; // Manual halftime - no automatic countdown
  }

  /**
   * End halftime and start second half
   */
  endHalftime(): void {
    this.state.isHalftime = false;
    this.state.halftimeTimeRemaining = 0;
    this.state.currentHalf = 2;
    this.state.halfTimeRemaining = HALF_DURATION;
    this.state.timeRemaining = HALF_DURATION;
    this.state.stoppageTimeAdded = 0;
    this.state.stoppageTimeNotified = false;
  }

  /**
   * Start overtime
   * @param duration - Duration of overtime in seconds
   */
  startOvertime(duration: number): void {
    this.state.halfTimeRemaining = duration;
    this.state.timeRemaining = duration;
    this.state.overtimeTimeRemaining = duration;
  }

  /**
   * Check if overtime has ended
   * @returns True if overtime has ended
   */
  isOvertimeEnded(): boolean {
    return this.state.halfTimeRemaining <= 0;
  }

  /**
   * Get current timer state
   * @returns Timer state
   */
  getState(): TimerState {
    return { ...this.state };
  }

  /**
   * Get current half
   * @returns Current half number
   */
  getCurrentHalf(): number {
    return this.state.currentHalf;
  }

  /**
   * Get time remaining
   * @returns Time remaining in seconds
   */
  getTimeRemaining(): number {
    return this.state.timeRemaining;
  }

  /**
   * Get half time remaining
   * @returns Half time remaining in seconds
   */
  getHalfTimeRemaining(): number {
    return this.state.halfTimeRemaining;
  }

  /**
   * Check if in halftime
   * @returns True if in halftime
   */
  isInHalftime(): boolean {
    return this.state.isHalftime;
  }

  /**
   * Reset timer to initial state
   */
  reset(): void {
    this.state = {
      currentHalf: 1,
      halfTimeRemaining: HALF_DURATION,
      isHalftime: false,
      halftimeTimeRemaining: 0,
      stoppageTimeAdded: 0,
      stoppageTimeNotified: false,
      timeRemaining: MATCH_DURATION,
      overtimeTimeRemaining: 0
    };
    console.log("Timer reset to initial state");
  }
}
