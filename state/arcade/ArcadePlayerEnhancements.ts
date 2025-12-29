// Player enhancement tracking and stat modifications

import { isArcadeMode, ARCADE_PHYSICS_MULTIPLIERS } from "../gameModes";
import SoccerPlayerEntity from "../../entities/SoccerPlayerEntity";
import { World } from "hytopia";

export type EnhancementType = 'speed' | 'power' | 'precision' | 'freeze_blast' | 'fireball' | 'mega_kick' | 'shield' | 'stamina' | 'shuriken' |
                               'time_slow' | 'ball_magnet' | 'star_rain' | 'crystal_barrier' | 'elemental_mastery' | 'tidal_wave' | 'reality_warp' | 'honey_trap';

export interface PlayerEnhancement {
  playerId: string;
  type: EnhancementType;
  startTime: number;
  endTime: number;
  multiplier: number;
}

export class ArcadePlayerEnhancements {
  private playerEnhancements: Map<string, PlayerEnhancement> = new Map();
  private world: World;

  constructor(world: World) {
    this.world = world;
    console.log("ArcadePlayerEnhancements initialized");
  }

  /**
   * Add enhancement to a specific player
   * @param playerId - Player to enhance
   * @param type - Type of enhancement
   * @param duration - Duration in milliseconds
   */
  addEnhancement(playerId: string, type: EnhancementType, duration: number = 10000): void {
    // SAFETY CHECK: Only work in arcade mode
    if (!isArcadeMode()) {
      return;
    }

    const enhancement: PlayerEnhancement = {
      playerId: playerId,
      type: type,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      multiplier: this.getEnhancementMultiplier(type)
    };

    this.playerEnhancements.set(playerId, enhancement);

    console.log(`Player ${playerId} received ${type} enhancement for ${duration/1000} seconds`);
  }

  /**
   * Remove enhancement from player
   * @param playerId - Player ID
   */
  removeEnhancement(playerId: string): void {
    this.playerEnhancements.delete(playerId);
    console.log(`Enhancement expired for player ${playerId}`);
  }

  /**
   * Get multiplier for enhancement type
   * @param type - Enhancement type
   * @returns Multiplier value
   */
  private getEnhancementMultiplier(type: EnhancementType): number {
    switch (type) {
      case 'speed':
        return ARCADE_PHYSICS_MULTIPLIERS.PLAYER_SPEED;
      case 'power':
        return ARCADE_PHYSICS_MULTIPLIERS.SHOT_POWER;
      case 'precision':
        return 1.3; // 30% better accuracy
      case 'mega_kick':
        return 3.0; // Triple kick power
      case 'shield':
      case 'freeze_blast':
      case 'fireball':
        return 1.0; // These are special effects, not multipliers
      default:
        return 1.0;
    }
  }

  /**
   * Get player's current enhancement multiplier for a specific stat
   * @param playerId - Player ID
   * @param stat - Stat type
   * @returns Multiplier value
   */
  getPlayerMultiplier(playerId: string, stat: 'speed' | 'shotPower' | 'precision'): number {
    // SAFETY CHECK: Only work in arcade mode
    if (!isArcadeMode()) {
      return 1.0; // No multipliers in FIFA mode
    }

    const enhancement = this.playerEnhancements.get(playerId);
    if (!enhancement) {
      return 1.0;
    }

    // Map stat to enhancement type
    const statToType: { [key: string]: EnhancementType } = {
      'speed': 'speed',
      'shotPower': 'power',
      'precision': 'precision'
    };

    if (enhancement.type === statToType[stat]) {
      return enhancement.multiplier;
    }

    return 1.0;
  }

  /**
   * Check if player has any active enhancement
   * @param playerId - Player ID
   * @returns True if player has active enhancement
   */
  hasActiveEnhancement(playerId: string): boolean {
    return this.playerEnhancements.has(playerId);
  }

  /**
   * Get player's active enhancement info
   * @param playerId - Player ID
   * @returns Enhancement info or null
   */
  getPlayerEnhancement(playerId: string): PlayerEnhancement | null {
    return this.playerEnhancements.get(playerId) || null;
  }

  /**
   * Check if player has mega kick active
   * @param playerId - Player ID
   * @returns True if player has mega kick
   */
  hasMegaKick(playerId: string): boolean {
    const enhancement = this.playerEnhancements.get(playerId);
    return enhancement?.type === 'mega_kick';
  }

  /**
   * Check if player has shield active
   * @param playerId - Player ID
   * @returns True if player has shield
   */
  hasShield(playerId: string): boolean {
    const enhancement = this.playerEnhancements.get(playerId);
    return enhancement?.type === 'shield';
  }

  /**
   * Consume mega kick (call when player kicks ball)
   * @param playerId - Player ID
   * @returns True if mega kick was consumed
   */
  consumeMegaKick(playerId: string): boolean {
    const enhancement = this.playerEnhancements.get(playerId);
    if (enhancement?.type === 'mega_kick') {
      this.removeEnhancement(playerId);
      return true;
    }
    return false;
  }

  /**
   * Update active player enhancements (remove expired ones)
   */
  updateEnhancements(): void {
    const currentTime = Date.now();
    const playerIds = Array.from(this.playerEnhancements.keys());

    for (const playerId of playerIds) {
      const enhancement = this.playerEnhancements.get(playerId);
      if (enhancement && enhancement.endTime < currentTime) {
        this.removeEnhancement(playerId);
      }
    }
  }

  /**
   * Clear all enhancements
   */
  clearAll(): void {
    this.playerEnhancements.clear();
  }

  /**
   * Helper method to find player entity by ID
   * @param playerId - Player ID
   * @returns Player entity or null
   */
  findPlayerEntity(playerId: string): SoccerPlayerEntity | null {
    if (!this.world?.entityManager) {
      console.error(`❌ findPlayerEntity: World or entityManager is null`);
      return null;
    }

    const playerEntities = this.world.entityManager.getAllPlayerEntities();

    for (const entity of playerEntities) {
      if (entity instanceof SoccerPlayerEntity) {
        if (!entity.player) {
          console.warn(`⚠️ Player entity ${entity.id} has no player object, skipping`);
          continue;
        }

        if (entity.player.username === playerId ||
            entity.player.id === playerId ||
            (entity.player.username && entity.player.username.toLowerCase() === playerId.toLowerCase())) {
          return entity;
        }
      }
    }

    return null;
  }
}

// Arcade-specific ball physics helper (only used in arcade mode)
export function getArcadeBallForce(baseForceName: string, baseForce: number): number {
  // SAFETY CHECK: Only modify in arcade mode
  if (!isArcadeMode()) {
    return baseForce; // Return original force in FIFA mode
  }

  // Apply arcade multipliers
  switch (baseForceName) {
    case 'shot':
      return baseForce * ARCADE_PHYSICS_MULTIPLIERS.SHOT_POWER;
    case 'pass':
      return baseForce * ARCADE_PHYSICS_MULTIPLIERS.PASS_SPEED;
    default:
      return baseForce;
  }
}

// Arcade-specific player speed helper (only used in arcade mode)
export function getArcadePlayerSpeed(baseSpeed: number, playerId: string, enhancementManager?: ArcadePlayerEnhancements): number {
  // SAFETY CHECK: Only modify in arcade mode
  if (!isArcadeMode()) {
    return baseSpeed; // Return original speed in FIFA mode
  }

  let arcadeSpeed = baseSpeed * ARCADE_PHYSICS_MULTIPLIERS.PLAYER_SPEED;

  // Apply individual player enhancements if available
  if (enhancementManager) {
    const speedMultiplier = enhancementManager.getPlayerMultiplier(playerId, 'speed');
    arcadeSpeed *= speedMultiplier;
  }

  return arcadeSpeed;
}
