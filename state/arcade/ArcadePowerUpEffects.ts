// Individual power-up effect implementations for arcade mode

import { World, Entity, Audio, RigidBodyType, ColliderShape, CollisionGroup, BlockType, EntityEvent, type Vector3Like } from "hytopia";
import { isArcadeMode } from "../gameModes";
import SoccerPlayerEntity from "../../entities/SoccerPlayerEntity";
import { ArcadeTimerManager } from "./ArcadeTimerManager";
import { ArcadeAudioEffects } from "./ArcadeAudioEffects";
import { ArcadePlayerEnhancements, EnhancementType } from "./ArcadePlayerEnhancements";

export class ArcadePowerUpEffects {
  private world: World;
  private timerManager: ArcadeTimerManager;
  private audioEffects: ArcadeAudioEffects;
  private playerEnhancements: ArcadePlayerEnhancements;
  private activeEntities: Set<Entity> = new Set();

  constructor(
    world: World,
    timerManager: ArcadeTimerManager,
    audioEffects: ArcadeAudioEffects,
    playerEnhancements: ArcadePlayerEnhancements
  ) {
    this.world = world;
    this.timerManager = timerManager;
    this.audioEffects = audioEffects;
    this.playerEnhancements = playerEnhancements;
    console.log("ArcadePowerUpEffects initialized");
  }

  /**
   * Track an entity for cleanup
   */
  private trackEntity(entity: Entity): void {
    this.activeEntities.add(entity);
  }

  /**
   * Untrack an entity
   */
  private untrackEntity(entity: Entity): void {
    this.activeEntities.delete(entity);
  }

  /**
   * Cleanup all tracked entities
   */
  cleanupAllEntities(): void {
    console.log(`🧹 Cleaning up ${this.activeEntities.size} active entities...`);

    this.activeEntities.forEach(entity => {
      try {
        if (entity.isSpawned) {
          entity.despawn();
        }
      } catch (error) {
        console.warn(`⚠️ Failed to despawn entity:`, error);
      }
    });

    this.activeEntities.clear();
  }

  /**
   * Execute freeze blast power-up
   */
  executeFreezeBlast(playerId: string): void {
    if (this.timerManager.destroyed) {
      console.warn("🧊 FREEZE BLAST: Manager destroyed, skipping execution");
      return;
    }

    console.log(`🧊 FREEZE BLAST: ${playerId} activating freeze blast!`);

    const playerEntity = this.playerEnhancements.findPlayerEntity(playerId);
    if (!playerEntity || !playerEntity.isSpawned || !playerEntity.world) {
      console.error(`Player entity not found or not spawned for freeze blast: ${playerId}`);
      return;
    }

    // Play freeze blast sound
    this.audioEffects.playFreezeSound(playerEntity.position);

    // Create visual effect
    this.createPowerUpEffect(playerEntity.position, 'freeze_blast');

    // Create freeze effect entity
    const freezeEffect = new Entity({
      name: 'freeze-effect',
      modelUri: 'models/misc/selection-indicator.gltf',
      modelScale: 5.0,
      rigidBodyOptions: {
        type: RigidBodyType.KINEMATIC_POSITION,
      },
    });

    freezeEffect.spawn(this.world, {
      x: playerEntity.position.x,
      y: playerEntity.position.y + 0.5,
      z: playerEntity.position.z
    });

    // Find enemies within radius and freeze them
    const allPlayers = this.world.entityManager.getAllPlayerEntities()
      .filter(entity => entity instanceof SoccerPlayerEntity) as SoccerPlayerEntity[];

    const frozenPlayers: SoccerPlayerEntity[] = [];
    const freezeRadius = 5.0;

    allPlayers.forEach(targetPlayer => {
      if (targetPlayer.player.username === playerId ||
          (playerEntity instanceof SoccerPlayerEntity && targetPlayer.team === playerEntity.team)) {
        return;
      }

      const distance = Math.sqrt(
        Math.pow(targetPlayer.position.x - playerEntity.position.x, 2) +
        Math.pow(targetPlayer.position.z - playerEntity.position.z, 2)
      );

      if (distance <= freezeRadius) {
        this.freezePlayer(targetPlayer);
        frozenPlayers.push(targetPlayer);
        console.log(`🧊 FROZEN: ${targetPlayer.player.username} frozen by freeze blast!`);
      }
    });

    // Remove visual effect after 1 second
    this.timerManager.registerTimer(
      setTimeout(() => {
        if (freezeEffect.isSpawned) {
          freezeEffect.despawn();
        }
      }, 1000),
      'timeout',
      playerId
    );

    // Unfreeze all players after 3 seconds
    this.timerManager.registerTimer(
      setTimeout(() => {
        frozenPlayers.forEach(frozenPlayer => {
          if (frozenPlayer.isSpawned) {
            this.unfreezePlayer(frozenPlayer);
            console.log(`🧊 UNFROZEN: ${frozenPlayer.player.username} unfrozen!`);
          }
        });
      }, 3000),
      'timeout',
      playerId
    );

    console.log(`🧊 FREEZE BLAST COMPLETE: Affected ${frozenPlayers.length} players`);
  }

  /**
   * Freeze a player
   */
  private freezePlayer(player: SoccerPlayerEntity): void {
    if ((player as any)._frozenState?.wasFrozen) {
      console.log(`🧊 Player ${player.player.username} is already frozen, skipping`);
      return;
    }

    player.freeze();
    player.setLinearVelocity({ x: 0, y: 0, z: 0 });
    player.setAngularVelocity({ x: 0, y: 0, z: 0 });

    (player as any)._frozenState = {
      originalMass: player.mass,
      wasFrozen: true,
      freezeTime: Date.now()
    };

    player.setAdditionalMass(1000);

    // Create ice effect indicator
    const iceEffect = new Entity({
      name: 'ice-indicator',
      modelUri: 'models/misc/selection-indicator.gltf',
      modelScale: 1.5,
      rigidBodyOptions: {
        type: RigidBodyType.KINEMATIC_POSITION,
      },
      parent: player,
      parentNodeName: "head_anchor"
    });

    iceEffect.spawn(this.world, { x: 0, y: 1.5, z: 0 });
    (player as any)._iceEffect = iceEffect;
  }

  /**
   * Unfreeze a player
   */
  private unfreezePlayer(player: SoccerPlayerEntity): void {
    const frozenState = (player as any)._frozenState;
    if (!frozenState || !frozenState.wasFrozen) {
      return;
    }

    const freezeDuration = Date.now() - (frozenState.freezeTime || 0);
    console.log(`🧊 Unfreezing ${player.player.username} after ${freezeDuration}ms`);

    player.unfreeze();
    player.setAdditionalMass(0);

    const iceEffect = (player as any)._iceEffect;
    if (iceEffect && iceEffect.isSpawned) {
      iceEffect.despawn();
    }

    delete (player as any)._frozenState;
    delete (player as any)._iceEffect;

    // Play unfreeze sound
    const unfreezeAudio = new Audio({
      uri: "audio/sfx/dig/dig-grass.mp3",
      loop: false,
      volume: 0.3,
      position: player.position,
      referenceDistance: 8
    });
    unfreezeAudio.play(this.world);
  }

  /**
   * Execute fireball power-up
   */
  executeFireball(playerId: string): void {
    if (this.timerManager.destroyed) {
      console.warn("🔥 FIREBALL: Manager destroyed, skipping execution");
      return;
    }

    console.log(`🔥 FIREBALL: ${playerId} launching explosive fireball!`);

    const playerEntity = this.playerEnhancements.findPlayerEntity(playerId);
    if (!playerEntity || !playerEntity.isSpawned || !playerEntity.world) {
      console.error(`Player entity not found for fireball: ${playerId}`);
      return;
    }

    // Play fireball sound
    this.audioEffects.playFireballSound(playerEntity.position);

    // Create visual effect
    this.createPowerUpEffect(playerEntity.position, 'fireball');

    // Calculate launch direction
    const direction = this.calculateDirectionFromRotation(playerEntity.rotation);

    // Create fireball projectile
    const fireball = new Entity({
      name: 'fireball-projectile',
      modelUri: 'models/projectiles/fireball.gltf',
      modelScale: 1.2,
      rigidBodyOptions: {
        type: RigidBodyType.DYNAMIC,
        ccdEnabled: true,
        linearDamping: 0.05,
        angularDamping: 0.1,
        gravityScale: 0.4,
        enabledRotations: { x: true, y: true, z: true },
      },
    });

    // Spawn fireball in front of player
    const spawnOffset = 2.0;
    const fireballPosition = {
      x: playerEntity.position.x + direction.x * spawnOffset,
      y: playerEntity.position.y + 1.2,
      z: playerEntity.position.z + direction.z * spawnOffset
    };

    fireball.spawn(this.world, fireballPosition);

    // Apply launch velocity
    const launchForce = 18.0;
    fireball.setLinearVelocity({
      x: direction.x * launchForce,
      y: 3.0,
      z: direction.z * launchForce
    });

    fireball.setAngularVelocity({ x: 5, y: 10, z: 3 });

    // Create fireball trail
    this.createFireballTrail(fireball);

    // Track fireball for collision
    this.trackFireballProjectile(fireball, playerId);

    console.log(`🔥 FIREBALL LAUNCHED!`);
  }

  /**
   * Create fireball trail effect
   */
  private createFireballTrail(fireball: Entity): void {
    const trailInterval = this.timerManager.registerTimer(
      setInterval(() => {
        if (this.timerManager.destroyed || !fireball.isSpawned) {
          clearInterval(trailInterval);
          return;
        }

        const trailParticle = new Entity({
          name: 'fireball-trail',
          modelUri: 'models/misc/firework.gltf',
          modelScale: 0.3 + Math.random() * 0.2,
          rigidBodyOptions: {
            type: RigidBodyType.KINEMATIC_POSITION,
          }
        });

        trailParticle.spawn(this.world, {
          x: fireball.position.x + (Math.random() - 0.5) * 0.3,
          y: fireball.position.y + (Math.random() - 0.5) * 0.3,
          z: fireball.position.z + (Math.random() - 0.5) * 0.3
        });

        this.trackEntity(trailParticle);

        this.timerManager.registerTimer(
          setTimeout(() => {
            if (trailParticle.isSpawned) {
              trailParticle.despawn();
              this.untrackEntity(trailParticle);
            }
          }, 800),
          'timeout'
        );
      }, 50),
      'interval'
    );
  }

  /**
   * Track fireball for collision and explosion
   */
  private trackFireballProjectile(fireball: Entity, playerId: string): void {
    let hasExploded = false;
    const maxFlightTime = 6000;
    const checkInterval = 50;
    let flightTime = 0;

    const trackingInterval = setInterval(() => {
      flightTime += checkInterval;

      if (!fireball.isSpawned || hasExploded) {
        clearInterval(trackingInterval);
        return;
      }

      const fireballPos = fireball.position;

      // Check for collision with players
      const allPlayers = this.world.entityManager.getAllPlayerEntities()
        .filter(entity => entity instanceof SoccerPlayerEntity) as SoccerPlayerEntity[];

      const hitPlayer = allPlayers.find(player => {
        if (player.player.username === playerId) return false;

        const distance = Math.sqrt(
          Math.pow(player.position.x - fireballPos.x, 2) +
          Math.pow(player.position.y - fireballPos.y, 2) +
          Math.pow(player.position.z - fireballPos.z, 2)
        );

        return distance <= 1.5;
      });

      const groundHit = fireballPos.y <= 0.5;

      if (hitPlayer || groundHit) {
        hasExploded = true;
        this.triggerFireballExplosion(fireballPos, playerId);
        clearInterval(trackingInterval);

        if (fireball.isSpawned) {
          fireball.despawn();
        }
        return;
      }

      if (flightTime >= maxFlightTime || fireballPos.y < -15) {
        hasExploded = true;
        this.triggerFireballExplosion(fireballPos, playerId);
        clearInterval(trackingInterval);

        if (fireball.isSpawned) {
          fireball.despawn();
        }
      }
    }, checkInterval);
  }

  /**
   * Trigger fireball explosion
   */
  private triggerFireballExplosion(explosionPos: { x: number, y: number, z: number }, playerId: string): void {
    console.log(`💥 FIREBALL EXPLOSION!`);

    // Play explosion sound
    this.audioEffects.playExplosionSound(explosionPos);

    // Create explosion visual
    const explosionEffect = new Entity({
      name: 'fireball-explosion',
      modelUri: 'models/misc/firework.gltf',
      modelScale: 8.0,
      rigidBodyOptions: {
        type: RigidBodyType.KINEMATIC_POSITION,
      },
    });

    explosionEffect.spawn(this.world, explosionPos);

    // Apply damage to nearby players
    const explosionRadius = 8.0;
    const allPlayers = this.world.entityManager.getAllPlayerEntities()
      .filter(entity => entity instanceof SoccerPlayerEntity) as SoccerPlayerEntity[];

    allPlayers.forEach(player => {
      if (player.player.username === playerId) return;

      const distance = Math.sqrt(
        Math.pow(player.position.x - explosionPos.x, 2) +
        Math.pow(player.position.y - explosionPos.y, 2) +
        Math.pow(player.position.z - explosionPos.z, 2)
      );

      if (distance <= explosionRadius) {
        const damageMultiplier = Math.max(0.3, 1.0 - (distance / explosionRadius));
        this.applyExplosionDamage(player, explosionPos, damageMultiplier);
      }
    });

    // Remove explosion effect
    this.timerManager.registerTimer(
      setTimeout(() => {
        if (explosionEffect.isSpawned) {
          explosionEffect.despawn();
        }
      }, 3000),
      'timeout',
      playerId
    );
  }

  /**
   * Apply explosion damage to player
   */
  private applyExplosionDamage(player: SoccerPlayerEntity, explosionPos: { x: number, y: number, z: number }, damageMultiplier: number): void {
    const knockbackDirection = this.calculateKnockbackDirection(explosionPos, player.position);
    const baseKnockback = 15.0;
    const knockbackForce = baseKnockback * damageMultiplier;

    player.applyImpulse({
      x: knockbackDirection.x * knockbackForce * player.mass,
      y: 5.0 * damageMultiplier * player.mass,
      z: knockbackDirection.z * knockbackForce * player.mass
    });

    const burnDuration = Math.floor(3000 * damageMultiplier);
    this.applyBurnEffect(player, burnDuration);
  }

  /**
   * Apply burn effect to player
   */
  private applyBurnEffect(player: SoccerPlayerEntity, durationMs: number): void {
    (player as any)._burnState = {
      isBurning: true,
      originalMass: player.mass,
      startTime: Date.now()
    };

    player.setAdditionalMass(300);

    const fireEffect = new Entity({
      name: 'burn-indicator',
      modelUri: 'models/misc/selection-indicator.gltf',
      modelScale: 1.2,
      rigidBodyOptions: {
        type: RigidBodyType.KINEMATIC_POSITION,
      },
    });

    fireEffect.spawn(this.world, {
      x: player.position.x,
      y: player.position.y + 1.8,
      z: player.position.z
    });

    (player as any)._fireEffect = fireEffect;

    this.timerManager.registerTimer(
      setTimeout(() => {
        this.removeBurnEffect(player);
      }, durationMs),
      'timeout',
      player.player.username
    );

    console.log(`🔥 BURN APPLIED: ${player.player.username} burning for ${durationMs}ms`);
  }

  /**
   * Remove burn effect from player
   */
  private removeBurnEffect(player: SoccerPlayerEntity): void {
    const burnState = (player as any)._burnState;
    if (!burnState || !burnState.isBurning) {
      return;
    }

    player.setAdditionalMass(0);

    const fireEffect = (player as any)._fireEffect;
    if (fireEffect && fireEffect.isSpawned) {
      fireEffect.despawn();
    }

    delete (player as any)._burnState;
    delete (player as any)._fireEffect;

    console.log(`🔥 BURN REMOVED: ${player.player.username} recovered from burn`);
  }

  /**
   * Execute speed boost power-up
   */
  executeSpeedBoost(playerId: string): void {
    console.log(`💨 Speed Boost activated by ${playerId}!`);

    const playerEntity = this.playerEnhancements.findPlayerEntity(playerId);
    if (playerEntity) {
      this.createPowerUpEffect(playerEntity.position, 'speed_boost');
      this.audioEffects.playSpeedBoostSound(playerEntity.position);
      this.startSpeedTrail(playerEntity);
    }

    this.playerEnhancements.addEnhancement(playerId, 'speed', 15000);
    console.log(`💨 ${playerId} has speed boost for 15 seconds!`);
  }

  /**
   * Create speed trail effect
   */
  private startSpeedTrail(player: SoccerPlayerEntity): void {
    let lastPosition = { ...player.position };
    let trailParticles: Entity[] = [];
    const maxTrailLength = 10;

    const trailInterval = this.timerManager.registerTimer(
      setInterval(() => {
        if (this.timerManager.destroyed || !player.isSpawned) {
          clearInterval(trailInterval);
          trailParticles.forEach(particle => {
            if (particle.isSpawned) {
              particle.despawn();
              this.untrackEntity(particle);
            }
          });
          trailParticles = [];
          return;
        }

        const currentPos = player.position;
        const distance = Math.sqrt(
          Math.pow(currentPos.x - lastPosition.x, 2) +
          Math.pow(currentPos.z - lastPosition.z, 2)
        );

        if (distance > 0.5) {
          const trailParticle = new Entity({
            name: 'speed-trail',
            modelUri: 'models/misc/selection-indicator.gltf',
            modelScale: 0.2,
            rigidBodyOptions: {
              type: RigidBodyType.KINEMATIC_POSITION,
            }
          });

          trailParticle.spawn(this.world, {
            x: lastPosition.x + (Math.random() - 0.5) * 0.3,
            y: lastPosition.y + 0.1,
            z: lastPosition.z + (Math.random() - 0.5) * 0.3
          });

          this.trackEntity(trailParticle);
          trailParticles.push(trailParticle);

          if (trailParticles.length > maxTrailLength) {
            const oldParticle = trailParticles.shift();
            if (oldParticle && oldParticle.isSpawned) {
              oldParticle.despawn();
              this.untrackEntity(oldParticle);
            }
          }

          this.timerManager.registerTimer(
            setTimeout(() => {
              if (trailParticle.isSpawned) {
                trailParticle.despawn();
                this.untrackEntity(trailParticle);
              }
              const index = trailParticles.indexOf(trailParticle);
              if (index > -1) {
                trailParticles.splice(index, 1);
              }
            }, 1000),
            'timeout',
            player.player.username
          );

          lastPosition = { ...currentPos };
        }
      }, 100),
      'interval',
      player.player.username
    );

    this.timerManager.registerTimer(
      setTimeout(() => {
        clearInterval(trailInterval);
        trailParticles.forEach(particle => {
          if (particle.isSpawned) {
            particle.despawn();
            this.untrackEntity(particle);
          }
        });
        trailParticles = [];
      }, 15000),
      'timeout',
      player.player.username
    );
  }

  /**
   * Execute shield power-up
   */
  executeShield(playerId: string): void {
    console.log(`🛡️ Shield activated by ${playerId}!`);

    const playerEntity = this.playerEnhancements.findPlayerEntity(playerId);
    if (playerEntity) {
      this.audioEffects.playShieldSound(playerEntity.position);

      const shieldEffect = new Entity({
        name: 'shield-bubble',
        modelUri: 'models/misc/selection-indicator.gltf',
        modelScale: 2.5,
        rigidBodyOptions: {
          type: RigidBodyType.KINEMATIC_POSITION,
        },
        parent: playerEntity
      });

      shieldEffect.spawn(this.world, { x: 0, y: 1, z: 0 });
      (playerEntity as any)._shieldEffect = shieldEffect;

      setTimeout(() => {
        if (shieldEffect.isSpawned) {
          shieldEffect.despawn();
        }
        delete (playerEntity as any)._shieldEffect;
      }, 30000);
    }

    this.playerEnhancements.addEnhancement(playerId, 'shield', 30000);
    console.log(`🛡️ ${playerId} has shield protection for 30 seconds!`);
  }

  /**
   * Execute mega kick power-up
   */
  executeMegaKick(playerId: string): void {
    console.log(`⚽ Mega Kick activated by ${playerId}!`);

    const playerEntity = this.playerEnhancements.findPlayerEntity(playerId);
    if (playerEntity) {
      this.createPowerUpEffect(playerEntity.position, 'mega_kick');
    }

    this.playerEnhancements.addEnhancement(playerId, 'mega_kick', 10000);
    console.log(`⚽ ${playerId} has mega kick power for 10 seconds!`);
  }

  /**
   * Execute stamina restoration
   */
  executeStamina(playerId: string): void {
    const player = this.playerEnhancements.findPlayerEntity(playerId);
    if (!player) {
      console.error(`Player ${playerId} not found for stamina restoration`);
      return;
    }

    player.restoreStamina();
    console.log(`🧪 ${playerId} used stamina potion - stamina restored to 100%!`);

    try {
      player.player.ui.sendData({
        type: "player-status-update",
        stamina: player.getStaminaPercentage()
      });

      player.player.ui.sendData({
        type: "powerup-feedback",
        success: true,
        powerUpType: 'stamina',
        message: "STAMINA RESTORED!"
      });
    } catch (error) {
      console.error(`Failed to send stamina UI update: ${error}`);
    }
  }

  /**
   * Execute shuriken throw
   */
  executeShuriken(playerId: string): void {
    console.log(`🥷 SHURIKEN: ${playerId} activating shuriken throw!`);

    const playerEntity = this.playerEnhancements.findPlayerEntity(playerId);
    if (!playerEntity) {
      console.error(`Player entity not found for shuriken throw: ${playerId}`);
      return;
    }

    this.createPowerUpEffect(playerEntity.position, 'shuriken');

    // Calculate throw direction
    const direction = this.calculateDirectionFromRotation(playerEntity.rotation);
    this.createShurikenProjectile(playerEntity, direction, playerId);

    console.log(`🥷 SHURIKEN THROWN!`);
  }

  /**
   * Create shuriken projectile
   */
  private createShurikenProjectile(playerEntity: SoccerPlayerEntity, direction: { x: number, z: number }, playerId: string): void {
    const shuriken = new Entity({
      name: 'shuriken-projectile',
      modelUri: 'models/projectiles/shuriken.gltf',
      modelScale: 0.4,
      modelAnimationsPlaybackRate: 2.8,
      modelLoopedAnimations: ["spin"],
      rigidBodyOptions: {
        type: RigidBodyType.DYNAMIC,
        gravityScale: 0,
      },
    });

    const spawnPosition = {
      x: playerEntity.position.x + direction.x * 1.5,
      y: playerEntity.position.y + 0.8,
      z: playerEntity.position.z + direction.z * 1.5
    };

    shuriken.spawn(this.world, spawnPosition);
    shuriken.setLinearVelocity({ x: direction.x * 12, y: 0, z: direction.z * 12 });
    shuriken.setAngularVelocity({ x: 0, y: 20, z: 0 });

    // Create collision detection
    shuriken.createAndAddChildCollider({
      shape: ColliderShape.BALL,
      radius: 1.0,
      isSensor: true,
      collisionGroups: {
        belongsTo: [CollisionGroup.ENTITY],
        collidesWith: [CollisionGroup.PLAYER, CollisionGroup.ENTITY],
      },
      onCollision: (otherEntity: Entity | BlockType, started: boolean) => {
        if (!started || otherEntity === playerEntity || !(otherEntity instanceof SoccerPlayerEntity)) return;

        if (otherEntity.isDodging) {
          console.log(`🥷 SHURIKEN DODGED: ${otherEntity.player.username} dodged the shuriken!`);
          return;
        }

        otherEntity.stunPlayer();
        console.log(`🥷 SHURIKEN HIT: ${otherEntity.player.username} stunned!`);

        if (shuriken.isSpawned) {
          shuriken.despawn();
        }
      }
    });

    // Despawn after lifetime
    let shurikenAge = 0;
    const lifetime = 1.5;

    shuriken.on(EntityEvent.TICK, ({ entity, tickDeltaMs }) => {
      shurikenAge += tickDeltaMs / 1000;

      if (shurikenAge >= lifetime && shuriken.isSpawned) {
        shuriken.despawn();
      }
    });
  }

  /**
   * Create power-up effect
   */
  createPowerUpEffect(position: Vector3Like, effectType: string): void {
    console.log(`✨ Creating power-up effect: ${effectType}`);

    const effectScales: Record<string, number> = {
      'freeze_blast': 8.0,
      'fireball': 5.0,
      'mega_kick': 4.0,
      'stamina': 3.5,
      'speed_boost': 3.0
    };

    const effectScale = effectScales[effectType] || 3.0;

    const mainEffect = new Entity({
      name: `powerup-effect-${effectType}`,
      modelUri: 'models/misc/selection-indicator.gltf',
      modelScale: effectScale,
      rigidBodyOptions: {
        type: RigidBodyType.KINEMATIC_POSITION,
      },
    });

    mainEffect.spawn(this.world, {
      x: position.x,
      y: position.y + 1.5,
      z: position.z
    });

    setTimeout(() => {
      if (mainEffect.isSpawned) {
        mainEffect.despawn();
      }
    }, 2000);
  }

  /**
   * Create charging effect
   */
  createChargingEffect(player: SoccerPlayerEntity, powerUpType: string): void {
    this.audioEffects.playChargingSound(player, powerUpType);

    // Create expanding ring effect
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const ring = new Entity({
          name: 'charge-ring',
          modelUri: 'models/misc/selection-indicator.gltf',
          modelScale: 0.5 + (i * 0.5),
          rigidBodyOptions: {
            type: RigidBodyType.KINEMATIC_POSITION,
          }
        });

        ring.spawn(this.world, {
          x: player.position.x,
          y: player.position.y + 0.1,
          z: player.position.z
        });

        setTimeout(() => {
          if (ring.isSpawned) {
            ring.despawn();
          }
        }, 1000);
      }, i * 200);
    }
  }

  /**
   * Calculate direction from quaternion rotation
   */
  private calculateDirectionFromRotation(rotation: { x: number, y: number, z: number, w: number }): { x: number, z: number } {
    const { x, y, z, w } = rotation;

    const forwardX = 2 * (x * z + w * y);
    const forwardZ = 2 * (y * z - w * x);

    const magnitude = Math.sqrt(forwardX * forwardX + forwardZ * forwardZ);

    if (magnitude > 0.001) {
      return {
        x: forwardX / magnitude,
        z: forwardZ / magnitude
      };
    }

    const fallbackAngle = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
    return { x: Math.sin(fallbackAngle), z: -Math.cos(fallbackAngle) };
  }

  /**
   * Calculate knockback direction
   */
  private calculateKnockbackDirection(impactPos: { x: number, z: number }, targetPos: { x: number, z: number }): { x: number, z: number } {
    const directionX = targetPos.x - impactPos.x;
    const directionZ = targetPos.z - impactPos.z;

    const magnitude = Math.sqrt(directionX * directionX + directionZ * directionZ);

    if (magnitude > 0) {
      return {
        x: directionX / magnitude,
        z: directionZ / magnitude
      };
    }

    return { x: 1, z: 0 };
  }
}
