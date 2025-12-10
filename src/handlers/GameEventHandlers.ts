/**
 * GameEventHandlers - Handles game-level events
 *
 * Manages global game events including:
 * - Game over (score display, stats, cleanup, reset)
 *
 * Extracted from index.ts (lines 291-361) to reduce file size.
 */

import { World } from "hytopia";
import { SoccerGame } from "../../state/gameState";
import AIPlayerEntity from "../../entities/AIPlayerEntity";
import sharedState from "../../state/sharedState";
import { logger } from "../../utils/GameLogger";

export interface GameEventDependencies {
  world: World;
  game: SoccerGame | null;
  aiPlayers: AIPlayerEntity[];
  sharedState: typeof sharedState;
}

/**
 * Game over event data structure
 */
export interface GameOverData {
  redScore: number;
  blueScore: number;
  playerStats: Array<{
    name: string;
    team: string;
    role: string;
    goals: number;
    tackles: number;
    passes: number;
    shots: number;
    saves: number;
    distanceTraveled: number;
  }>;
  teamStats: any;
  winner: string;
  matchDuration: number;
  wasOvertime: boolean;
}

export class GameEventHandlers {
  private deps: GameEventDependencies;

  constructor(deps: GameEventDependencies) {
    this.deps = deps;
  }

  /**
   * Register all game event handlers
   */
  registerAll(): void {
    this.registerGameOverHandler();
  }

  /**
   * Register the game-over event handler
   * Handles end-of-game cleanup, stats display, and reset
   */
  private registerGameOverHandler(): void {
    this.deps.world.on("game-over" as any, ((data: GameOverData) => {
      logger.info("Game over", data);

      // Send game-over stats to all players
      this.deps.world.entityManager.getAllPlayerEntities().forEach((playerEntity) => {
        playerEntity.player.ui.sendData({
          type: "game-over",
          redScore: data.redScore,
          blueScore: data.blueScore,
          playerStats: data.playerStats,
          teamStats: data.teamStats,
          winner: data.winner,
          matchDuration: data.matchDuration,
          wasOvertime: data.wasOvertime,
        });
      });

      // Clean up active AI players and remove from shared state
      this.deps.aiPlayers.forEach((ai) => {
        if (ai.isSpawned) {
          ai.deactivate();
          this.deps.sharedState.removeAIFromTeam(ai, ai.team);
        }
      });
      this.deps.aiPlayers.length = 0; // Clear the array

      // Reset game state if game is initialized
      if (this.deps.game) {
        this.deps.game.resetGame(); // Reset the game state to waiting
      }

      // Reload UI for all players after game reset
      this.deps.world.entityManager.getAllPlayerEntities().forEach((playerEntity) => {
        const player = playerEntity.player;
        player.ui.load("ui/index.html");

        // CRITICAL: Unlock pointer for UI interactions after reset (Hytopia-compliant approach)
        player.ui.lockPointer(false);
        logger.info(
          `<� Pointer unlocked for ${player.username} after game reset - UI interactions enabled`
        );

        player.ui.sendData({
          type: "team-counts",
          red: this.deps.game ? this.deps.game.getPlayerCountOnTeam("red") : 0,
          blue: this.deps.game ? this.deps.game.getPlayerCountOnTeam("blue") : 0,
          maxPlayers: 6,
          singlePlayerMode: true,
        });

        player.ui.sendData({
          type: "focus-on-instructions",
        });
      });

      logger.info(" Game over handled - UI reset complete");
    }) as any);
  }
}
