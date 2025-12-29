/**
 * MobileControlsHandler
 *
 * Handles mobile input UI events:
 * - Mobile mode enabled tracking
 * - Mobile movement input (virtual joystick)
 * - Mobile action input (pass, shoot, tackle, dodge)
 * - Mobile camera input (rotation)
 * - Mobile swipe gestures
 * - Mobile zoom gestures
 *
 * NOTE: Many mobile handlers are disabled as Hytopia SDK handles
 * movement/camera automatically. We only keep mobile-mode-enabled
 * for tracking mobile players.
 */

import { Player } from "hytopia";
import SoccerPlayerEntity from "../../../entities/SoccerPlayerEntity";
import { World } from "hytopia";
import { logger } from "../../../utils/GameLogger";
import { SoccerGame } from "../../../state/gameState";

export interface MobileControlsHandlerDependencies {
  world: World;
  game: SoccerGame | null;
}

export class MobileControlsHandler {
  private deps: MobileControlsHandlerDependencies;

  constructor(deps: MobileControlsHandlerDependencies) {
    this.deps = deps;
  }

  /**
   * Handle mobile mode enabled
   * Tracks that a player is on a mobile device
   */
  handleMobileModeEnabled(player: Player, data: any): void {
    logger.info(`Player ${player.username} enabled mobile mode`);
    logger.info(`Device info:`, data.deviceInfo);

    // Store mobile mode preference for this player
    (player as any)._isMobilePlayer = true;

    // Send game state if active (no special mobile processing - SDK handles it)
    if (this.deps.game && this.deps.game.inProgress()) {
      player.ui.sendData({
        type: "game-state-update",
        gameState: this.deps.game.getState(),
      });
    }

    // No need to notify other players - Hytopia SDK handles mobile detection automatically

    logger.info(`Mobile mode enabled for ${player.username}`);
  }

  /**
   * Handle mobile movement input (DISABLED - Hytopia SDK handles this)
   * This is kept for reference but is not actively used
   */
  handleMobileMovementInput(player: Player, data: any): void {
    // NOTE: This handler is disabled as Hytopia SDK handles movement automatically
    // Keeping it for reference in case we need custom mobile movement in the future
    logger.debug(`Mobile movement input received from ${player.username} (SDK handles this)`);
  }

  /**
   * Handle mobile action input (DISABLED - Hytopia SDK handles this)
   * This is kept for reference but is not actively used
   */
  handleMobileActionInput(player: Player, data: any): void {
    // NOTE: This handler is disabled as Hytopia SDK handles actions automatically
    // Keeping it for reference in case we need custom mobile actions in the future
    logger.debug(`Mobile action input received from ${player.username} (SDK handles this)`);
  }

  /**
   * Handle mobile camera input (DISABLED - Hytopia SDK handles this)
   * This is kept for reference but is not actively used
   */
  handleMobileCameraInput(player: Player, data: any): void {
    // NOTE: This handler is disabled as Hytopia SDK handles camera automatically
    // Keeping it for reference in case we need custom mobile camera in the future
    logger.debug(`Mobile camera input received from ${player.username} (SDK handles this)`);
  }

  /**
   * Handle mobile swipe gesture (DISABLED - Hytopia SDK handles this)
   * This is kept for reference but is not actively used
   */
  handleMobileSwipeGesture(player: Player, data: any): void {
    // NOTE: This handler is disabled as Hytopia SDK handles gestures automatically
    // Keeping it for reference in case we need custom swipe gestures in the future
    logger.debug(`Mobile swipe gesture received from ${player.username} (SDK handles this)`);
  }

  /**
   * Handle mobile zoom gesture (DISABLED - Hytopia SDK handles this)
   * This is kept for reference but is not actively used
   */
  handleMobileZoomGesture(player: Player, data: any): void {
    // NOTE: This handler is disabled as Hytopia SDK handles zoom automatically
    // Keeping it for reference in case we need custom zoom in the future
    logger.debug(`Mobile zoom gesture received from ${player.username} (SDK handles this)`);
  }
}
