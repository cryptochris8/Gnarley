/**
 * Hytopia Soccer Game - Main Entry Point
 *
 * This file has been refactored to use a modular architecture:
 * - All server initialization is handled by ServerInitializer
 * - Event handlers are organized by category (Player, UI, Chat, Game)
 * - Utility systems are in separate modules (Audio, Logger, Resource management)
 *
 * File reduced from 34,720 tokens to ~50 lines for Hytopia SDK compliance.
 * See REFACTORING_PLAN.md for full details of the modularization.
 */

import { startServer } from "hytopia";
import { ServerInitializer } from "./src/core/ServerInitializer";
import { logger } from "./utils/GameLogger";

// Start the Hytopia server
startServer((world) => {
  logger.info("🎮 Hytopia Soccer Server Starting...");
  logger.info("=".repeat(60));

  // Initialize all server systems using the centralized initializer
  const initializer = new ServerInitializer(world);
  const systems = initializer.initialize();

  // All systems are now initialized and event handlers are registered automatically:
  // ✅ Game systems (SoccerGame, AudioManager, SharedState)
  // ✅ Feature managers (Arcade, Pickup, Tournament, FIFA Crowd, Spectator)
  // ✅ Performance systems (Profiler, Optimizer)
  // ✅ Event handlers (Player, UI, Chat, Game)

  logger.info("=".repeat(60));
  logger.info("🎮 Hytopia Soccer Server Ready!");
  logger.info("📊 Systems initialized:");
  logger.info(`   - Game: ${systems.game ? "✓" : "✗"}`);
  logger.info(`   - Audio: ${systems.audioManager ? "✓" : "✗"}`);
  logger.info(`   - Event Handlers: ${systems.playerEventHandlers && systems.uiEventHandlers && systems.chatCommandHandlers && systems.gameEventHandlers ? "✓" : "✗"}`);
  logger.info(`   - Feature Managers: ${systems.tournamentManager && systems.arcadeManager && systems.pickupManager ? "✓" : "✗"}`);
  logger.info("=".repeat(60));
});
