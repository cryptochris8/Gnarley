/**
 * WorldExtensions
 *
 * Type-safe extensions for the Hytopia World object.
 * Defines custom properties attached to the world instance.
 */

import { World } from "hytopia";
import { ArcadeEnhancementManager } from "../state/arcadeEnhancements";
import { PickupGameManager } from "../state/pickupGameManager";
import { TournamentManager } from "../state/tournamentManager";
import { PerformanceProfiler } from "../utils/performanceProfiler";

/**
 * Extended World interface with custom game manager properties
 */
export interface ExtendedWorld extends World {
  _arcadeManager?: ArcadeEnhancementManager;
  _pickupManager?: PickupGameManager;
  _tournamentManager?: TournamentManager;
  _performanceProfiler?: PerformanceProfiler;
  _lastStuckCommandTime?: number;
}
