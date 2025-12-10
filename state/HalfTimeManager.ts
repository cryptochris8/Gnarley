/**
 * HalfTimeManager
 *
 * Manages half-time logic including:
 * - Stoppage time calculation and tracking
 * - Half-end detection
 * - Transition logic between halves
 * - Logging intervals for time updates
 */

import { HALF_DURATION } from './gameConfig';

export interface GameState {
  currentHalf: number;
  halfTimeRemaining: number;
  timeRemaining: number;
  stoppageTimeAdded: number;
  stoppageTimeNotified: boolean;
  status: string;
  score: { red: number; blue: number };
  isHalftime: boolean;
  halftimeTimeRemaining: number;
}

export class HalfTimeManager {
  private state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  /**
   * Determines if stoppage time should be added
   * Stoppage time is added when 60 seconds remain and hasn't been added yet
   */
  public shouldAddStoppageTime(): boolean {
    return this.state.halfTimeRemaining === 60 && !this.state.stoppageTimeNotified;
  }

  /**
   * Calculates random stoppage time (15-59 seconds)
   */
  public calculateStoppageTime(): number {
    return Math.floor(Math.random() * 45) + 15; // Random 15-59 seconds
  }

  /**
   * Marks stoppage time as added and returns the amount
   */
  public addStoppageTime(): number {
    const stoppageTime = this.calculateStoppageTime();
    this.state.stoppageTimeAdded = stoppageTime;
    this.state.stoppageTimeNotified = true;
    return stoppageTime;
  }

  /**
   * Determines if the current half should end
   * Takes into account stoppage time logic
   */
  public shouldEndHalf(): boolean {
    // Calculate the exact endpoint: negative stoppage time value
    const stoppageTimeEndpoint = 0 - this.state.stoppageTimeAdded;

    // If stoppage time was added, check if we've reached the endpoint
    if (this.state.stoppageTimeNotified) {
      return this.state.halfTimeRemaining <= stoppageTimeEndpoint;
    }

    // Otherwise, end when regular time reaches 0
    return this.state.halfTimeRemaining <= 0;
  }

  /**
   * Returns the stoppage time endpoint (negative value)
   */
  public getStoppageTimeEndpoint(): number {
    return 0 - this.state.stoppageTimeAdded;
  }

  /**
   * Checks if currently in stoppage time
   */
  public isInStoppageTime(): boolean {
    return this.state.halfTimeRemaining <= 0;
  }

  /**
   * Gets the appropriate logging interval based on game phase
   * @returns Logging interval in seconds (10s for stoppage time, 30s for regular time)
   */
  public getLoggingInterval(): number {
    return this.isInStoppageTime() ? 10 : 30;
  }

  /**
   * Checks if the current time should trigger a log message
   */
  public shouldLog(): boolean {
    const logInterval = this.getLoggingInterval();
    return this.state.halfTimeRemaining % logInterval === 0;
  }

  /**
   * Gets formatted log message for current game time
   */
  public getTimeLogMessage(): string {
    if (this.isInStoppageTime()) {
      const stoppageSeconds = Math.abs(this.state.halfTimeRemaining);
      const halfMinutes = Math.floor(HALF_DURATION / 60);
      return `⏱️ STOPPAGE TIME: ${halfMinutes}+${stoppageSeconds}s (${stoppageSeconds}s into stoppage, ${this.state.stoppageTimeAdded}s total), Status: ${this.state.status}, Score: ${this.state.score.red}-${this.state.score.blue}`;
    } else {
      return `⏰ HALF ${this.state.currentHalf}: ${this.state.halfTimeRemaining}s remaining, Status: ${this.state.status}, Score: ${this.state.score.red}-${this.state.score.blue}`;
    }
  }

  /**
   * Checks if ticking sound should play
   * Plays in last 5 seconds of regulation OR last 5 seconds of stoppage time
   */
  public shouldPlayTickingSound(): boolean {
    // Play in last 5 seconds of regulation time
    if (this.state.halfTimeRemaining === 5) {
      return true;
    }

    // Play 5 seconds before stoppage time ends
    const stoppageTimeEndpoint = this.getStoppageTimeEndpoint();
    if (this.state.stoppageTimeNotified && this.state.halfTimeRemaining === (stoppageTimeEndpoint + 5)) {
      return true;
    }

    return false;
  }

  /**
   * Gets the notification message for stoppage time
   */
  public getStoppageTimeNotification(stoppageTime: number): string {
    return `${stoppageTime} seconds of stoppage time added`;
  }

  /**
   * Gets the half-end log message
   */
  public getHalfEndLogMessage(): string {
    const stoppageTimeEndpoint = this.getStoppageTimeEndpoint();

    if (this.state.stoppageTimeNotified) {
      return `⏰ HALF ${this.state.currentHalf} ENDED! Timer: ${this.state.halfTimeRemaining}s, Required: ${stoppageTimeEndpoint}s\n⏰ Stoppage time fully elapsed: ${this.state.stoppageTimeAdded}s added, ${Math.abs(this.state.halfTimeRemaining)}s played`;
    } else {
      return `⏰ HALF ${this.state.currentHalf} ENDED! Regular time finished, no stoppage time added`;
    }
  }

  /**
   * Determines what should happen at the end of a half
   * @returns 'halftime' if transitioning to halftime, 'end-of-regulation' if end of 2nd half
   */
  public getHalfEndTransition(): 'halftime' | 'end-of-regulation' | null {
    if (this.state.currentHalf === 1) {
      return 'halftime';
    } else if (this.state.currentHalf === 2) {
      return 'end-of-regulation';
    }
    return null;
  }

  /**
   * Prepares halftime state
   */
  public prepareHalftime(): void {
    this.state.isHalftime = true;
    this.state.halftimeTimeRemaining = 0; // Manual mode - no automatic countdown
    this.state.status = "halftime";
  }

  /**
   * Prepares for second half
   */
  public prepareSecondHalf(halfDuration: number): void {
    this.state.currentHalf = 2;
    this.state.halfTimeRemaining = halfDuration;
    this.state.timeRemaining = halfDuration;
    this.state.isHalftime = false;
    this.state.stoppageTimeNotified = false;
    this.state.stoppageTimeAdded = 0;
    this.state.status = "in-progress";
  }

  /**
   * Decrements the time counters
   */
  public decrementTime(): void {
    this.state.halfTimeRemaining--;
    this.state.timeRemaining--;
  }

  /**
   * Gets current half number
   */
  public getCurrentHalf(): number {
    return this.state.currentHalf;
  }

  /**
   * Gets stoppage time added amount
   */
  public getStoppageTimeAdded(): number {
    return this.state.stoppageTimeAdded;
  }

  /**
   * Checks if in halftime
   */
  public isHalftime(): boolean {
    return this.state.isHalftime;
  }
}
