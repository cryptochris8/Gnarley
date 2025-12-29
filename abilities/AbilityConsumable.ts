import { Entity, type World, type Vector3Like, Audio, RigidBodyType, type BlockType, ColliderShape, CollisionGroup } from 'hytopia';
import { ItemThrowAbility } from './ItemThrowAbility';
import type { ItemAbilityOptions } from './itemTypes';
import { ALL_POWERUP_OPTIONS } from './itemTypes';
import SoccerPlayerEntity from '../entities/SoccerPlayerEntity';
import { ABILITY_PICKUP_POSITIONS, ABILITY_RESPAWN_TIME } from '../state/gameConfig';
import { SpeedBoostAbility } from './SpeedBoostAbility';
import { PowerBoostAbility } from './PowerBoostAbility';
import { StaminaAbility } from './StaminaAbility';
import { FreezeBlastAbility } from './FreezeBlastAbility';
import { FireballAbility } from './FireballAbility';
import { TimeSlowAbility } from './TimeSlowAbility';
import { BallMagnetAbility } from './BallMagnetAbility';
import { CrystalBarrierAbility } from './CrystalBarrierAbility';
import { EnhancedPowerAbility } from './EnhancedPowerAbility';
import type { Ability } from './Ability';

// Timer type for Node.js compatibility
type Timer = ReturnType<typeof setTimeout>;

export class AbilityConsumable {
    private entity: Entity;
    private world: World;
    private respawnTimer: Timer | null = null;
    private originalPosition: Vector3Like; // Store original position for consistent respawning
    private isCollected: boolean = false; // Prevent double-despawn race condition

    constructor(
        world: World,
        private position: Vector3Like,
        private abilityOptions: ItemAbilityOptions
    ) {
        this.world = world;
        this.originalPosition = { ...position }; // Store original position
        this.entity = this.createConsumableEntity();
        this.spawn();
    }

    private createConsumableEntity(): Entity {
        const entity = new Entity({
            name: `${this.abilityOptions.name}Pickup`,
            modelUri: this.abilityOptions.modelUri,
            modelScale: this.abilityOptions.modelScale * 3, // Increased scale for better visibility 
            modelLoopedAnimations: [this.abilityOptions.idleAnimation],
            rigidBodyOptions: {
                type: RigidBodyType.KINEMATIC_POSITION,
                colliders: [
                    {
                        shape: ColliderShape.CYLINDER,
                        radius: 1.2, // Increased for better collision detection with larger models
                        halfHeight: 0.8, // Increased height for easier pickup
                        isSensor: true, // Allow pass-through collision for Mario/Sonic-style pickup
                        tag: 'ability-pickup',
                        collisionGroups: {
                            belongsTo: [CollisionGroup.ENTITY],
                            // ENHANCED: Multiple collision groups for maximum compatibility
                            collidesWith: [
                                CollisionGroup.PLAYER,      // For properly configured players
                                CollisionGroup.ENTITY,      // Fallback for default entity collision
                                CollisionGroup.ENTITY_SENSOR // Additional sensor collision
                            ]
                        },
                        onCollision: (other: BlockType | Entity, started: boolean) => {
                            // Only process collision start, not end
                            if (!started) return;

                            // Prevent double-collection race condition
                            if (this.isCollected) return;
                            
                            // Enhanced player detection with multiple checks
                            let targetPlayer: SoccerPlayerEntity | null = null;

                            // Primary check: Direct SoccerPlayerEntity instance
                            if (other instanceof SoccerPlayerEntity) {
                                targetPlayer = other;
                            }
                            // Secondary check: Entity with player property (for compatibility)
                            else if (other instanceof Entity && 'player' in other && 'abilityHolder' in other) {
                                targetPlayer = other as SoccerPlayerEntity;
                            }
                            // Non-player collision - ignore
                            else {
                                return;
                            }

                            if (!targetPlayer) return;

                            // Check if player already has an ability
                            if (!targetPlayer.abilityHolder.hasAbility()) {
                                // Mark as collected BEFORE despawning to prevent race condition
                                this.isCollected = true;
                                console.log(`🎮 ${targetPlayer.player.username} collected ${this.abilityOptions.name}!`);
                                this.giveAbilityToPlayer(targetPlayer);
                                this.despawn();
                                this.startRespawnTimer();
                            } else {
                                // Player already has ability - show feedback
                                try {
                                    targetPlayer.player.ui.sendData({
                                        type: "action-feedback",
                                        feedbackType: "info",
                                        title: "Ability Slot Full",
                                        message: `Press F to use current ability first`
                                    });
                                } catch (e) {
                                    // Silently ignore UI feedback errors
                                }
                            }
                        }
                    }
                ]
            }
        });
        
        return entity;
    }

    private giveAbilityToPlayer(player: SoccerPlayerEntity) {
        let ability: Ability;

        // Determine ability type based on name
        try {
            switch (this.abilityOptions.name) {
                // Original abilities
                case "Speed Boost":
                    ability = new SpeedBoostAbility(this.abilityOptions);
                    break;
                case "Stamina Potion":
                    ability = new StaminaAbility(this.abilityOptions);
                    break;
                case "Mega Kick":
                case "Power Boost":
                case "Precision":
                case "Stamina":
                case "Shield":
                    ability = new PowerBoostAbility(this.abilityOptions);
                    break;

                // Enhanced abilities
                case "Time Slow":
                    ability = new TimeSlowAbility(this.abilityOptions);
                    break;
                case "Ball Magnet":
                    ability = new BallMagnetAbility(this.abilityOptions);
                    break;
                case "Crystal Barrier":
                    ability = new CrystalBarrierAbility(this.abilityOptions);
                    break;
                case "Elemental Mastery":
                case "Tidal Wave":
                case "Reality Warp":
                case "Honey Trap":
                    ability = new EnhancedPowerAbility(this.abilityOptions);
                    break;

                // Specific projectile abilities
                case "Freeze Blast":
                    ability = new FreezeBlastAbility(this.abilityOptions);
                    break;
                case "Fireball":
                    ability = new FireballAbility(this.abilityOptions);
                    break;

                // Projectile abilities (default)
                case "Shuriken":
                default:
                    ability = new ItemThrowAbility(this.abilityOptions);
                    break;
            }
        } catch (error) {
            console.error(`❌ ERROR creating ability for ${this.abilityOptions.name}:`, error);
            // Fallback to basic ability
            ability = new ItemThrowAbility(this.abilityOptions);
        }
        
        player.abilityHolder.setAbility(ability);
        player.abilityHolder.showAbilityUI(player.player);

        // Create pickup particle effect
        this.createPickupParticles(player.position);

        // Audio feedback for pickup
        try {
            const pickupAudio = new Audio({
                uri: 'audio/sfx/ui/inventory-grab-item.mp3',
                volume: 0.5,
                position: player.position
            });
            pickupAudio.play(this.world);
        } catch (e) {
            // Silently ignore audio errors
        }
    }

    private createPickupParticles(position: Vector3Like) {
        try {
            // Create pickup effect using firework as visual feedback
            const effectEntity = new Entity({
                name: 'pickup-effect',
                modelUri: 'models/misc/firework.gltf',
                modelScale: 0.5,
                rigidBodyOptions: {
                    type: RigidBodyType.KINEMATIC_POSITION,
                }
            });

            // Spawn briefly at pickup location
            effectEntity.spawn(this.world, position);

            // Auto-despawn after brief display
            setTimeout(() => {
                if (effectEntity.isSpawned) {
                    effectEntity.despawn();
                }
            }, 800); // Quick flash effect

        } catch (e) {
            // Silently ignore particle effect errors
        }
    }

    private startRespawnTimer() {
        if (this.respawnTimer) {
            clearTimeout(this.respawnTimer);
        }

        this.respawnTimer = setTimeout(() => {
            this.spawn(true); // Enable randomization on respawn
        }, ABILITY_RESPAWN_TIME);
    }

    /**
     * Randomly select a new ability type from all available options
     * Attempts to avoid selecting the same ability that was just collected for variety
     */
    private selectRandomAbility(): ItemAbilityOptions {
        let attempts = 0;
        let selectedOption: ItemAbilityOptions;

        // Try to select a different ability type for variety (up to 3 attempts)
        do {
            const randomIndex = Math.floor(Math.random() * ALL_POWERUP_OPTIONS.length);
            selectedOption = ALL_POWERUP_OPTIONS[randomIndex];
            attempts++;
        } while (selectedOption.name === this.abilityOptions.name && attempts < 3);

        return selectedOption;
    }

    public spawn(randomizeAbility: boolean = false) {
        if (!this.entity.isSpawned) {
            // Reset collection flag for new spawn
            this.isCollected = false;

            // Randomize ability type on respawn for variety
            if (randomizeAbility) {
                this.abilityOptions = this.selectRandomAbility();
            }

            // Create fresh entity each time to ensure collision properties are restored
            this.entity = this.createConsumableEntity();
            this.entity.spawn(this.world, this.originalPosition);
        }
    }

    public despawn() {
        if (this.entity.isSpawned) {
            this.entity.despawn();
        }
    }

    public destroy() {
        this.despawn();
        if (this.respawnTimer) {
            clearTimeout(this.respawnTimer);
        }
    }
} 