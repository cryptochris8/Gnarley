// Game event emission coordination using globalEventBus

import { PlayerManager } from "hytopia";
import { globalEventBus } from "../../utils/globalEventBus";

export class GameEventEmitter {
  constructor() {
    console.log("GameEventEmitter initialized");
  }

  /**
   * Send data to all players
   * @param data - Data to send
   */
  sendDataToAllPlayers(data: any): void {
    PlayerManager.instance.getConnectedPlayers().forEach((player) => {
      player.ui.sendData(data);
    });
  }

  /**
   * Emit goal scored event
   * @param team - Team that scored
   */
  emitGoalScored(team: "red" | "blue"): void {
    globalEventBus.emit('goal-scored', { team });
  }

  /**
   * Emit game state update
   * @param state - Game state data
   */
  emitGameStateUpdate(state: any): void {
    this.sendDataToAllPlayers({
      type: "game-state",
      ...state
    });
  }

  /**
   * Emit team counts update
   * @param red - Red team count
   * @param blue - Blue team count
   * @param maxPlayers - Max players per team
   */
  emitTeamCounts(red: number, blue: number, maxPlayers: number): void {
    this.sendDataToAllPlayers({
      type: "team-counts",
      red,
      blue,
      maxPlayers
    });
  }

  /**
   * Emit countdown
   * @param count - Countdown text
   */
  emitCountdown(count: string): void {
    this.sendDataToAllPlayers({
      type: "countdown",
      count
    });
  }

  /**
   * Emit coin toss
   */
  emitCoinToss(): void {
    this.sendDataToAllPlayers({
      type: "coin-toss",
      message: "Coin Toss: Choose Heads or Tails"
    });
  }

  /**
   * Emit coin toss result
   * @param result - Coin toss result
   * @param kickoffTeam - Team that won kickoff
   */
  emitCoinTossResult(result: "heads" | "tails", kickoffTeam: "red" | "blue"): void {
    this.sendDataToAllPlayers({
      type: "coin-toss-result",
      result,
      kickoffTeam
    });
  }

  /**
   * Emit half stats
   * @param stats - Half stats data
   */
  emitHalfStats(stats: any): void {
    this.sendDataToAllPlayers({
      type: "half-stats",
      ...stats
    });
  }

  /**
   * Emit halftime stats
   * @param stats - Halftime stats data
   */
  emitHalftimeStats(stats: any): void {
    this.sendDataToAllPlayers({
      type: "halftime-stats",
      ...stats
    });
  }

  /**
   * Emit regulation time stats
   * @param stats - Regulation time stats data
   */
  emitRegulationTimeStats(stats: any): void {
    this.sendDataToAllPlayers({
      type: "regulation-time-stats",
      ...stats
    });
  }

  /**
   * Emit game over
   * @param data - Game over data
   */
  emitGameOver(data: any): void {
    this.sendDataToAllPlayers({
      type: "game-over",
      ...data
    });
  }

  /**
   * Emit game reset
   */
  emitGameReset(): void {
    this.sendDataToAllPlayers({
      type: "game-reset",
      message: "Game has been reset. Please select your team again."
    });
  }

  /**
   * Emit goal scored notification
   * @param team - Team that scored
   * @param score - Current score
   * @param kickoffTeam - Team that will kick off
   * @param consecutiveGoals - Optional consecutive goals for momentum indicator
   */
  emitGoalScoredNotification(
    team: "red" | "blue",
    score: { red: number, blue: number },
    kickoffTeam: "red" | "blue",
    consecutiveGoals?: number
  ): void {
    this.sendDataToAllPlayers({
      type: "goal-scored",
      team,
      score,
      kickoffTeam,
      consecutiveGoals: consecutiveGoals || 1  // TIER 1: Include momentum data for ON FIRE indicator
    });
  }

  /**
   * TIER 1: Emit momentum update to all players
   * @param team - Team with momentum
   * @param consecutiveGoals - Number of consecutive goals
   */
  emitMomentumUpdate(team: "red" | "blue", consecutiveGoals: number): void {
    this.sendDataToAllPlayers({
      type: "momentum-update",
      team,
      consecutiveGoals
    });
  }

  /**
   * Emit player stats update
   * @param playerStats - Player stats array
   */
  emitPlayerStatsUpdate(playerStats: any[]): void {
    this.sendDataToAllPlayers({
      type: "player-stats-update",
      playerStats
    });
  }

  /**
   * Emit stoppage time notification
   * @param stoppageTimeAdded - Stoppage time added
   * @param message - Notification message
   * @param half - Current half
   */
  emitStoppageTimeNotification(stoppageTimeAdded: number, message: string, half: number): void {
    this.sendDataToAllPlayers({
      type: "stoppage-time-notification",
      stoppageTimeAdded,
      message,
      half
    });
  }
}
