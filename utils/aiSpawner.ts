/**
 * AI Player Spawning Utility
 *
 * Handles spawning AI players for single-player and multiplayer modes.
 * Extracted from index.ts to improve modularity.
 */

import { World } from "hytopia";
import AIPlayerEntity, { type SoccerAIRole } from "../entities/AIPlayerEntity";
import sharedState from "../state/sharedState";
import { getStartPosition } from "./positions";
import { logger } from "./GameLogger";

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
 * @param state - Shared game state singleton for tracking AI
 */
export async function spawnAIPlayers(
  world: World,
  playerTeam: "red" | "blue",
  aiPlayers: AIPlayerEntity[],
  state: typeof sharedState
): Promise<void> {
  const sharedState = state;
  logger.info(`> Spawning AI players for team ${playerTeam}...`);

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
    const aiPlayer = new AIPlayerEntity(world, playerTeam, role);
    const spawnPosition = getStartPosition(playerTeam, role);
    aiPlayer.spawn(world, spawnPosition);
    aiPlayers.push(aiPlayer);
    sharedState.addAIToTeam(aiPlayer, playerTeam);
  }

  // Spawn full opponent team (6 AI players)
  const opponentTeam = playerTeam === "red" ? "blue" : "red";
  for (const role of fullTeamRoles) {
    const aiPlayer = new AIPlayerEntity(world, opponentTeam, role);
    const spawnPosition = getStartPosition(opponentTeam, role);
    aiPlayer.spawn(world, spawnPosition);
    aiPlayers.push(aiPlayer);
    sharedState.addAIToTeam(aiPlayer, opponentTeam);
  }

  logger.info(` Spawned ${aiPlayers.length} AI players total`);
}
