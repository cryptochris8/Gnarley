/**
 * Position utilities for player and AI spawning
 *
 * Provides role-based positioning for the soccer field.
 * Extracted from index.ts to improve modularity.
 */

import type { Vector3Like } from "hytopia";
import type { SoccerAIRole } from "../entities/AIPlayerEntity";
import {
  SAFE_SPAWN_Y,
  AI_FIELD_CENTER_Z,
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_DEFENSIVE_OFFSET_X,
  AI_MIDFIELD_OFFSET_X,
  AI_FORWARD_OFFSET_X,
  AI_WIDE_Z_BOUNDARY_MAX,
  AI_WIDE_Z_BOUNDARY_MIN,
  AI_MIDFIELD_Z_BOUNDARY_MAX,
  AI_MIDFIELD_Z_BOUNDARY_MIN,
} from "../state/gameConfig";

/**
 * Get the starting position for a player or AI based on team and role
 *
 * COORDINATE FIX: Red goal at X=52, Blue goal at X=-37
 * Red team defends X=52, attacks toward X=-37 (moves in NEGATIVE X direction)
 * Blue team defends X=-37, attacks toward X=52 (moves in POSITIVE X direction)
 *
 * @param team - The team color ("red" or "blue")
 * @param role - The soccer position role
 * @returns Vector3Like position for spawning
 */
export function getStartPosition(team: "red" | "blue", role: SoccerAIRole): Vector3Like {
  const isRedTeam = team === "red";
  const baseX = isRedTeam ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;

  switch (role) {
    case "goalkeeper":
      return {
        x: baseX + (isRedTeam ? -1 : 1), // 1 unit in front of goal line
        y: SAFE_SPAWN_Y,
        z: AI_FIELD_CENTER_Z,
      };
    case "left-back":
      return {
        x: baseX + (isRedTeam ? -AI_DEFENSIVE_OFFSET_X : AI_DEFENSIVE_OFFSET_X),
        y: SAFE_SPAWN_Y,
        z: AI_WIDE_Z_BOUNDARY_MIN + 10,
      };
    case "right-back":
      return {
        x: baseX + (isRedTeam ? -AI_DEFENSIVE_OFFSET_X : AI_DEFENSIVE_OFFSET_X),
        y: SAFE_SPAWN_Y,
        z: AI_WIDE_Z_BOUNDARY_MAX - 10,
      };
    case "central-midfielder-1":
      return {
        x: baseX + (isRedTeam ? -AI_MIDFIELD_OFFSET_X : AI_MIDFIELD_OFFSET_X),
        y: SAFE_SPAWN_Y,
        z: AI_MIDFIELD_Z_BOUNDARY_MIN + 5,
      };
    case "central-midfielder-2":
      return {
        x: baseX + (isRedTeam ? -AI_MIDFIELD_OFFSET_X : AI_MIDFIELD_OFFSET_X),
        y: SAFE_SPAWN_Y,
        z: AI_MIDFIELD_Z_BOUNDARY_MAX - 5,
      };
    case "striker":
      return {
        x: baseX + (isRedTeam ? -AI_FORWARD_OFFSET_X : AI_FORWARD_OFFSET_X),
        y: SAFE_SPAWN_Y,
        z: AI_FIELD_CENTER_Z,
      };
    default:
      return {
        x: baseX + (isRedTeam ? -1 : 1), // Default to 1 unit in front of goal
        y: SAFE_SPAWN_Y,
        z: AI_FIELD_CENTER_Z,
      };
  }
}
