/**
 * AI Player Spawning Utility
 *
 * Handles spawning AI players for single-player and multiplayer modes.
 * Extracted from index.ts to improve modularity.
 *
 * Supports both single-room (global sharedState) and multi-room (RoomSharedState) modes.
 */

import { World } from "hytopia";
import AIPlayerEntity from "../entities/AIPlayerEntity";
import type { SoccerAIRole } from "../entities/ai/AIRoleDefinitions";
import sharedState from "../state/sharedState";
import { RoomSharedState } from "../state/RoomSharedState";
import { getStartPosition } from "./positions";
import { logger } from "./GameLogger";

// Type for shared state that works with both global and room-specific state
type SharedStateType = typeof sharedState | RoomSharedState;

/**
 * Spawn AI players for a given team
 *
 * In single-player mode:
 * - Spawns 5 AI for player's team (excluding central-midfielder-1 which is the human)
 * - Spawns 6 AI for opponent team (full team)
 *
 * @param world - The game world
 * @param playerTeam - The team the human player is on ("red" or "blue")
 * @param aiPlayers - Array to store spawned AI players
 * @param state - Shared game state (global singleton or room-specific RoomSharedState)
 */
export async function spawnAIPlayers(
  world: World,
  playerTeam: "red" | "blue",
  aiPlayers: AIPlayerEntity[],
  state: SharedStateType
): Promise<void> {
  const gameState = state;

  // Determine if we're using room-specific state
  const roomState = state instanceof RoomSharedState ? state : undefined;
  const roomId = roomState?.getRoomId() || 'global';

  logger.info(`⚽ Spawning AI players for team ${playerTeam} in room: ${roomId}`);

  // Define full team roles for 6v6 gameplay
  const fullTeamRoles: SoccerAIRole[] = [
    "goalkeeper",
    "left-back",
    "right-back",
    "central-midfielder-1",
    "central-midfielder-2",
    "striker",
  ];

  // Spawn AI for player's team (5 AI players since human is central-midfielder-1)
  const playerTeamRoles = fullTeamRoles.filter((role) => role !== "central-midfielder-1");
  for (const role of playerTeamRoles) {
    // Pass room state to AI player for room-aware behavior
    const aiPlayer = new AIPlayerEntity(world, playerTeam, role, roomState);
    const spawnPosition = getStartPosition(playerTeam, role);
    aiPlayer.spawn(world, spawnPosition);
    aiPlayers.push(aiPlayer);
    gameState.addAIToTeam(aiPlayer, playerTeam);
  }

  // Spawn full opponent team (6 AI players)
  const opponentTeam = playerTeam === "red" ? "blue" : "red";
  for (const role of fullTeamRoles) {
    // Pass room state to AI player for room-aware behavior
    const aiPlayer = new AIPlayerEntity(world, opponentTeam, role, roomState);
    const spawnPosition = getStartPosition(opponentTeam, role);
    aiPlayer.spawn(world, spawnPosition);
    aiPlayers.push(aiPlayer);
    gameState.addAIToTeam(aiPlayer, opponentTeam);
  }

  logger.info(`✅ Spawned ${aiPlayers.length} AI players total in room: ${roomId}`);
}
