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
    position: { x: 22, y: 4, z: -28 },
    color: { r: 0, g: 255, b: 50 },
  },
  {
    gameMode: GameMode.ARCADE,
    label: "ARCADE MODE",
    position: { x: 30, y: 4, z: -28 },
    color: { r: 255, g: 100, b: 0 },
  },
  {
    gameMode: GameMode.TOURNAMENT,
    label: "TOURNAMENT",
    position: { x: 38, y: 4, z: -28 },
    color: { r: 0, g: 160, b: 255 },
  },
];

/** Per-player cooldown between portal triggers (ms) */
export const PORTAL_COOLDOWN_MS = 3000;

/** Respawn ball if it drifts too far from player */
export const LOBBY_BALL_RESPAWN_DISTANCE = 60;

/** Respawn ball if it falls below this Y */
export const LOBBY_BALL_MIN_Y = -2;

/** Player spawn position in lobby (center field) */
export const LOBBY_SPAWN_POSITION = { x: 7, y: 2, z: -3 };

/** Minimum ball velocity to trigger a portal (must be kicked, not drifting) */
export const MIN_BALL_VELOCITY_FOR_PORTAL = 1.0;

/** Sensor half extents for portal detection zone (y: 4.5 covers ground to sky at portal y=4) */
export const PORTAL_SENSOR_HALF_EXTENTS = { x: 2.5, y: 4.5, z: 2.5 };
