/**
 * PlayerEventHandlers - Handles player join/leave events
 *
 * Manages player lifecycle events including:
 * - Player joined world (welcome, UI loading, initial setup)
 * - Player left world (cleanup, game reset logic)
 *
 * Extracted from index.ts (lines 363-1782) to reduce file size.
 * Works in conjunction with UIEventHandlers for UI interactions.
 */

import { World, PlayerEvent, Player } from "hytopia";
import { SoccerGame } from "../../state/gameState";
import AIPlayerEntity from "../../entities/AIPlayerEntity";
import SoccerPlayerEntity from "../../entities/SoccerPlayerEntity";
import { AudioManager } from "../core/AudioManager";
import { logger } from "../../utils/GameLogger";
import sharedState from "../../state/sharedState";
import spectatorMode from "../../utils/observerMode";
import { FIFACrowdManager } from "../../utils/fifaCrowdManager";
import { PickupGameManager } from "../../state/pickupGameManager";
import { UIEventHandlers } from "./UIEventHandlers";

export interface PlayerEventDependencies {
  world: World;
  game: SoccerGame | null;
  aiPlayers: AIPlayerEntity[];
  audioManager: AudioManager;
  sharedState: typeof sharedState;
  spectatorMode: typeof spectatorMode;
  fifaCrowdManager: FIFACrowdManager;
  pickupManager: PickupGameManager;
  uiEventHandlers: UIEventHandlers;
  musicStarted: { value: boolean }; // Wrapped in object for mutability
}

export class PlayerEventHandlers {
  private deps: PlayerEventDependencies;

  constructor(deps: PlayerEventDependencies) {
    this.deps = deps;
  }

  /**
   * Register all player event handlers
   */
  registerAll(): void {
    this.registerPlayerJoinedHandler();
    this.registerPlayerLeftHandler();
  }

  /**
   * Register player joined world event handler
   * Handles initial setup when player connects to the server
   */
  private registerPlayerJoinedHandler(): void {
    this.deps.world.on(PlayerEvent.JOINED_WORLD, async ({ player }) => {
      logger.info(`Player ${player.username} joined world`);

      // Welcome message for new players
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "<� Welcome to Hytopia Soccer! Use /spectate to watch games when teams are full."
      );

      // Load UI first - it will detect mobile client-side
      player.ui.load("ui/index.html");

      // CRITICAL: Unlock pointer for UI interactions (Hytopia-compliant approach)
      player.ui.lockPointer(false);
      logger.debug(`<� Pointer unlocked for ${player.username} - UI interactions enabled`);

      // NOTE: Opening music will start when user clicks game mode button
      // Cannot autoplay audio before user gesture due to browser restrictions

      // Check game state
      if (this.deps.game && this.deps.game.inProgress()) {
        return this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Game is already in progress, you can fly around and spectate!"
        );
      }

      // Send initial UI data
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

      // Register UI event handlers for this player
      // The UIEventHandlers class will handle all UI interactions
      // Mobile detection will happen in the UI and trigger auto-start via event
      this.deps.uiEventHandlers.registerPlayerUIHandler(player);
    });
  }

  /**
   * Register player left world event handler
   * Handles cleanup when player disconnects
   */
  private registerPlayerLeftHandler(): void {
    this.deps.world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
      logger.info(`Player ${player.username} left world - checking if game reset needed`);

      if (this.deps.game) {
        const playerTeam = this.deps.game.getTeamOfPlayer(player.username);
        this.deps.game.removePlayer(player.username);

        // Despawn player's entity
        this.deps.world.entityManager
          .getPlayerEntitiesByPlayer(player)
          .forEach((entity) => entity.despawn());

        // Add a small delay to avoid false positives during goal handling or ball resets
        setTimeout(() => {
          // If game is in progress and was single player, reset AI
          // Only check after delay to ensure this isn't during a game event
          const humanPlayerCount = this.deps.world.entityManager
            .getAllPlayerEntities()
            .filter(
              (e) => e instanceof SoccerPlayerEntity && !(e instanceof AIPlayerEntity)
            ).length;

          // Double-check that the player is actually disconnected (not just entity repositioning)
          const playerStillConnected = this.deps.world.entityManager
            .getAllPlayerEntities()
            .some(
              (entity) =>
                entity instanceof SoccerPlayerEntity &&
                !(entity instanceof AIPlayerEntity) &&
                entity.player.username === player.username
            );

          if (
            this.deps.game &&
            this.deps.game.inProgress() &&
            this.deps.aiPlayers.length > 0 &&
            humanPlayerCount === 0 &&
            !playerStillConnected
          ) {
            logger.info("Confirmed: Last human player left single player game. Resetting AI.");

            // Cleanup AI players
            this.deps.aiPlayers.forEach((ai) => {
              if (ai.isSpawned) {
                ai.deactivate();
                this.deps.sharedState.removeAIFromTeam(ai, ai.team);
                ai.despawn();
              }
            });
            this.deps.aiPlayers.length = 0; // Clear array

            // Reset game
            this.deps.game.resetGame();

            // Reset music back to opening music
            this.deps.audioManager.playOpeningMusic();

            // Stop FIFA crowd atmosphere
            this.deps.fifaCrowdManager.stop();
          } else if (
            this.deps.game &&
            this.deps.game.inProgress() &&
            playerTeam &&
            this.deps.game.getPlayerCountOnTeam(playerTeam) === 0 &&
            !playerStillConnected
          ) {
            // Check if a team is now empty in multiplayer
            logger.warn(`Team ${playerTeam} is now empty. Ending game.`);
            this.deps.game.resetGame(); // Or implement forfeit logic

            // Reset music back to opening music
            this.deps.audioManager.playOpeningMusic();

            // Stop FIFA crowd atmosphere
            this.deps.fifaCrowdManager.stop();
          } else {
            logger.debug(
              `Player left but game continues - Human players: ${humanPlayerCount}, Player still connected: ${playerStillConnected}`
            );
          }
        }, 500); // 500ms delay to let any repositioning settle
      }
    });
  }
}
