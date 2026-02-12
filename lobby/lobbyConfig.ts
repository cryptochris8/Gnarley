/**
 * Lobby Configuration - Constants for the physical lobby system
 */

import { GameMode } from "../state/gameModes";

/**
 * Portal configuration for each game mode
 */
export interface PortalConfig {
  gameMode: GameMode;
  label: string;
  position: { x: number; y: number; z: number };
  color: { r: number; g: number; b: number };
}

/**
 * 3 portals placed outside field boundaries along sidelines
 */
export const PORTAL_CONFIGS: PortalConfig[] = [
  {
    gameMode: GameMode.FIFA,
    label: "FIFA MODE",
    position: { x: 30, y: 4, z: -28 },
    color: { r: 0, g: 220, b: 60 },
  },
  {
    gameMode: GameMode.ARCADE,
    label: "ARCADE MODE",
    position: { x: -15, y: 4, z: 20 },
    color: { r: 255, g: 140, b: 0 },
  },
  {
    gameMode: GameMode.TOURNAMENT,
    label: "TOURNAMENT",
    position: { x: -28, y: 4, z: -3 },
    color: { r: 255, g: 215, b: 0 },
  },
];

/** Per-player cooldown between portal triggers (ms) */
export const PORTAL_COOLDOWN_MS = 3000;

/** Respawn ball if it drifts too far from player */
export const LOBBY_BALL_RESPAWN_DISTANCE = 40;

/** Respawn ball if it falls below this Y */
export const LOBBY_BALL_MIN_Y = -2;

/** Player spawn position in lobby (center field) */
export const LOBBY_SPAWN_POSITION = { x: 7, y: 2, z: -3 };

/** Minimum ball velocity to trigger a portal (must be kicked, not drifting) */
export const MIN_BALL_VELOCITY_FOR_PORTAL = 1.0;

/** Sensor half extents for portal detection zone */
export const PORTAL_SENSOR_HALF_EXTENTS = { x: 2.5, y: 3, z: 2.5 };
