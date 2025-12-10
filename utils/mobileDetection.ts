/**
 * Mobile Detection Utility
 *
 * Detects if a player is connecting from a mobile device based on
 * Hytopia SDK's built-in mobile detection capabilities.
 */

import { Player } from "hytopia";

/**
 * Check if a player is on a mobile device
 *
 * Hytopia SDK automatically detects mobile devices and provides
 * mobile-optimized controls. We can detect this by checking if
 * the player's client is reporting as a mobile device.
 *
 * @param player - The player to check
 * @returns true if the player is on a mobile device, false otherwise
 */
export function isMobilePlayer(player: Player): boolean {
  // Hytopia SDK sets isMobile flag on the player object
  // This is automatically detected based on the client's user agent
  return (player as any).isMobile === true;
}

/**
 * Mark a player as having mobile mode enabled
 * This is called when we receive the mobile-mode-enabled UI event
 *
 * @param player - The player to mark as mobile
 */
export function setMobilePlayer(player: Player, isMobile: boolean): void {
  (player as any)._isMobilePlayer = isMobile;
}

/**
 * Check if a player has explicitly enabled mobile mode via UI
 *
 * @param player - The player to check
 * @returns true if the player has enabled mobile mode, false otherwise
 */
export function hasMobileModeEnabled(player: Player): boolean {
  return (player as any)._isMobilePlayer === true;
}
