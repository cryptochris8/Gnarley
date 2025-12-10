/**
 * ScoringService
 *
 * Manages goal scoring, score tracking, and momentum tracking.
 * Decoupled from game state for better separation of concerns.
 */

import type { World } from "hytopia";
import type { EventBus } from "../core/EventBus";

export interface Score {
  red: number;
  blue: number;
}

export interface MomentumData {
  consecutiveGoals: number;
  lastGoalTime: number;
}

export class ScoringService {
  private score: Score = { red: 0, blue: 0 };
  private teamMomentum: Record<"red" | "blue", MomentumData> = {
    red: { consecutiveGoals: 0, lastGoalTime: 0 },
    blue: { consecutiveGoals: 0, lastGoalTime: 0 }
  };
  private playerMomentum: Map<string, MomentumData> = new Map();

  constructor(
    private world: World,
    private eventBus: EventBus
  ) {}

  /**
   * Record a goal for a team
   * @param team - Team that scored
   * @param scorer - Optional player who scored
   * @param assistedBy - Optional player who assisted
   */
  public recordGoal(team: "red" | "blue", scorer?: string, assistedBy?: string): void {
    // Increment score
    this.score[team]++;
    console.log(`⚽ Goal scored! New score: Red ${this.score.red} - Blue ${this.score.blue}`);

    // Update team momentum
    const concedingTeam = team === "red" ? "blue" : "red";
    const currentTime = Date.now();

    this.teamMomentum[team].consecutiveGoals++;
    this.teamMomentum[team].lastGoalTime = currentTime;
    this.teamMomentum[concedingTeam].consecutiveGoals = 0; // Reset opponent's momentum

    // Update player momentum if scorer is provided
    if (scorer) {
      if (!this.playerMomentum.has(scorer)) {
        this.playerMomentum.set(scorer, { consecutiveGoals: 0, lastGoalTime: 0 });
      }
      const playerMomentumData = this.playerMomentum.get(scorer)!;
      playerMomentumData.consecutiveGoals++;
      playerMomentumData.lastGoalTime = currentTime;
    }

    // Emit goal-scored event
    this.eventBus.emit('goal-scored', {
      team,
      scorer,
      assistedBy
    });

    // Log momentum information
    this.logMomentum(team, scorer);
  }

  /**
   * Get current score
   * @returns Current score for both teams
   */
  public getScore(): Score {
    return { ...this.score };
  }

  /**
   * Get score for a specific team
   * @param team - Team to get score for
   * @returns Team's current score
   */
  public getTeamScore(team: "red" | "blue"): number {
    return this.score[team];
  }

  /**
   * Get team momentum data
   * @param team - Team to get momentum for
   * @returns Momentum data for the team
   */
  public getTeamMomentum(team: "red" | "blue"): MomentumData {
    return { ...this.teamMomentum[team] };
  }

  /**
   * Get player momentum data
   * @param playerId - Player ID to get momentum for
   * @returns Momentum data for the player or undefined
   */
  public getPlayerMomentum(playerId: string): MomentumData | undefined {
    const momentum = this.playerMomentum.get(playerId);
    return momentum ? { ...momentum } : undefined;
  }

  /**
   * Check if a team is on a scoring streak
   * @param team - Team to check
   * @param minGoals - Minimum consecutive goals to be considered a streak
   * @returns Whether the team is on a streak
   */
  public isOnStreak(team: "red" | "blue", minGoals: number = 2): boolean {
    return this.teamMomentum[team].consecutiveGoals >= minGoals;
  }

  /**
   * Check if a player is on a scoring streak (hat-trick, etc.)
   * @param playerId - Player to check
   * @param minGoals - Minimum consecutive goals (default 3 for hat-trick)
   * @returns Whether the player is on a streak
   */
  public isPlayerOnStreak(playerId: string, minGoals: number = 3): boolean {
    const momentum = this.playerMomentum.get(playerId);
    return momentum ? momentum.consecutiveGoals >= minGoals : false;
  }

  /**
   * Reset the score
   */
  public resetScore(): void {
    this.score = { red: 0, blue: 0 };
    console.log("🔄 Score reset to 0-0");
  }

  /**
   * Reset team momentum
   */
  public resetTeamMomentum(): void {
    this.teamMomentum = {
      red: { consecutiveGoals: 0, lastGoalTime: 0 },
      blue: { consecutiveGoals: 0, lastGoalTime: 0 }
    };
    console.log("🔄 Team momentum reset");
  }

  /**
   * Reset player momentum
   */
  public resetPlayerMomentum(): void {
    this.playerMomentum.clear();
    console.log("🔄 Player momentum reset");
  }

  /**
   * Reset all scoring data
   */
  public reset(): void {
    this.resetScore();
    this.resetTeamMomentum();
    this.resetPlayerMomentum();
  }

  /**
   * Set score directly (for testing or special cases)
   * @param red - Red team score
   * @param blue - Blue team score
   */
  public setScore(red: number, blue: number): void {
    this.score = { red, blue };
    console.log(`📊 Score set to: Red ${red} - Blue ${blue}`);
  }

  /**
   * Get the winning team
   * @returns "red", "blue", or "tie"
   */
  public getWinner(): "red" | "blue" | "tie" {
    if (this.score.red > this.score.blue) return "red";
    if (this.score.blue > this.score.red) return "blue";
    return "tie";
  }

  /**
   * Get score difference
   * @returns Absolute difference between team scores
   */
  public getScoreDifference(): number {
    return Math.abs(this.score.red - this.score.blue);
  }

  /**
   * Check if the game is tied
   * @returns Whether the scores are equal
   */
  public isTied(): boolean {
    return this.score.red === this.score.blue;
  }

  /**
   * Log momentum information to console
   * @param team - Team that scored
   * @param scorer - Optional player who scored
   */
  private logMomentum(team: "red" | "blue", scorer?: string): void {
    // Log player momentum (hat-trick, etc.)
    if (scorer && this.playerMomentum.has(scorer)) {
      const playerMomentumData = this.playerMomentum.get(scorer)!;
      if (playerMomentumData.consecutiveGoals >= 3) {
        console.log(`🔥 ${scorer} has scored ${playerMomentumData.consecutiveGoals} consecutive goals!`);
      }
    }

    // Log team momentum
    if (this.teamMomentum[team].consecutiveGoals >= 2) {
      console.log(`🔥 ${team} team is on fire with ${this.teamMomentum[team].consecutiveGoals} consecutive goals!`);
    }
  }

  /**
   * Get all momentum data for debugging/stats
   * @returns Complete momentum data
   */
  public getMomentumData(): {
    teamMomentum: Record<"red" | "blue", MomentumData>;
    playerMomentum: Map<string, MomentumData>;
  } {
    return {
      teamMomentum: {
        red: { ...this.teamMomentum.red },
        blue: { ...this.teamMomentum.blue }
      },
      playerMomentum: new Map(this.playerMomentum)
    };
  }
}
