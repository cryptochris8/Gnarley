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

import { World, PlayerEvent, Player, PersistenceManager } from "hytopia";
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
import { RoomManager } from "../../state/RoomManager";
import { PhysicalLobby } from "../../lobby/PhysicalLobby";

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
  physicalLobby: PhysicalLobby;
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

      // Check if this is the lobby world or a game room
      const isLobby = RoomManager.isInitialized() && RoomManager.isLobbyWorld(this.deps.world);

      if (isLobby) {
        // Physical lobby handles: entity spawn, ball, UI, pointer lock, room count, welcome message
        this.deps.physicalLobby.onPlayerJoin(player);
        // Still register UI handler so room events (quick-play, create-room, etc.) work
        this.deps.uiEventHandlers.registerPlayerUIHandler(player);
        logger.info(`Player ${player.username} entered physical lobby`);
        return;
      }

      // Game room flow - welcome message only for direct game room joins
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Welcome to Hytopia Soccer! Use /spectate to watch games when teams are full."
      );
      player.ui.load("ui/index.html");
      logger.info(`⚽ Loaded game UI for ${player.username}`);

      // Load persistent career stats for the player
      try {
        const persistedData = player.getPersistedData() as Record<string, any> | undefined;
        const careerStats = persistedData?.careerStats || {
          totalGoals: 0,
          totalAssists: 0,
          totalWins: 0,
          totalLosses: 0,
          totalMatches: 0,
          totalMVPs: 0,
          penaltyGoals: 0,
          penaltySaves: 0,
        };

        // Send career stats to UI
        player.ui.sendData({
          type: "career-stats-loaded",
          stats: careerStats,
          username: player.username,
        });

        logger.info(`📊 Loaded career stats for ${player.username}: ${careerStats.totalGoals} goals, ${careerStats.totalWins} wins`);
      } catch (e) {
        logger.warn(`Failed to load career stats for ${player.username}: ${e}`);
      }

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

      // If this is the lobby world, clean up lobby state and return early
      const isLobby = RoomManager.isInitialized() && RoomManager.isLobbyWorld(this.deps.world);
      if (isLobby) {
        this.deps.physicalLobby.onPlayerLeave(player);
        logger.info(`🏠 Player ${player.username} left physical lobby`);
        return;
      }

      // Save career stats before cleanup
      if (this.deps.game) {
        try {
          const matchStats = this.deps.game.getPlayerStats?.(player.username);
          if (matchStats) {
            const persistedData = player.getPersistedData() as Record<string, any> | undefined;
            const careerStats = persistedData?.careerStats || {
              totalGoals: 0, totalAssists: 0, totalWins: 0, totalLosses: 0,
              totalMatches: 0, totalMVPs: 0, penaltyGoals: 0, penaltySaves: 0,
            };

            careerStats.totalGoals += matchStats.goals || 0;
            careerStats.totalAssists += matchStats.assists || 0;
            careerStats.totalMatches += 1;

            player.setPersistedData({ careerStats });
            logger.info(`📊 Saved career stats for ${player.username}: ${careerStats.totalGoals} total goals`);
          }
        } catch (e) {
          logger.warn(`Failed to save career stats for ${player.username}: ${e}`);
        }
      }

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
