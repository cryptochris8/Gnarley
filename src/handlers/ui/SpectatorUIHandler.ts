/**
 * SpectatorUIHandler
 *
 * Handles spectator mode UI events:
 * - Switch to next player
 * - Switch camera mode
 * - Leave spectator mode
 */

import { Player } from "hytopia";
import { logger } from "../../../utils/GameLogger";
import spectatorMode from "../../../utils/observerMode";

export interface SpectatorHandlerDependencies {
  spectatorMode: typeof spectatorMode;
}

export class SpectatorUIHandler {
  private deps: SpectatorHandlerDependencies;

  constructor(deps: SpectatorHandlerDependencies) {
    this.deps = deps;
  }

  /**
   * Handle spectator next player
   * Switch to spectating the next player in the game
   */
  handleSpectatorNextPlayer(player: Player, data: any): void {
    logger.info(`Spectator ${player.username} wants to switch to next player`);
    this.deps.spectatorMode.nextPlayer(player);
  }

  /**
   * Handle spectator next camera
   * Switch to the next camera mode (e.g., first-person, third-person, overhead)
   */
  handleSpectatorNextCamera(player: Player, data: any): void {
    logger.info(`Spectator ${player.username} wants to switch camera mode`);
    this.deps.spectatorMode.nextCameraMode(player);
  }

  /**
   * Handle spectator leave
   * Exit spectator mode and return to normal gameplay/menu
   */
  handleSpectatorLeave(player: Player, data: any): void {
    logger.info(`Spectator ${player.username} wants to leave spectator mode`);
    this.deps.spectatorMode.removeSpectator(player);
  }
}
