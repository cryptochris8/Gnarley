/**
 * GameModeUIHandler
 *
 * Handles game mode selection UI events:
 * - FIFA mode selection
 * - Arcade mode selection
 * - Tournament mode selection
 * - Penalty shootout mode
 * - Single player selection
 * - Mobile auto-start
 */

import { Player } from "hytopia";
import { AudioManager } from "../../core/AudioManager";
import { GameMode, setGameMode, getCurrentModeConfig, isGameModeLocked, getCurrentGameMode } from "../../../state/gameModes";
import { logger } from "../../../utils/GameLogger";
import { setMobilePlayer } from "../../../utils/mobileDetection";
import { SoccerGame } from "../../../state/gameState";

export interface GameModeHandlerDependencies {
  audioManager: AudioManager;
  game: SoccerGame | null;
}

export class GameModeUIHandler {
  private deps: GameModeHandlerDependencies;

  constructor(deps: GameModeHandlerDependencies) {
    this.deps = deps;
  }

  /**
   * Handle game mode selection (FIFA, Arcade, etc.)
   */
  handleGameModeSelection(player: Player, data: any): void {
    logger.info(`Player ${player.username} selected game mode: ${data.mode}`);

    // CRITICAL FIX: Check if game mode is locked (match in progress)
    if (isGameModeLocked()) {
      const currentMode = getCurrentGameMode();
      logger.warn(`⚠️ Player ${player.username} tried to select ${data.mode} but mode is locked to ${currentMode}`);

      // Inform the player that a match is in progress
      player.ui.sendData({
        type: "game-mode-locked",
        currentMode: currentMode,
        requestedMode: data.mode,
        message: `A match is currently in progress in ${currentMode.toUpperCase()} mode. You will join the current game.`,
      });

      // Confirm with the CURRENT mode
      player.ui.sendData({
        type: "game-mode-confirmed",
        mode: currentMode,
        config: getCurrentModeConfig(),
        wasLocked: true,
      });

      return;
    }

    // Start opening music on first user interaction (game mode selection)
    // This is after a user gesture, so browser will allow audio playback
    if (!this.deps.game?.inProgress()) {
      this.deps.audioManager.playOpeningMusic();
      logger.info("🎵 Opening music started after user interaction");
    }

    // Set the game mode using the imported functions
    let modeSet = false;
    if (data.mode === "fifa") {
      modeSet = setGameMode(GameMode.FIFA);
      if (modeSet) logger.info("🎮 Game mode set to FIFA Mode");
    } else if (data.mode === "arcade") {
      modeSet = setGameMode(GameMode.ARCADE);
      if (modeSet) logger.info("🎮 Game mode set to Arcade Mode");
    }

    // Send confirmation back to UI with actual current mode
    player.ui.sendData({
      type: "game-mode-confirmed",
      mode: getCurrentGameMode(),
      config: getCurrentModeConfig(),
    });

    logger.info("🎮 Game mode selected - ready for team selection");
  }

  /**
   * Handle single player mode selection
   */
  handleSinglePlayerSelection(player: Player, data: any): void {
    logger.info(`Player ${player.username} selected single player mode`);

    // Send confirmation - game is ready
    player.ui.sendData({
      type: "single-player-ready",
      message: "Single player mode ready! Select your team to begin.",
    });
  }

  /**
   * Handle mobile auto-start FIFA mode
   * This is a convenience method for mobile players to skip mode selection
   */
  handleMobileAutoStartFIFA(player: Player, data: any): void {
    logger.info(`📱 Mobile auto-start requested by: ${player.username}`);

    // Mark player as mobile
    setMobilePlayer(player, true);

    // CRITICAL FIX: Check if a game is already in progress
    if (isGameModeLocked() || this.deps.game?.inProgress()) {
      const currentMode = getCurrentGameMode();
      logger.info(`📱 Game in progress with ${currentMode} - mobile player will join existing match`);

      // Notify player they're joining an existing game
      player.ui.sendData({
        type: "game-mode-locked",
        currentMode: currentMode,
        requestedMode: "fifa",
        message: `Joining match in progress (${currentMode.toUpperCase()} mode)`,
      });

      // Send confirmation with actual current mode
      player.ui.sendData({
        type: "mobile-auto-start-confirmed",
        mode: currentMode,
        wasLocked: true,
      });

      return;
    }

    // No game in progress - set to FIFA mode
    const modeSet = setGameMode(GameMode.FIFA);
    if (modeSet) {
      logger.info("🎮 Game mode set to FIFA Mode (mobile auto-start)");
    }

    // Send confirmation to trigger team selection
    player.ui.sendData({
      type: "mobile-auto-start-confirmed",
      mode: getCurrentGameMode(),
    });
  }
}
