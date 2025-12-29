/**
 * TeamSelectionHandler
 *
 * Handles team selection and player joining UI events:
 * - Team selection (red/blue)
 * - Single player mode start
 * - Multiplayer mode start
 * - Mobile team selection
 * - Multiplayer lobby join
 * - Coin toss choice
 * - Manual game reset
 * - Start second half
 */

import { World, Player, PlayerManager, EntityEvent } from "hytopia";
import { SoccerGame } from "../../../state/gameState";
import AIPlayerEntity from "../../../entities/AIPlayerEntity";
import SoccerPlayerEntity from "../../../entities/SoccerPlayerEntity";
import { AudioManager } from "../../core/AudioManager";
import { logger } from "../../../utils/GameLogger";
import sharedState from "../../../state/sharedState";
import spectatorMode from "../../../utils/observerMode";
import { FIFACrowdManager } from "../../../utils/fifaCrowdManager";
import { PickupGameManager } from "../../../state/pickupGameManager";
import { getCurrentModeConfig, getCurrentGameMode, isFIFAMode, isArcadeMode } from "../../../state/gameModes";
import { getStartPosition } from "../../../utils/positions";

export interface TeamSelectionHandlerDependencies {
  world: World;
  game: SoccerGame | null;
  aiPlayers: AIPlayerEntity[];
  audioManager: AudioManager;
  sharedState: typeof sharedState;
  spectatorMode: typeof spectatorMode;
  fifaCrowdManager: FIFACrowdManager;
  pickupManager: PickupGameManager;
  spawnAIPlayers: (team?: string) => Promise<void>;
}

export class TeamSelectionHandler {
  private deps: TeamSelectionHandlerDependencies;

  constructor(deps: TeamSelectionHandlerDependencies) {
    this.deps = deps;
  }

  /**
   * Handle team selection (red/blue)
   */
  async handleTeamSelection(player: Player, data: any): Promise<void> {
    logger.info(`Player ${player.username} selected team: ${data.team}`);

    // Check if player already on a team
    if (this.deps.game && this.deps.game.getTeamOfPlayer(player.username) !== null) {
      logger.info("Player already on a team");
      return;
    }

    // Check if team is full
    if (this.deps.game && this.deps.game.isTeamFull(data.team)) {
      // Offer spectator mode when team is full
      this.deps.spectatorMode.joinAsSpectator(player, this.deps.world);
      player.ui.sendData({
        type: "spectator-mode-active",
        message:
          "Team is full - you've joined as a spectator! Use /leavespectator to exit spectator mode.",
      });
      return;
    }

    // Check if player already has an entity (shouldn't happen after fix)
    const existingEntities = this.deps.world.entityManager.getPlayerEntitiesByPlayer(player);
    if (existingEntities.length > 0) {
      logger.warn(
        `Player ${player.username} already has ${existingEntities.length} entities! Cleaning up...`
      );
      existingEntities.forEach((entity) => {
        if (entity.isSpawned) {
          logger.info(`Despawning existing entity: ${entity.id}`);
          entity.despawn();
        }
      });
    }

    // CRITICAL: Load the game HUD UI (replaces the menu)
    // This must happen before spawning so the HUD is ready
    player.ui.load("ui/game-hud.html");
    logger.info(`Loaded game-hud.html for ${player.username}`);

    // Store mobile flag from data if provided
    if (data.isMobile !== undefined) {
      (player as any)._isMobilePlayer = data.isMobile;
      logger.info(`Player ${player.username} mobile status: ${data.isMobile}`);
    }

    // Join game and team
    if (this.deps.game) {
      this.deps.game.joinGame(player.username, player.username);
      this.deps.game.joinTeam(player.username, data.team);
    }

    // Create player entity with the assigned role
    const humanPlayerRole = "central-midfielder-1"; // Human player is now a midfielder
    const playerEntity = new SoccerPlayerEntity(player, data.team, humanPlayerRole);
    logger.info(`Creating player entity for team ${data.team} as ${humanPlayerRole}`);

    // Add spawn event listener to verify when entity is actually spawned
    playerEntity.on(EntityEvent.SPAWN, () => {
      logger.info(`Player entity ${playerEntity.id} successfully spawned with camera attachment`);
    });

    // Get correct spawn position for large stadium
    const spawnPosition = getStartPosition(data.team, humanPlayerRole);
    logger.info(
      `Using role-based spawn position for large stadium: X=${spawnPosition.x.toFixed(2)}, Y=${spawnPosition.y.toFixed(2)}, Z=${spawnPosition.z.toFixed(2)}`
    );

    // Spawn player entity immediately at calculated position
    logger.info(
      `Spawning player entity at X=${spawnPosition.x.toFixed(2)}, Y=${spawnPosition.y.toFixed(2)}, Z=${spawnPosition.z.toFixed(2)}`
    );
    playerEntity.spawn(this.deps.world, spawnPosition);
    logger.info(`Player entity ${playerEntity.id} spawn command issued as ${humanPlayerRole}.`);

    // Show mobile controls after spawn if player is on mobile
    if ((player as any)._isMobilePlayer) {
      logger.info(`Showing mobile controls for ${player.username} after spawn`);
      player.ui.sendData({
        type: "show-mobile-controls",
        message: "Player spawned - showing mobile controls",
      });
    }

    // Freeze the human player initially
    playerEntity.freeze();

    // Music transition: Stop opening music and start gameplay music
    // This happens when player spawns into game (after team selection)
    // Opening music plays during: opening screen, game mode selection, team selection
    // Gameplay music plays during: actual game (FIFA/Arcade)
    if (this.deps.game) {
      const currentMode = getCurrentGameMode();
      this.deps.audioManager.playGameplayMusic(currentMode);
      logger.info(`🎵 Music transitioned to gameplay (${currentMode} mode)`);
    }

    // Start FIFA crowd atmosphere if in FIFA mode
    if (isFIFAMode()) {
      this.deps.fifaCrowdManager.start();
      this.deps.fifaCrowdManager.playGameStart();
    }

    // Determine game mode from data or player preference
    const playerCount = data.playerCount || (player as any)._playerCountPreference || "single";
    const isSinglePlayer = playerCount === "single" || data.singlePlayerMode;
    const isMultiplayer = playerCount === "multiplayer" || data.multiplayerMode;

    // Handle single player mode
    if (isSinglePlayer) {
      await this.handleSinglePlayerModeStart(player, data.team, playerEntity);
    }
    // Handle multiplayer mode
    else if (isMultiplayer) {
      await this.handleMultiplayerModeStart(player, data.team, playerEntity);
    }
    // Default to single player if no preference set
    else {
      logger.info("No player count specified, defaulting to single player");
      await this.handleSinglePlayerModeStart(player, data.team, playerEntity);
    }
  }

  /**
   * Handle single player mode start
   */
  private async handleSinglePlayerModeStart(
    player: Player,
    team: string,
    playerEntity: SoccerPlayerEntity
  ): Promise<void> {
    logger.info(`Starting single player mode for team ${team}`);

    try {
      // Spawn AI players
      logger.info("Spawning AI players...");
      await this.deps.spawnAIPlayers(team);

      // Start the game
      logger.info("Starting game with AI...");
      const gameStarted = this.deps.game && this.deps.game.startGame();
      if (gameStarted) {
        logger.info("Game started successfully with AI!");

        // Activate pickup system if in arcade mode
        if (isArcadeMode()) {
          logger.info(`Activating pickup system for Arcade Mode`);
          this.deps.pickupManager.activate();
        }

        // Send initial game state to HUD
        player.ui.sendData({
          type: "score-update",
          red: 0,
          blue: 0,
        });

        player.ui.sendData({
          type: "timer-update",
          time: "5:00",
          half: 1,
        });

        player.ui.sendData({
          type: "game-message",
          message: "Game Started! ⚽",
          duration: 3000,
        });

        // Unfreeze player after short delay
        setTimeout(() => {
          if (playerEntity && typeof playerEntity.unfreeze === "function") {
            playerEntity.unfreeze();
            logger.info("Player unfrozen - game active!");
          }

          // CRITICAL: Lock pointer for gameplay (Hytopia-compliant approach)
          player.ui.lockPointer(true);
          logger.info(`Pointer locked for ${player.username} - Game controls enabled`);

          // Notify HUD that game has started
          player.ui.sendData({
            type: "game-started",
          });
        }, 500);
      } else {
        logger.error("Failed to start game with AI");
        player.ui.sendData({
          type: "game-message",
          message: "Failed to start game. Please refresh.",
          duration: 5000,
        });
      }
    } catch (error) {
      logger.error("Error during AI spawning:", error);
      player.ui.sendData({
        type: "game-message",
        message: "Failed to spawn AI. Please refresh.",
        duration: 5000,
      });
    }
  }

  /**
   * Handle multiplayer mode start
   */
  private async handleMultiplayerModeStart(
    player: Player,
    team: string,
    playerEntity: SoccerPlayerEntity
  ): Promise<void> {
    logger.info(`Multiplayer mode: Player ${player.username} joined team ${team}`);

    // Check how many human players are currently in the game
    const humanPlayers = PlayerManager.instance.getConnectedPlayers();
    logger.info(`Current human players in game: ${humanPlayers.length}`);

    if (humanPlayers.length === 1) {
      // First player - wait for second player
      logger.info("First player in multiplayer lobby - waiting for second player");
      player.ui.sendData({
        type: "multiplayer-waiting",
        message: "Waiting for second player to join...",
        playerCount: 1,
        requiredPlayers: 2,
      });
    } else if (humanPlayers.length === 2) {
      // Second player joined - start multiplayer game
      logger.info("Second player joined - starting multiplayer 1v1 match");

      // Assign players to different teams automatically
      const firstPlayer = humanPlayers.find((p) => p.username !== player.username);
      const secondPlayer = player;

      // Assign teams: first player gets opposite team of what second player chose
      const firstPlayerTeam = team === "red" ? "blue" : "red";
      const secondPlayerTeam = team;

      logger.info(
        `Team assignment: ${firstPlayer?.username} -> ${firstPlayerTeam}, ${secondPlayer.username} -> ${secondPlayerTeam}`
      );

      // Notify both players about team assignments
      firstPlayer?.ui.sendData({
        type: "team-assigned",
        team: firstPlayerTeam,
        message: `You have been assigned to the ${firstPlayerTeam} team`,
      });

      secondPlayer.ui.sendData({
        type: "team-assigned",
        team: secondPlayerTeam,
        message: `You have been assigned to the ${secondPlayerTeam} team`,
      });

      // Start loading for multiplayer game
      [firstPlayer, secondPlayer].forEach((p) => {
        if (p) {
          p.ui.sendData({
            type: "loading-progress",
            current: 50,
            total: 100,
            message: "Setting up multiplayer match...",
            percentage: 50,
          });
        }
      });

      // Spawn AI players for both teams (4 AI per team since 1 human per team)
      logger.info("Spawning AI players for multiplayer 1v1 match");
      await this.deps.spawnAIPlayers("red"); // This will spawn for both teams

      // Update loading progress
      [firstPlayer, secondPlayer].forEach((p) => {
        if (p) {
          p.ui.sendData({
            type: "loading-progress",
            current: 90,
            total: 100,
            message: "Starting multiplayer match...",
            percentage: 90,
          });
        }
      });

      // Start the multiplayer game
      const gameStarted = this.deps.game && this.deps.game.startGame();
      if (gameStarted) {
        logger.info("Multiplayer 1v1 game started successfully!");

        // Notify both players
        [firstPlayer, secondPlayer].forEach((p) => {
          if (p) {
            p.ui.sendData({
              type: "loading-progress",
              current: 100,
              total: 100,
              message: "Match ready!",
              percentage: 100,
            });

            // Clear loading UI after delay
            setTimeout(() => {
              p.ui.sendData({
                type: "loading-complete",
              });
            }, 500);
          }
        });

        // Unfreeze both players
        setTimeout(() => {
          const allPlayerEntities = this.deps.world.entityManager.getAllPlayerEntities();
          allPlayerEntities.forEach((entity) => {
            if (entity instanceof SoccerPlayerEntity && typeof entity.unfreeze === "function") {
              entity.unfreeze();
              logger.info(`Player ${entity.player.username} unfrozen - multiplayer game active!`);
            }
          });
        }, 1000);
      } else {
        logger.error("Failed to start multiplayer game");
        [firstPlayer, secondPlayer].forEach((p) => {
          if (p) {
            p.ui.sendData({
              type: "loading-error",
              message: "Failed to start multiplayer game. Please try again.",
            });
          }
        });
      }
    }
  }

  /**
   * Handle multiplayer lobby join
   */
  handleJoinMultiplayerLobby(player: Player, data: any): void {
    logger.info(`Player ${player.username} wants to join multiplayer lobby`);
    // For now, we'll handle this in the team-selected handler
    // In a more complex implementation, this could manage a separate lobby system
    player.ui.sendData({
      type: "multiplayer-lobby-joined",
      message: "Joined multiplayer lobby. Select your preferred team to continue.",
    });
  }

  /**
   * Handle mobile team selection
   */
  async handleMobileTeamSelection(player: Player, data: any): Promise<void> {
    const selectedTeam = data.team;
    logger.info(`Mobile team selection: ${player.username} chose ${selectedTeam}`);

    // Send immediate mobile confirmation
    player.ui.sendData({
      type: "mobile-team-selection-confirmed",
      team: selectedTeam,
      message: `Joining ${selectedTeam} team...`,
    });

    // Use the FULL team selection logic to actually spawn the player
    // This ensures mobile players get properly spawned into the game
    await this.handleTeamSelection(player, data);

    logger.info(`Mobile team selection complete for ${player.username} on ${selectedTeam} team`);
  }

  /**
   * Handle coin toss choice
   */
  handleCoinTossChoice(player: Player, data: any): void {
    logger.info(`Player ${player.username} chose ${data.choice} for coin toss`);

    // Process coin toss only if game is in starting state
    if (this.deps.game && this.deps.game.getState().status === "starting") {
      this.deps.game.performCoinToss({
        playerId: player.username,
        choice: data.choice,
      });
    }
  }

  /**
   * Handle manual game reset
   */
  handleManualResetGame(player: Player, data: any): void {
    logger.info(
      `Player ${player.username} requested manual game reset from game over screen`
    );

    // Only allow reset if game is finished
    if (this.deps.game && this.deps.game.getState().status === "finished") {
      logger.info("Game is finished, proceeding with manual reset");

      // Reset music back to opening music
      this.deps.audioManager.playOpeningMusic();

      // Stop FIFA crowd atmosphere
      if (this.deps.fifaCrowdManager && this.deps.fifaCrowdManager.stop) {
        this.deps.fifaCrowdManager.stop();
      }

      // Perform the actual game reset
      this.deps.game.manualResetGame();

      // CRITICAL: Unlock pointer for UI interactions after manual reset (Hytopia-compliant approach)
      player.ui.lockPointer(false);
      logger.info(
        `Pointer unlocked for ${player.username} after manual reset - UI interactions enabled`
      );

      // Clear AI players list
      this.deps.aiPlayers.forEach((ai) => {
        if (ai.isSpawned) {
          ai.deactivate();
          this.deps.sharedState.removeAIFromTeam(ai, ai.team);
          ai.despawn();
        }
      });
      this.deps.aiPlayers.length = 0; // Clear array
      this.deps.game.updateAIPlayersList([]);

      logger.info("Manual game reset complete - players can now select teams");
    } else {
      logger.info(
        `Manual reset denied - game status is: ${this.deps.game ? this.deps.game.getState().status : "null"}`
      );
      player.ui.sendData({
        type: "error",
        message: "Game reset only available when game is finished",
      });
    }
  }

  /**
   * Handle start second half
   */
  handleStartSecondHalf(player: Player, data: any): void {
    logger.info(`Player ${player.username} requested to start second half`);

    // Only allow if game is in halftime
    if (this.deps.game && this.deps.game.getState().isHalftime) {
      logger.info("Game is in halftime, starting second half");

      // Call the game's startSecondHalf method
      this.deps.game.startSecondHalf();

      logger.info("Second half started successfully");
    } else {
      logger.info(
        `Start second half denied - game status is: ${this.deps.game ? this.deps.game.getState().status : "null"}, halftime: ${this.deps.game ? this.deps.game.getState().isHalftime : "null"}`
      );
      player.ui.sendData({
        type: "error",
        message: "Second half can only be started during halftime",
      });
    }
  }
}
