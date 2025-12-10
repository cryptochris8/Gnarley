/**
 * MatchTimeService
 *
 * Manages match timing including halves, stoppage time, overtime, and game loop.
 * Decoupled from game state for better separation of concerns.
 */

import type { World } from "hytopia";
import type { EventBus } from "../core/EventBus";
import { HalfTimeManager } from "../state/HalfTimeManager";
import { HALF_DURATION } from "../state/gameConfig";

export interface MatchTimeState {
  timeRemaining: number;
  halfTimeRemaining: number;
  currentHalf: number;
  isHalftime: boolean;
  halftimeTimeRemaining: number;
  stoppageTimeAdded: number;
  stoppageTimeNotified: boolean;
  overtimeTimeRemaining: number;
  status: string;
}

export class MatchTimeService {
  private gameLoopInterval: NodeJS.Timeout | null = null;
  private halfTimeManager: HalfTimeManager;
  private tickCallback?: () => void;

  constructor(
    private world: World,
    private eventBus: EventBus,
    private timeState: MatchTimeState
  ) {
    this.halfTimeManager = new HalfTimeManager(timeState as any);
  }

  /**
   * Start the game loop (1 second intervals)
   * @param onTick - Optional callback to run on each tick
   */
  public startGameLoop(onTick?: () => void): void {
    if (this.gameLoopInterval) {
      console.warn("⚠️ Game loop already running");
      return;
    }

    this.tickCallback = onTick;
    this.gameLoopInterval = setInterval(() => {
      this.gameTick();
    }, 1000); // Update every second

    console.log("▶️ Game loop started");
  }

  /**
   * Stop the game loop
   */
  public stopGameLoop(): void {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
      console.log("⏸️ Game loop stopped");
    }
  }

  /**
   * Main game tick (called every second)
   */
  private gameTick(): void {
    // Call external tick callback if provided
    if (this.tickCallback) {
      this.tickCallback();
    }

    // Handle overtime separately
    if (this.timeState.status === "overtime") {
      this.handleOvertimeTick();
      return;
    }

    // Regular game time
    if (this.timeState.status === "playing") {
      this.handleRegularTimeTick();
    }
  }

  /**
   * Handle overtime tick
   */
  private handleOvertimeTick(): void {
    // Check if overtime is over
    if (this.timeState.halfTimeRemaining <= 0) {
      this.handleOvertimeEnd();
      return;
    }

    // Decrement overtime timer
    this.timeState.halfTimeRemaining--;
    this.timeState.timeRemaining = this.timeState.halfTimeRemaining;

    // Play ticking sound in last 5 seconds
    if (this.timeState.halfTimeRemaining === 5) {
      this.eventBus.emit('music-change', { track: 'gameplay' }); // Trigger ticking
    }

    // Log every 10 seconds during overtime
    if (this.timeState.halfTimeRemaining % 10 === 0) {
      console.log(`⏱️ OVERTIME: ${this.timeState.halfTimeRemaining}s remaining (sudden death)`);
    }
  }

  /**
   * Handle regular time tick
   */
  private handleRegularTimeTick(): void {
    // Decrement time
    this.halfTimeManager.decrementTime();

    // Check for stoppage time
    if (this.halfTimeManager.shouldAddStoppageTime()) {
      const stoppageTime = this.halfTimeManager.addStoppageTime();
      console.log(`⏱️ STOPPAGE TIME: ${stoppageTime} seconds added to half ${this.timeState.currentHalf}`);

      // Emit stoppage time event
      this.eventBus.emit('stoppage-time-added', {
        seconds: stoppageTime,
        half: this.timeState.currentHalf
      });
    }

    // Check if half should end
    if (this.halfTimeManager.shouldEndHalf()) {
      console.log(this.halfTimeManager.getHalfEndLogMessage());
      this.handleHalfEnd();
      return;
    }

    // Log time updates
    if (this.halfTimeManager.shouldLog()) {
      console.log(this.halfTimeManager.getTimeLogMessage());
    }

    // Play ticking sound when appropriate
    if (this.halfTimeManager.shouldPlayTickingSound()) {
      this.eventBus.emit('music-change', { track: 'gameplay' }); // Trigger ticking
    }
  }

  /**
   * Handle end of a half
   */
  private handleHalfEnd(): void {
    this.stopGameLoop();

    const transition = this.halfTimeManager.getHalfEndTransition();

    // Emit half-ended event
    this.eventBus.emit('half-ended', { half: this.timeState.currentHalf });

    if (transition === 'halftime') {
      this.startHalftime();
    } else if (transition === 'end-of-regulation') {
      this.handleEndOfRegulation();
    }
  }

  /**
   * Start halftime break
   */
  private startHalftime(): void {
    console.log("🏟️ Starting halftime break - MANUAL MODE");

    this.halfTimeManager.prepareHalftime();
    this.eventBus.emit('halftime-started');

    this.world.chatManager.sendBroadcastMessage(
      `Halftime! Score will be shown in stats display`
    );
  }

  /**
   * Start the second half
   */
  public startSecondHalf(): void {
    console.log("🏟️ Starting second half");

    if (!this.timeState.isHalftime) {
      console.warn("⚠️ Cannot start second half - not in halftime!");
      return;
    }

    // Prepare state for second half
    this.halfTimeManager.prepareSecondHalf(HALF_DURATION);

    // Emit halftime-ended event
    this.eventBus.emit('halftime-ended');

    // Emit half-started event
    this.eventBus.emit('half-started', { half: 2 });

    // Restart game loop
    this.startGameLoop(this.tickCallback);

    console.log("✅ Second half started successfully");
  }

  /**
   * Handle end of regulation time (after 2 halves)
   */
  private handleEndOfRegulation(): void {
    console.log("⏰ END OF REGULATION TIME!");
    console.log(`⏰ Final Score: Tied game detected`);

    this.stopGameLoop();

    // Emit event for stats display
    this.eventBus.emit('half-ended', { half: 2 });

    // Check if overtime is needed (game is tied)
    // This logic should be handled by the orchestrator, not here
    // For now, just stop the loop and let external logic decide
  }

  /**
   * Start overtime (sudden death)
   */
  public startOvertime(): void {
    console.log("⚡ Starting OVERTIME (sudden death)");

    this.timeState.status = "overtime";
    this.timeState.halfTimeRemaining = 60; // 1 minute overtime
    this.timeState.timeRemaining = 60;
    this.timeState.overtimeTimeRemaining = 60;

    // Emit overtime-started event
    this.eventBus.emit('overtime-started');

    this.world.chatManager.sendBroadcastMessage(
      "⚡ OVERTIME! Sudden death - first goal wins!"
    );

    // Start game loop for overtime
    this.startGameLoop(this.tickCallback);

    console.log("✅ Overtime started successfully");
  }

  /**
   * Handle overtime end
   */
  private handleOvertimeEnd(): void {
    console.log("⏰ OVERTIME TIME UP!");

    this.stopGameLoop();

    // Game ended in a tie
    this.world.chatManager.sendBroadcastMessage(
      "Overtime ended! Match ends in a tie!"
    );

    // Emit match-ended event (will be handled by orchestrator)
    this.timeState.status = "finished";
  }

  /**
   * Get current time remaining
   */
  public getTimeRemaining(): number {
    return this.timeState.timeRemaining;
  }

  /**
   * Get current half time remaining
   */
  public getHalfTimeRemaining(): number {
    return this.timeState.halfTimeRemaining;
  }

  /**
   * Get current half number
   */
  public getCurrentHalf(): number {
    return this.timeState.currentHalf;
  }

  /**
   * Check if in halftime
   */
  public isHalftime(): boolean {
    return this.timeState.isHalftime;
  }

  /**
   * Check if in overtime
   */
  public isOvertime(): boolean {
    return this.timeState.status === "overtime";
  }

  /**
   * Check if game loop is running
   */
  public isRunning(): boolean {
    return this.gameLoopInterval !== null;
  }

  /**
   * Force end current half (emergency/debug)
   */
  public forceEndHalf(): void {
    console.log("🛑 Force ending current half");
    this.handleHalfEnd();
  }

  /**
   * Reset time state for new game
   */
  public reset(): void {
    this.stopGameLoop();

    this.timeState.timeRemaining = HALF_DURATION;
    this.timeState.halfTimeRemaining = HALF_DURATION;
    this.timeState.currentHalf = 1;
    this.timeState.isHalftime = false;
    this.timeState.halftimeTimeRemaining = 0;
    this.timeState.stoppageTimeAdded = 0;
    this.timeState.stoppageTimeNotified = false;
    this.timeState.overtimeTimeRemaining = 0;

    console.log("🔄 Match time reset");
  }

  /**
   * Get time statistics
   */
  public getTimeStats(): {
    currentHalf: number;
    timeRemaining: number;
    halfTimeRemaining: number;
    isHalftime: boolean;
    isOvertime: boolean;
    stoppageTimeAdded: number;
    isInStoppageTime: boolean;
  } {
    return {
      currentHalf: this.timeState.currentHalf,
      timeRemaining: this.timeState.timeRemaining,
      halfTimeRemaining: this.timeState.halfTimeRemaining,
      isHalftime: this.timeState.isHalftime,
      isOvertime: this.isOvertime(),
      stoppageTimeAdded: this.timeState.stoppageTimeAdded,
      isInStoppageTime: this.halfTimeManager.isInStoppageTime()
    };
  }

  /**
   * Set custom tick callback
   */
  public setTickCallback(callback: () => void): void {
    this.tickCallback = callback;
  }

  /**
   * Cleanup (call when service is destroyed)
   */
  public destroy(): void {
    this.stopGameLoop();
  }
}
