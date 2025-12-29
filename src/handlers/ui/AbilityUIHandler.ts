/**
 * AbilityUIHandler
 *
 * Handles ability activation and special action UI events:
 * - Force pass (manual pass trigger)
 * - Request pass (ask AI teammate to pass)
 * - Arcade mode abilities (future)
 * - Special moves and powerups
 */

import { Player, World } from "hytopia";
import SoccerPlayerEntity from "../../../entities/SoccerPlayerEntity";
import AIPlayerEntity from "../../../entities/AIPlayerEntity";
import { logger } from "../../../utils/GameLogger";
import sharedState from "../../../state/sharedState";
import { getDirectionFromRotation } from "../../../utils/direction";

export interface AbilityHandlerDependencies {
  world: World;
  sharedState: typeof sharedState;
}

export class AbilityUIHandler {
  private deps: AbilityHandlerDependencies;

  constructor(deps: AbilityHandlerDependencies) {
    this.deps = deps;
  }

  /**
   * Handle force pass
   * Manually trigger a pass action for the player
   */
  handleForcePass(player: Player, data: any): void {
    logger.info(`SERVER: Received force-pass request from ${player.username}`);

    // Find the player's entity
    const playerEntity = this.deps.world.entityManager
      .getAllPlayerEntities()
      .find((entity) => entity.player.username === player.username);

    if (playerEntity && playerEntity instanceof SoccerPlayerEntity) {
      // Check if player has the ball
      const attachedPlayer = this.deps.sharedState.getAttachedPlayer();
      const hasBall = attachedPlayer?.player?.username === player.username;

      if (hasBall) {
        // Simulate a left mouse click to trigger the pass
        const fakeInput = {
          w: false,
          a: false,
          s: false,
          d: false,
          sp: false,
          ml: true, // Left mouse click for pass
          mr: false,
          q: false,
          sh: false,
          e: false,
          f: false,
          "1": false,
        };

        // Call the controller's input handler directly with default camera orientation
        if (playerEntity.controller && playerEntity.controller.tickWithPlayerInput) {
          playerEntity.controller.tickWithPlayerInput(
            playerEntity,
            fakeInput,
            { yaw: 0, pitch: 0 }, // Default camera orientation for pass
            16 // 16ms delta time (roughly 60fps)
          );

          logger.info(`SERVER: Force pass executed for ${player.username}`);

          // Send feedback to UI
          player.ui.sendData({
            type: "action-feedback",
            feedbackType: "success",
            title: "Pass",
            message: "Pass executed!",
          });
        }
      } else {
        logger.info(`SERVER: ${player.username} doesn't have the ball`);
        player.ui.sendData({
          type: "action-feedback",
          feedbackType: "warning",
          title: "Pass Failed",
          message: "You don't have the ball!",
        });
      }
    }
  }

  /**
   * Handle request pass
   * Request an AI teammate to pass the ball to the human player
   */
  handleRequestPass(player: Player, data: any): void {
    const requestingPlayerEntity = this.deps.world.entityManager.getPlayerEntitiesByPlayer(
      player
    )[0];
    if (!requestingPlayerEntity || !(requestingPlayerEntity instanceof SoccerPlayerEntity)) return;

    const playerWithBall = this.deps.sharedState.getAttachedPlayer();
    if (
      playerWithBall &&
      playerWithBall instanceof AIPlayerEntity &&
      playerWithBall.team === requestingPlayerEntity.team
    ) {
      logger.info(
        `HUMAN PLAYER REQUESTING PASS: AI ${playerWithBall.player.username} passing to ${requestingPlayerEntity.player.username}`
      );

      // Calculate distance between AI and requesting player for power scaling
      const distanceToPlayer = Math.sqrt(
        Math.pow(playerWithBall.position.x - requestingPlayerEntity.position.x, 2) +
        Math.pow(playerWithBall.position.z - requestingPlayerEntity.position.z, 2)
      );

      // Calculate a target point slightly in front of the requesting player
      const leadDistance = 2.5; // Lead distance for better reception
      // Use the direction the player is facing for better ball placement
      const targetDirection = getDirectionFromRotation(requestingPlayerEntity.rotation);

      const passTargetPoint = {
        x: requestingPlayerEntity.position.x + targetDirection.x * leadDistance,
        y: requestingPlayerEntity.position.y, // Keep y the same for a ground pass
        z: requestingPlayerEntity.position.z + targetDirection.z * leadDistance,
      };

      // Scale power based on distance - closer passes use less power for better control
      let passPower = 0.7; // Base power for close passes
      if (distanceToPlayer > 20) {
        passPower = 0.95; // Long passes need more power
      } else if (distanceToPlayer > 10) {
        passPower = 0.8; // Medium passes
      }

      // GUARANTEED PASS: Use forcePass which bypasses all AI decision making
      const passSuccess = playerWithBall.forcePass(
        requestingPlayerEntity,
        passTargetPoint,
        passPower
      );

      if (passSuccess) {
        logger.info(
          `GUARANTEED PASS: Successfully passed ball to human player ${requestingPlayerEntity.player.username}`
        );

        player.ui.sendData({
          type: "action-feedback",
          feedbackType: "success",
          title: "Pass Incoming!",
          message: `${playerWithBall.player.username} is passing`,
        });
      } else {
        logger.warn(
          `PASS FAILED: Could not pass to human player ${requestingPlayerEntity.player.username}`
        );

        player.ui.sendData({
          type: "action-feedback",
          feedbackType: "error",
          title: "Pass Failed",
          message: "Teammate couldn't pass",
        });
      }
    } else {
      logger.info(
        `PASS REQUEST DENIED: No AI teammate has the ball or wrong team`
      );

      player.ui.sendData({
        type: "action-feedback",
        feedbackType: "warning",
        title: "No Pass Available",
        message: "No AI teammate has the ball",
      });
    }
  }
}
