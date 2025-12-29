/**
 * Hytopia Soccer Game - Main Entry Point
 *
 * MULTI-ROOM ARCHITECTURE:
 * - Default world serves as LOBBY (room browser, quick play)
 * - Game rooms are created dynamically via WorldManager
 * - Each room has isolated: World, SoccerGame, SharedState, AI
 * - Supports up to 5 concurrent rooms (60 players max)
 *
 * See REFACTORING_PLAN.md for full details of the modularization.
 */

import { startServer, PlayerManager, PlayerEvent } from "hytopia";
import { ServerInitializer } from "./src/core/ServerInitializer";
import { RoomManager } from "./state/RoomManager";
import { logger } from "./utils/GameLogger";

// Start the Hytopia server
startServer((world) => {
  logger.info("🎮 Hytopia Soccer Server Starting...");
  logger.info("=".repeat(60));
  logger.info("🏠 Multi-Room Architecture Enabled");
  logger.info("   - Default world: LOBBY");
  logger.info("   - Game rooms: Created on demand");
  logger.info("   - Max rooms: 5 (60 players)");
  logger.info("=".repeat(60));

  // Initialize all server systems using the centralized initializer
  // The default world becomes our LOBBY
  const initializer = new ServerInitializer(world);
  const systems = initializer.initialize();

  // Initialize RoomManager with lobby world and game dependencies
  // This must happen AFTER ServerInitializer so we have access to the classes/functions
  RoomManager.initialize(
    world,
    systems.SoccerGameClass,
    systems.createSoccerBallFn,
    systems.spawnAIPlayersFn,
    systems.mapData
  );

  // Set up player routing - all players start in lobby
  PlayerManager.instance.worldSelectionHandler = async (player) => {
    logger.info(`🚪 Player ${player.username} connecting - routing to lobby`);
    return world; // Always start in lobby
  };

  // All systems are now initialized and event handlers are registered automatically:
  // ✅ Lobby world with room browser UI
  // ✅ RoomManager for creating/joining game rooms
  // ✅ Audio system for lobby music
  // ✅ Event handlers for room management

  logger.info("=".repeat(60));
  logger.info("🎮 Hytopia Soccer Server Ready!");
  logger.info("📊 Systems initialized:");
  logger.info(`   - Lobby World: ✓`);
  logger.info(`   - Room Manager: ${RoomManager.isInitialized() ? "✓" : "✗"}`);
  logger.info(`   - Audio: ${systems.audioManager ? "✓" : "✗"}`);
  logger.info(`   - Event Handlers: ✓`);
  logger.info("=".repeat(60));
});
