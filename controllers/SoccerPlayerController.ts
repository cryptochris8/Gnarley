import {
  Audio,
  CoefficientCombineRule,
  ColliderShape,
  Entity,
  CollisionGroup,
  type BlockType,
  PlayerEntity,
  type PlayerInput,
  type PlayerCameraOrientation,
  BaseEntityController,
  SceneUI,
  World,
  type Vector3Like,
  BaseEntityControllerEvent,
  EntityModelAnimationLoopMode,
} from "hytopia";
import sharedState from "../state/sharedState";
import {
  directionFromOrientation,
  getDirectionFromRotation,
} from "../utils/direction";
import { PASS_FORCE, BALL_SPAWN_POSITION as GLOBAL_BALL_SPAWN_POSITION, FIELD_MIN_X, FIELD_MAX_X, FIELD_MIN_Z, FIELD_MAX_Z, FIELD_MIN_Y, FIELD_MAX_Y, AI_GOAL_LINE_X_RED, AI_GOAL_LINE_X_BLUE } from "../state/gameConfig";
import SoccerPlayerEntity from "../entities/SoccerPlayerEntity";
// Note: AIPlayerEntity not imported directly to avoid circular dependency
// Use duck typing to check for notifyIncomingPass method instead
import { isArcadeMode, getCurrentModeConfig } from "../state/gameModes";
import { getArcadePlayerSpeed } from "../state/arcadeEnhancements";
import { SafeAbilityWrapper } from "../abilities/SafeAbilityWrapper";

/** Options for creating a CustomSoccerPlayer instance. @public */
export interface PlayerEntityControllerOptions {
  /** A function allowing custom logic to determine if the entity can jump. */
  canJump?: () => boolean;

  /** A function allowing custom logic to determine if the entity can walk. */
  canWalk?: () => boolean;

  /** A function allowing custom logic to determine if the entity can run. */
  canRun?: () => boolean;

  /** The upward velocity applied to the entity when it jumps. */
  jumpVelocity?: number;

  /** The normalized horizontal velocity applied to the entity when it runs. */
  runVelocity?: number;

  /** Whether the entity sticks to platforms, defaults to true. */
  sticksToPlatforms?: boolean;

  /** The normalized horizontal velocity applied to the entity when it walks. */
  walkVelocity?: number;
}

// All looped animation names used by the controller.
// Used to explicitly stop animations since entity.modelLoopedAnimations was removed in SDK 0.15.1.
const ALL_LOOPED_ANIMATIONS = [
  "idle_upper", "idle_lower",
  "walk_upper", "walk_lower",
  "run_upper", "run_lower",
  "wind_up", "dizzy",
];

// Constants for player movement and actions
const SHOT_FORCE = 8;
const TACKLE_FORCE = 12;
const TACKLE_DURATION = 600;

// Add constants for ball reset
const BALL_VELOCITY_THRESHOLD = 0.15; // Minimum velocity to consider ball moving (slightly raised for quicker detection)
const BALL_STUCK_CHECK_INTERVAL = 1000; // Check every 1 second for faster detection
const BALL_STUCK_TIME_THRESHOLD = 2000; // Consider ball stuck after 2 seconds

// Add constants for goalkeeper header mechanics
const GOALKEEPER_HEADER_RANGE = 3.5; // Range for goalkeeper headers
const GOALKEEPER_HEADER_FORCE = 15; // Force applied during headers
const HIGH_BALL_THRESHOLD = 2.0; // Height threshold for considering ball "high"
const GOALKEEPER_JUMP_BOOST = 2.0; // Extra jump velocity for goalkeepers going for headers

export default class CustomSoccerPlayer extends BaseEntityController {
  /**
   * A function allowing custom logic to determine if the entity can walk.
   * @param playerEntityController - The entity controller instance.
   * @returns Whether the entity of the entity controller can walk.
   */
  public canWalk: (playerEntityController: CustomSoccerPlayer) => boolean =
    () => true;

  /**
   * A function allowing custom logic to determine if the entity can run.
   * @param playerEntityController - The entity controller instance.
   * @returns Whether the entity of the entity controller can run.
   */
  public canRun: (playerEntityController: CustomSoccerPlayer) => boolean =
    () => true;

  /**
   * A function allowing custom logic to determine if the entity can jump.
   * @param playerEntityController - The entity controller instance.
   * @returns Whether the entity of the entity controller can jump.
   */
  public canJump: (playerEntityController: CustomSoccerPlayer) => boolean =
    () => true;

  /** The upward velocity applied to the entity when it jumps. */
  public jumpVelocity: number = 10;

  /** The normalized horizontal velocity applied to the entity when it runs. */
  public runVelocity: number = 8;

  /** Whether the entity sticks to platforms. */
  public sticksToPlatforms: boolean = true;

  /** The normalized horizontal velocity applied to the entity when it walks. */
  public walkVelocity: number = 4;

  /** @internal */
  private _stepAudio: Audio | undefined;

  /** @internal */
  private _groundContactCount: number = 0
  
  /** @internal */
  private _lastHeaderTime: number = 0;

  /** @internal */
  private _platform: Entity | undefined;

  /** @internal */
  private _stunTimeout?: Timer;

  /** @internal */
  private static _tackleCooldownMap = new Map<string, number>();

  /** @internal */
  private static _axeThrowCooldownMap = new Map<string, number>();

  /** @internal */
  private _holdingQ: number | null = null;

  /** @internal */
  private _lastMoveDirection: { x: number; z: number } = { x: 0, z: 0 };

  /** @internal */
  private _powerBarUI?: SceneUI;

  /** @internal */
  private _chargeInterval: Timer | null = null;

  /** @internal */
  private _chargeStartTime: number | null = null;

  // Add properties to track ball state
  private static _lastBallPosition?: Vector3Like;
  private static _lastBallCheckTime = 0;
  private static _ballStuckStartTime = 0;
  private static _ballStuckCheckInterval: Timer | null = null;

  /** @internal */
  private _lastRotationUpdateTime: number | null = null;

  /** @internal */
  private _lastCameraRotationTime: number | null = null;

  /** @internal */
  private _lastBounceTime: number | null = null;

  // Power-up cooldown tracking
  private _lastPowerUpTime: number = 0;
  private static readonly POWER_UP_COOLDOWN_MS = 3000; // 3 second cooldown between power-ups

  /**
   * @param options - Options for the controller.
   */
  public constructor(options: PlayerEntityControllerOptions = {}) {
    super();

    this.jumpVelocity = options.jumpVelocity ?? this.jumpVelocity;
    this.runVelocity = options.runVelocity ?? this.runVelocity;
    this.walkVelocity = options.walkVelocity ?? this.walkVelocity;
    this.canWalk = options.canWalk ?? this.canWalk;
    this.canRun = options.canRun ?? this.canRun;
    this.canJump = options.canJump ?? this.canJump;
    this.sticksToPlatforms =
      options.sticksToPlatforms ?? this.sticksToPlatforms;
  }

  /** Whether the entity is grounded. */
  public get isGrounded(): boolean {
    return this._groundContactCount > 0;
  }

  /** Whether the entity is on a platform, a platform is any entity with a kinematic rigid body. */
  public get isOnPlatform(): boolean {
    return !!this._platform;
  }

  /** The platform the entity is on, if any. */
  public get platform(): Entity | undefined {
    return this._platform;
  }

  /**
   * Called when the controller is attached to an entity.
   * @param entity - The entity to attach the controller to.
   */
  public attach(entity: Entity) {
    this._stepAudio = new Audio({
      uri: "audio/sfx/step/grass/grass-step-02.mp3",
      loop: true,
      volume: 0.1,
      attachedToEntity: entity,
    });

    entity.lockAllRotations(); // prevent physics from applying rotation to the entity, we can still explicitly set it.
    
    // Create power bar UI with error handling to prevent player freezing
    try {
      this._powerBarUI = new SceneUI({
        templateId: "power-bar",
        attachedToEntity: entity,
        state: { percentage: 0 },
        offset: { x: 0, y: 1.05, z: 0 },
      });
    } catch (error) {
      console.error("Failed to create power-bar SceneUI:", error);
      // console.log("Game will continue without power-bar display");
      this._powerBarUI = undefined;
    }
  }

  /**
   * Called when the controlled entity is spawned.
   * In PlayerEntityController, this function is used to create
   * the colliders for the entity for wall and ground detection.
   * @param entity - The entity that is spawned.
   */
  public spawn(entity: Entity) {
    if (!entity.isSpawned) {
      throw new Error(
        "PlayerEntityController.createColliders(): Entity is not spawned!"
      );
    }

    // Ground sensor
    entity.createAndAddChildCollider({
      shape: ColliderShape.CYLINDER,
      radius: 0.23,
      halfHeight: 0.125,
      collisionGroups: {
        belongsTo: [CollisionGroup.ENTITY_SENSOR],
        collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
      },
      isSensor: true,
      relativePosition: { x: 0, y: -0.75, z: 0 },
      tag: "groundSensor",
      onCollision: (_other: BlockType | Entity, started: boolean) => {
        // Ground contact
        this._groundContactCount += started ? 1 : -1;

        // Ensure entity is still valid and spawned before attempting animation
        if (!entity || !entity.isSpawned) {
          // console.warn("GroundSensor onCollision: Entity no longer spawned, skipping animation.");
          return;
        }

        if (!this._groundContactCount) {
          const jumpAnim = entity.getModelAnimation("jump_loop");
          if (jumpAnim) {
            jumpAnim.setLoopMode(EntityModelAnimationLoopMode.ONCE);
            jumpAnim.restart();
          }
        } else {
          entity.stopModelAnimations(["jump_loop"]);
        }

        // Platform contact
        if (!(_other instanceof Entity) || !_other.isKinematic) return;

        if (started && this.sticksToPlatforms) {
          this._platform = _other;
        } else if (_other === this._platform && !started) {
          this._platform = undefined;
        }
      },
    });

    // Wall collider
    entity.createAndAddChildCollider({
      shape: ColliderShape.CAPSULE,
      halfHeight: 0.31,
      radius: 0.38,
      collisionGroups: {
        belongsTo: [CollisionGroup.ENTITY_SENSOR],
        collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
      },
      friction: 0,
      frictionCombineRule: CoefficientCombineRule.Min,
      tag: "wallCollider",
    });

    // Start ball stuck detection when first entity spawns
    if (!CustomSoccerPlayer._ballStuckCheckInterval) {
      CustomSoccerPlayer._ballStuckCheckInterval = setInterval(() => {
        this.checkForStuckBall(entity.world as World, entity);
      }, BALL_STUCK_CHECK_INTERVAL);
    }
  }

  /**
   * Ticks the player movement for the entity controller,
   * overriding the default implementation.
   *
   * @param entity - The entity to tick.
   * @param input - The current input state of the player.
   * @param cameraOrientation - The current camera orientation state of the player.
   * @param deltaTimeMs - The delta time in milliseconds since the last tick.
   */
  public tickWithPlayerInput(
    entity: PlayerEntity,
    input: PlayerInput,
    cameraOrientation: PlayerCameraOrientation,
    deltaTimeMs: number
  ) {
    // Safety check
    if (!entity.isSpawned || (entity instanceof SoccerPlayerEntity && entity.isPlayerFrozen)) {
      // Clear any charging state if player is not properly spawned or frozen
      if (this._holdingQ !== null) {
        this._clearPowerChargeIfNeeded(entity);
      }
      return;
    }

    // Get the correct shared state for this entity (room or global)
    const entityState = (entity as any).getSharedState ? (entity as any).getSharedState() : sharedState;

    // Check for charging state when ball possession is lost
    const soccerBall = entityState.getSoccerBall();
    const hasBall = entityState.getAttachedPlayer() === entity;
    
    // **CRITICAL FIX**: Clear charging state if player no longer has ball
    if (this._holdingQ !== null && !hasBall) {
      // console.log(`🔧 SHOT METER FIX: Clearing charging state for ${entity.player?.username || 'unknown'} - lost ball possession`);
      this._clearPowerChargeIfNeeded(entity);
      
      // Stop wind-up animation if it's playing
      if (entity.getModelAnimation("wind_up")?.isPlaying) {
        entity.stopModelAnimations(["wind_up"]);
      }
    }

    try {
      // Early return if entity or world is invalid
      if (!entity?.isSpawned || !entity.world) {
        // console.log("❌ Controller: Entity not spawned or no world");
        return;
      }

      // Ensure input and cameraOrientation are valid before proceeding
      if (!input) {
        // Silent return - this can happen during initialization
        return;
      }
      if (!cameraOrientation) {
        // Silent return - this can happen during initialization
        return;
      }

      if (!(entity instanceof SoccerPlayerEntity)) {
        // console.log("❌ Controller: Entity is not SoccerPlayerEntity");
        return;
      }

      // Get ball reference from entity's state (room or global)
      const soccerBall = entityState.getSoccerBall();

      if (!soccerBall?.isSpawned || !soccerBall.world) {
        // Silent return - ball may not be ready yet
        return;
      }

      // Get game state to check for halftime
      const gameState = entityState.getGameState();
      const isHalftime = gameState?.isHalftime || false;

      // If stunned, frozen, or during halftime, ignore movement input
      const isStunned = entity.isStunned;
      const isTackling = entity.isTackling;
      const isFrozen = entity.isPlayerFrozen;

      if (isStunned || isFrozen || isHalftime) {
        input = {
          ...input,
          w: false,
          a: false,
          s: false,
          d: false,
          sp: false,
          ml: false,
          mr: false,
        };
      }

      // Check attached player state
      const attachedPlayer = entityState.getAttachedPlayer();
      const hasBall = attachedPlayer?.player?.username === entity.player?.username;

      const { w, a, s, d, sp, ml, q, sh, mr, e } = input;
      const { yaw } = cameraOrientation;
      const currentVelocity = { ...entity.linearVelocity }; // Clone velocity
      const targetVelocities = { x: 0, y: 0, z: 0 }; // Initialize target velocities
      const isRunning = sh;
      const isDodging = entity.isDodging;

      // Temporary, animations
      if (
        this.isGrounded &&
        (w || a || s || d) &&
        !isTackling &&
        !this._holdingQ &&
        !isDodging
      ) {
        if (isRunning) {
          const runAnimations = ["run_upper", "run_lower"];
          entity.stopModelAnimations(
            ALL_LOOPED_ANIMATIONS.filter(
              (v) => !runAnimations.includes(v)
            )
          );
          entity.startModelLoopedAnimations(runAnimations);
          this._stepAudio?.setPlaybackRate(0.81);
        } else {
          const walkAnimations = ["walk_upper", "walk_lower"];
          entity.stopModelAnimations(
            ALL_LOOPED_ANIMATIONS.filter(
              (v) => !walkAnimations.includes(v)
            )
          );

          entity.startModelLoopedAnimations(walkAnimations);
          this._stepAudio?.setPlaybackRate(0.55);
        }

        this._stepAudio?.play(entity.world as World, !this._stepAudio?.isPlaying);
      } else {
        this._stepAudio?.pause();
        const idleAnimations = ["idle_upper", "idle_lower"];
        entity.stopModelAnimations(
          ALL_LOOPED_ANIMATIONS.filter(
            (v) => !idleAnimations.includes(v)
          )
        );
        entity.startModelLoopedAnimations(idleAnimations);
      }

      // Handle shooting with Right Mouse Button (mr)
      if (mr && hasBall && this._holdingQ == null) {
        this._chargeStartTime = Date.now();
        this._holdingQ = Date.now();
        entity.startModelLoopedAnimations(["wind_up"]);
        if (this._powerBarUI) {
          this._powerBarUI.load(entity.world as World);
          this._powerBarUI.setState({
            isCharging: true,
            startTime: this._chargeStartTime,
            percentage: 0,
          });

          this.clearChargeInterval();
          this._chargeInterval = setInterval(() => {
            if (!this._chargeStartTime) {
               this.clearChargeInterval();
               return;
            }
            const elapsed = Date.now() - this._chargeStartTime;
            const percentage = Math.min((elapsed / 1500) * 100, 100);

            // **SHOT METER FIX**: Add failsafe timeout after 3 seconds
            if (elapsed > 3000) {
              // console.log(`🔧 SHOT METER FAILSAFE: Auto-clearing stuck charging state after 3s for ${entity.player?.username || 'unknown'}`);
              this._clearPowerChargeIfNeeded(entity);
              return;
            }

            this._powerBarUI?.setState({
               isCharging: true,
               startTime: this._chargeStartTime, 
               percentage: percentage,
            });
          }, 16);
        }
      } else if (!mr && this._holdingQ != null && hasBall) {
        const chargeDuration = Date.now() - this._holdingQ;
        // Calculate power: Base 1.5, scales up to 5 based on charge duration (max 1.5s)
        const basePower = 1.5;
        const maxChargePower = 3.5;
        const powerScale = Math.min(1500, chargeDuration) / 1500; // 0 to 1 based on charge time up to 1.5s
        let totalPower = basePower + (maxChargePower * powerScale);
        
        // Apply mega kick enhancement if active (only in arcade mode)
        if (entity instanceof SoccerPlayerEntity) {
          // Get enhancement manager from shared state or game state
          if (isArcadeMode()) {
            // Try to get arcade enhancement manager
            const arcadeManager = (entity.world as any)._arcadeManager;
                                      if (arcadeManager && arcadeManager.hasMegaKick && arcadeManager.hasMegaKick(entity.player.username)) {
               totalPower *= 2.0; // Double the total power for mega kick
               arcadeManager.consumeMegaKick(entity.player.username);
               // console.log(`⚽ MEGA KICK: ${entity.player.username} used mega kick enhancement!`);
              
              // Play special mega kick sound
              new Audio({
                uri: "audio/sfx/ui/inventory-grab-item.mp3",
                loop: false,
                volume: 1.0,
                attachedToEntity: entity,
              }).play(entity.world as World);
            }
          }
        }

        // console.log("Charge Duration:", chargeDuration, "Power:", totalPower);
        entityState.setAttachedPlayer(null);
        const direction = directionFromOrientation(entity, cameraOrientation);
        
        // Apply impulse based on calculated totalPower
        soccerBall?.applyImpulse({
          x: direction.x * totalPower,       // Apply full power horizontally
          y: Math.min(3.0, totalPower * 0.4), // Apply vertical power, capped to allow lobs/chips
          z: direction.z * totalPower,       // Apply full power horizontally
        });
        // Reset angular velocity to prevent unwanted spinning/backwards movement
        soccerBall?.setAngularVelocity({ x: 0, y: 0, z: 0 });
        
        entity.stopModelAnimations(["wind_up"]);
        entity.startModelOneshotAnimations(["kick"]); // Use oneshot kick animation
        new Audio({
          uri: "audio/sfx/soccer/kick.mp3",
          loop: false,
          volume: 1,
          attachedToEntity: entity,
        }).play(entity.world as World);

        this.clearChargeInterval();
        this._powerBarUI?.unload();

        this._holdingQ = null;
        this._chargeStartTime = null;
      }

      // Handle collected ability activation with F key (pickup mode only)
      // Note: Removed !hasBall restriction to allow ability use while holding ball
      if (input["f"] && entity.abilityHolder.hasAbility()) {
        const ability = entity.abilityHolder.getAbility();
        // console.log(`🎮 F key pressed by ${entity.player?.username || 'unknown'} - activating ability: ${ability?.getIcon() || 'unknown'}`);
        // console.log(`🔍 Ability details: type=${ability?.constructor.name}, has use method=${typeof ability?.use === 'function'}`);
        const worldArcadeManager = (entity.world as any)?._arcadeManager;
        // console.log(`🔍 Global isArcadeMode()=${isArcadeMode()}, World has _arcadeManager=${!!worldArcadeManager}, roomArcadeMode=${worldArcadeManager?.isRoomArcadeMode ?? 'N/A'}`);
        // console.log(`🔍 Player has ball: ${hasBall} (ability activation now allowed regardless)`);
        // console.log(`🔍 Player position: ${JSON.stringify(entity.position)}`);
        // console.log(`🔍 Camera direction: ${entity.player?.camera?.facingDirection ? JSON.stringify(entity.player.camera.facingDirection) : 'null'}`);
        
        // Use the collected ability (from pickup system)
        // SAFETY CHECK: Ensure camera and facingDirection exist
        if (!entity.player?.camera?.facingDirection) {
          console.error(`❌ Camera facing direction not available for ${entity.player?.username || 'unknown'}`);
          input["f"] = false;
          return;
        }
        
        const direction = {x: entity.player.camera.facingDirection.x, y: entity.player.camera.facingDirection.y + 0.1, z: entity.player.camera.facingDirection.z};
        
        // Use the SafeAbilityWrapper for crash protection
        const success = SafeAbilityWrapper.safeExecute(
          ability,
          entity.position,
          direction,
          entity
        );
        
        if (success) {
          // console.log(`✅ Ability used successfully by ${entity.player?.username || 'unknown'}`);
        } else {
          console.error(`❌ Ability execution failed for ${entity.player?.username || 'unknown'}`);
        }
        
        // Cancel the input to prevent any conflicts
        input["f"] = false;
        return; // Exit early to prevent other systems from activating
      }

      // Handle F key when no ability is available (request AI teammate to pass)
      if (input["f"]) {
        if (!entity.abilityHolder.hasAbility()) {
          // Only request pass if player doesn't have ball
          if (!hasBall) {
            // Check cooldown to prevent spam
            const currentTime = Date.now();
            if (currentTime - this._lastPowerUpTime >= CustomSoccerPlayer.POWER_UP_COOLDOWN_MS) {
              this._lastPowerUpTime = currentTime;

              // Directly execute pass request on server (controller already runs server-side)
              this._requestPassFromTeammate(entity, entityState);

              input["f"] = false;
            } else {
              input["f"] = false;
            }
          } else {
            input["f"] = false;
          }
        } else {
          input["f"] = false;
        }
      }

      // Handle passing with E - IMPROVED TARGETING SYSTEM
      if (ml) {
        if (hasBall && !this._holdingQ) {
          entityState.setAttachedPlayer(null);
          
          // Find the best teammate to pass to based on camera direction and positioning
          const bestTarget = this._findBestPassTarget(entity, cameraOrientation);
          
          if (bestTarget) {
            // Calculate optimal pass with leading and power adjustment
            const passResult = this._executeTargetedPass(entity, bestTarget, soccerBall);
            
            if (passResult.success) {
              // console.log(`✅ HUMAN PASS: ${entity.player.username} passed to ${bestTarget.player.username} at distance ${passResult.distance.toFixed(1)}`);
            } else {
              console.warn(`❌ HUMAN PASS FAILED: Could not complete pass to ${bestTarget.player.username}`);
            }
          } else {
            // Fallback to directional pass if no good target found
            // console.log(`⚠️ HUMAN PASS: No good target found, using directional pass`);
            this._executeDirectionalPass(entity, cameraOrientation, soccerBall);
          }
          
          // Play kick animation and sound
          entity.startModelOneshotAnimations(["kick"]);
          new Audio({
            uri: "audio/sfx/soccer/kick.mp3",
            loop: false,
            volume: 0.8,
            attachedToEntity: entity,
          }).play(entity.world as World);
        }
      }

      // Calculate target horizontal velocities (run/walk)
      if (
        ((isRunning && this.canRun(this)) ||
          (!isRunning && this.canWalk(this))) &&
        !isTackling &&
        !this._holdingQ
      ) {
        let velocity = isRunning ? this.runVelocity : this.walkVelocity;
        
        // Apply additive speed boosts (power-ups, abilities)
        velocity += entity.getSpeedAmplifier();
        
        // Apply game mode speed enhancements
        const currentModeConfig = getCurrentModeConfig();
        const baseSpeedMultiplier = isRunning ? (currentModeConfig as any).sprintMultiplier ?? 1.0 : (currentModeConfig as any).playerSpeed ?? 1.0;
        velocity *= baseSpeedMultiplier;

        // Apply time slow effects (enhanced power-up)
        if (isArcadeMode() && entity instanceof SoccerPlayerEntity) {
          const customProps = (entity as any).customProperties;
          if (customProps && customProps.get('hasTimeSlowEffect')) {
            const timeSlowScale = customProps.get('timeSlowScale') || 1.0;
            const endTime = customProps.get('timeSlowEndTime') || 0;
            
            if (Date.now() < endTime) {
              velocity *= timeSlowScale; // Reduce speed for time slow effect
              
              // Log occasionally for debugging
              if (Math.random() < 0.002) {
                // console.log(`⏰ TIME SLOW: ${entity.player.username} - Speed reduced to ${(timeSlowScale * 100).toFixed(0)}%`);
              }
            }
          }
        }
        
        // Apply arcade-specific speed enhancements if in arcade mode
        if (isArcadeMode()) {
          // Get arcade enhancement manager from the world
          const arcadeManager = (entity.world as any)._arcadeManager;
          const enhancedVelocity = getArcadePlayerSpeed(velocity, entity.player.username, arcadeManager);
          velocity = enhancedVelocity;
          
          // Log speed enhancement for debugging
          if (Math.random() < 0.001) { // Very occasional logging
            // console.log(`🏃 ARCADE SPEED: ${entity.player.username} - Base: ${(isRunning ? this.runVelocity : this.walkVelocity).toFixed(1)}, Enhanced: ${velocity.toFixed(1)}`);
          }
        }
        
        // Apply stamina-based speed penalty (multiplicative)
        const staminaMultiplier = entity.getStaminaSpeedMultiplier();
        velocity *= staminaMultiplier;
        
        // Log stamina effect for debugging (occasionally)
        if (Math.random() < 0.002 && staminaMultiplier < 1.0) { // Only log when stamina is affecting speed
          // console.log(`💨 STAMINA: ${entity.player.username} - Stamina: ${entity.getStaminaPercentage().toFixed(0)}%, Speed: ${(staminaMultiplier * 100).toFixed(0)}%`);
        }
        
        if (w) {
          targetVelocities.x -= velocity * Math.sin(yaw);
          targetVelocities.z -= velocity * Math.cos(yaw);
        }

        if (s) {
          targetVelocities.x += velocity * Math.sin(yaw);
          targetVelocities.z += velocity * Math.cos(yaw);
        }

        if (a) {
          targetVelocities.x -= velocity * Math.cos(yaw);
          targetVelocities.z += velocity * Math.sin(yaw);
        }

        if (d) {
          targetVelocities.x += velocity * Math.cos(yaw);
          targetVelocities.z -= velocity * Math.sin(yaw);
        }

        // Normalize for diagonals
        const length = Math.sqrt(
          targetVelocities.x * targetVelocities.x +
            targetVelocities.z * targetVelocities.z
        );
        if (length > velocity) {
          const factor = velocity / length;
          targetVelocities.x *= factor;
          targetVelocities.z *= factor;
        }
      }

      // --- Apply Movement Impulse ---
      const mass = entity.mass || 1.0; // Use entity's mass, default to 1.0 if not set
      const timeDeltaSeconds = deltaTimeMs / 1000; // Convert milliseconds to seconds

      // Calculate the velocity error
      const velocityErrorX = targetVelocities.x - currentVelocity.x;
      const velocityErrorZ = targetVelocities.z - currentVelocity.z;

      // Apply additional dampening when player is not receiving input
      // This helps prevent oscillations and unstable physics
      if (!(w || a || s || d)) {
        const dampingFactor = 0.98; // Increased damping for more stability
        const currentSpeed = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z);
        
        if (currentSpeed > 0.05) { // Lower threshold for applying damping
          const additionalDampingImpulseX = -currentVelocity.x * mass * dampingFactor;
          const additionalDampingImpulseZ = -currentVelocity.z * mass * dampingFactor;
          
          entity.applyImpulse({
            x: additionalDampingImpulseX,
            y: 0,
            z: additionalDampingImpulseZ
          });
        } else {
          // If almost stationary, completely zero out horizontal velocity
          entity.setLinearVelocity({
            x: 0,
            y: entity.linearVelocity.y,
            z: 0
          });
        }
      }

      // Calculate the required impulse using a proportional control (simplified)
      const K_p = 60; // Reduced proportional gain for smoother movement
      
      // Limit the maximum velocity error to prevent extreme impulses
      const maxVelocityError = 15;
      const limitedVelocityErrorX = Math.max(-maxVelocityError, Math.min(maxVelocityError, velocityErrorX));
      const limitedVelocityErrorZ = Math.max(-maxVelocityError, Math.min(maxVelocityError, velocityErrorZ));
      
      const impulseX = mass * limitedVelocityErrorX * K_p * timeDeltaSeconds;
      const impulseZ = mass * limitedVelocityErrorZ * K_p * timeDeltaSeconds;

      // Apply the scaled impulse
      entity.applyImpulse({
          x: impulseX, 
          y: 0, // Do not apply impulse vertically for horizontal movement
          z: impulseZ 
      });

      // Debug logging for physics-related issues (disabled for cleaner console)
      // if (Math.random() < 0.01) {
      //   console.log(`Player ${entity.player?.username || 'unknown'} physics: ...`);
      // }

      // Limit maximum velocity to prevent physics instability
      const currentVelSqr = 
        entity.linearVelocity.x * entity.linearVelocity.x + 
        entity.linearVelocity.z * entity.linearVelocity.z;
      const maxVelocity = 20; // Set a reasonable maximum velocity
      const maxVelocitySqr = maxVelocity * maxVelocity;
      
      if (currentVelSqr > maxVelocitySqr) {
        const scale = maxVelocity / Math.sqrt(currentVelSqr);
        entity.setLinearVelocity({
          x: entity.linearVelocity.x * scale,
          y: entity.linearVelocity.y, // Preserve vertical velocity
          z: entity.linearVelocity.z * scale
        });
        // console.log(`Player ${entity.player?.username || 'unknown'} velocity limited to prevent instability`);
      }

      // Enhanced jump mechanics with goalkeeper header support
      if (sp && this.canJump(this) && !this._holdingQ) {
        const isGoalkeeper = (entity as any).aiRole === 'goalkeeper' || 
                            (entity as any).role === 'goalkeeper';
        
        // Check for goalkeeper header opportunity
        if (isGoalkeeper && !hasBall) {
          const ball = soccerBall; // Use already-fetched ball from entityState
          if (ball) {
            const ballPosition = ball.position;
            const playerPosition = entity.position;
            const distanceToBall = Math.sqrt(
              Math.pow(ballPosition.x - playerPosition.x, 2) + 
              Math.pow(ballPosition.z - playerPosition.z, 2)
            );
            
            // Check if ball is high enough and within header range
            const ballHeight = ballPosition.y - playerPosition.y;
            const isHighBall = ballHeight > HIGH_BALL_THRESHOLD && ballHeight < 4.0;
            const isInHeaderRange = distanceToBall <= GOALKEEPER_HEADER_RANGE;
            
            if (isHighBall && isInHeaderRange) {
              // Goalkeeper header jump - enhanced jump with directional component
              if (this.isGrounded && currentVelocity.y > -0.001 && currentVelocity.y <= 3) {
                // Calculate direction toward ball for header jump
                const directionToBall = {
                  x: (ballPosition.x - playerPosition.x) / distanceToBall,
                  z: (ballPosition.z - playerPosition.z) / distanceToBall
                };
                
                // Enhanced jump velocity for goalkeepers
                const headerJumpVelocity = this.jumpVelocity + GOALKEEPER_JUMP_BOOST;
                targetVelocities.y = headerJumpVelocity;
                
                // Apply directional impulse toward ball
                const jumpImpulseY = headerJumpVelocity * mass;
                const horizontalHeaderForce = 3.0 * mass; // Horizontal movement toward ball
                
                entity.applyImpulse({ 
                  x: directionToBall.x * horizontalHeaderForce, 
                  y: jumpImpulseY, 
                  z: directionToBall.z * horizontalHeaderForce 
                });
                
                // Play header animation if available
                entity.startModelOneshotAnimations(["kick"]); // Use kick animation for header
                
                // Check for immediate header contact if very close
                if (distanceToBall <= 1.5 && ballHeight < 3.0) {
                  this.performGoalkeeperHeader(entity, ball, directionToBall);
                }
              }
            } else {
              // Normal jump for goalkeepers when not going for headers
              if (this.isGrounded && currentVelocity.y > -0.001 && currentVelocity.y <= 3) {
                targetVelocities.y = this.jumpVelocity;
                const jumpImpulseY = this.jumpVelocity * mass;
                entity.applyImpulse({ x: 0, y: jumpImpulseY, z: 0 });
              }
            }
          } else {
            // Normal jump when no ball present
            if (this.isGrounded && currentVelocity.y > -0.001 && currentVelocity.y <= 3) {
              targetVelocities.y = this.jumpVelocity;
              const jumpImpulseY = this.jumpVelocity * mass;
              entity.applyImpulse({ x: 0, y: jumpImpulseY, z: 0 });
            }
          }
        } else if (!hasBall) {
          // Normal jump for non-goalkeepers
          if (this.isGrounded && currentVelocity.y > -0.001 && currentVelocity.y <= 3) {
            targetVelocities.y = this.jumpVelocity;
            const jumpImpulseY = this.jumpVelocity * mass;
            entity.applyImpulse({ x: 0, y: jumpImpulseY, z: 0 });
          }
        }
      }

      // Update last move direction based on target horizontal velocities
      if (w || a || s || d) {
        const moveDirectionLength = Math.sqrt(
          targetVelocities.x * targetVelocities.x +
          targetVelocities.z * targetVelocities.z
        );
        if (moveDirectionLength > 0) {
          this._lastMoveDirection = {
            x: targetVelocities.x / moveDirectionLength,
            z: targetVelocities.z / moveDirectionLength,
          };
        }
      }

      // Apply rotation based on movement direction
      if (this._lastMoveDirection.x !== 0 || this._lastMoveDirection.z !== 0) {
          const targetYaw = Math.atan2(this._lastMoveDirection.x, this._lastMoveDirection.z);
          // Corrected 180-degree offset due to model's intrinsic orientation
          const correctedYaw = targetYaw + Math.PI;
          const halfYaw = correctedYaw / 2;
          
          // Throttle rotation updates to reduce physics strain
          const currentTime = Date.now();
          const rotationUpdateInterval = 100; // milliseconds between rotation updates
          
          if (!this._lastRotationUpdateTime || (currentTime - this._lastRotationUpdateTime) > rotationUpdateInterval) {
            entity.setRotation({
              x: 0,
              y: Math.sin(halfYaw),
              z: 0,
              w: Math.cos(halfYaw),
            });
            this._lastRotationUpdateTime = currentTime;
          }
      }

      // Handle tackle
      if (mr && !this._holdingQ && !hasBall) {
        const cooldownMap = CustomSoccerPlayer._tackleCooldownMap;

        if (cooldownMap.has(entity.player.username)) {
          const cooldown = cooldownMap.get(entity.player.username);
          if (cooldown && cooldown > Date.now()) {
            return;
          }
          cooldownMap.delete(entity.player.username);
        }

        // Original tackle logic when doesn't have ball
        cooldownMap.set(entity.player.username, Date.now() + 2000);
        const direction = getDirectionFromRotation(entity.rotation);

        entity.setLinearVelocity({
          x: 0,
          y: 0,
          z: 0,
        });

        entity.applyImpulse({
          x: direction.x * 8,
          y: 5,
          z: direction.z * 8,
        });

        entity.isTackling = true;
        entity.startModelOneshotAnimations(["tackle"]);
        new Audio({
          uri: "audio/sfx/soccer/tackle.mp3",
          loop: false,
          volume: 0.6,
          attachedToEntity: entity,
        }).play(entity.world as World);
        setTimeout(() => {
          entity.isTackling = false;
        }, 500);
      }

      if (sp && !this._holdingQ && hasBall) {
        // Dribble/dodge move when has ball
        const cooldownMap = CustomSoccerPlayer._tackleCooldownMap;

        if (cooldownMap.has(entity.player.username)) {
          const cooldown = cooldownMap.get(entity.player.username);
          if (cooldown && cooldown > Date.now()) {
            return;
          }
          cooldownMap.delete(entity.player.username);
        }
        cooldownMap.set(entity.player.username, Date.now() + 1000);

        // Get forward direction from camera orientation
        const forward = {
          x: -Math.sin(cameraOrientation.yaw),
          z: -Math.cos(cameraOrientation.yaw),
        };

        // Get right vector (perpendicular to forward)
        const right = {
          x: -forward.z,
          z: forward.x,
        };

        // Determine dodge direction based on last movement
        const side =
          this._lastMoveDirection.x * right.x +
            this._lastMoveDirection.z * right.z >
          0
            ? 1
            : -1;

        // Apply quick diagonal impulse (forward + side)
        entity.setLinearVelocity({
          x: 0,
          y: 0,
          z: 0,
        });

        entity.applyImpulse({
          x: forward.x * 8 + right.x * side * 10,
          y: 1,
          z: forward.z * 8 + right.z * side * 10,
        });

        // Play dodge animation
        // is player going right or left?
        const rotation = getDirectionFromRotation(entity.rotation);
        const isGoingRight = rotation.x * side > 0;
        entity.stopModelAnimations(
          ALL_LOOPED_ANIMATIONS.filter((v) => v !== "dizzy")
        );

        entity.startModelOneshotAnimations([
          isGoingRight ? "dodge_right" : "dodge_left",
        ]);
      }

      // --- Boundary Clamping Logic ---
      const currentPosition = entity.position;
      const clampedX = Math.max(FIELD_MIN_X, Math.min(FIELD_MAX_X, currentPosition.x));
      const clampedY = Math.max(FIELD_MIN_Y, Math.min(FIELD_MAX_Y, currentPosition.y)); // Clamp Y as well
      const clampedZ = Math.max(FIELD_MIN_Z, Math.min(FIELD_MAX_Z, currentPosition.z));

      // If the position was clamped, update the entity's position and potentially zero out velocity towards the boundary
      if (currentPosition.x !== clampedX || currentPosition.y !== clampedY || currentPosition.z !== clampedZ) {
        entity.setPosition({ x: clampedX, y: clampedY, z: clampedZ });
        // Optional: If hitting a boundary, nullify velocity in that direction to prevent sticking or continued force application
        let newVelocityX = entity.linearVelocity.x;
        let newVelocityY = entity.linearVelocity.y;
        let newVelocityZ = entity.linearVelocity.z;

        if (currentPosition.x !== clampedX) newVelocityX = 0;
        if (currentPosition.y !== clampedY) newVelocityY = 0; // Stop vertical movement if hitting Y boundary
        if (currentPosition.z !== clampedZ) newVelocityZ = 0;
        
        entity.setLinearVelocity({x: newVelocityX, y: newVelocityY, z: newVelocityZ});
        // console.log(`Player ${entity.player.username} clamped to boundaries.`);
      }
      // --- End of Boundary Clamping Logic ---

      if (entity instanceof SoccerPlayerEntity) {
        // ... existing code ...
      }
    } catch (error) {
      // console.log("Tick error:", error);
    }
  }

  private clearChargeInterval() {
    if (this._chargeInterval) {
      clearInterval(this._chargeInterval);
      this._chargeInterval = null;
    }
  }

  /**
   * Handles collision events for the entity.
   * @param entity The entity that collided.
   * @param other The entity or block that was collided with.
   */
  public onCollision(entity: PlayerEntity, other: Entity): void {
    // Check if entity is still spawned to prevent errors
    if (!entity.isSpawned) {
      return;
    }

    // Get the correct shared state for this entity (room or global)
    const entityState = (entity as any).getSharedState ? (entity as any).getSharedState() : sharedState;
    const soccerBall = entityState.getSoccerBall();
    try {
      // Check if both entities exist and are spawned
      if (!entity?.isSpawned || !other?.isSpawned || !entity.world || !other.world) {
       return;
     }

      if (!(entity instanceof SoccerPlayerEntity)) return;

      // Handle ball collision
      if (other.name === "SoccerBall") {
        // Only play animations if the entity is still spawned and valid
        try {
          // Re-check isSpawned immediately before animation call
          if (entity.isSpawned && entity.world) {
            entity.startModelOneshotAnimations(["kick"]);
            setTimeout(() => {
              try {
                // Re-check isSpawned immediately before animation call inside setTimeout
                if (entity.isSpawned && entity.world) {
                  entity.stopModelAnimations(["kick"]);
                }
              } catch (error) {
                // console.log("Animation stop error:", error);
              }
            }, 500);
          }
        } catch (error) {
          // console.log("Animation start error:", error);
        }
      }
    } catch (error) {
      // console.log("Collision handling error:", error);
    }
  }

  /**
   * Clean up power charge related state if needed
   * **ENHANCED**: Now properly resets all charging state to prevent freeze bugs
   */
  private _clearPowerChargeIfNeeded(player: PlayerEntity) {
    // console.log(`🔧 SHOT METER CLEANUP: Clearing all charging state for ${player.player?.username || 'unknown'}`);
    
    // Clear charge interval if it exists
    this.clearChargeInterval();
    
    // Clear any charge UI if it exists
    if (this._powerBarUI) {
      try {
        this._powerBarUI.setState({
          isCharging: false,
          startTime: null,
          percentage: 0,
        });
        this._powerBarUI.unload();
        this._powerBarUI = undefined;
      } catch (error) {
        // console.log("Error clearing power bar UI:", error);
      }
    }
    
    // **CRITICAL**: Reset all charging state variables
    this._holdingQ = null;
    this._chargeStartTime = null;
    
    // Stop wind-up animation if it's playing
    if (player instanceof SoccerPlayerEntity && player.getModelAnimation("wind_up")?.isPlaying) {
      try {
        player.stopModelAnimations(["wind_up"]);
        // console.log(`🔧 SHOT METER CLEANUP: Stopped wind_up animation for ${player.player?.username || 'unknown'}`);
      } catch (error) {
        // console.log("Error stopping wind_up animation:", error);
      }
    }
  }

  public detach(entity: Entity) {
    try {
      // console.log(`🧹 DETACH CLEANUP: Starting comprehensive cleanup for ${entity instanceof PlayerEntity ? entity.player?.username : entity.id}`);

      // 1. **SHOT METER FIX**: Clear any charging state when detaching
      if (this._holdingQ !== null && entity instanceof PlayerEntity) {
        // console.log(`🔧 SHOT METER FIX: Clearing charging state during detach for ${entity.player?.username || 'unknown'}`);
        this._clearPowerChargeIfNeeded(entity);
      }

      // 2. Clear any pending animations
      if (entity instanceof SoccerPlayerEntity) {
        try {
          entity.stopModelAnimations(ALL_LOOPED_ANIMATIONS);
        } catch (error) {
          // console.log("Animation cleanup error:", error);
        }
      }

      // 3. Clear all intervals and timers
      // Note: clearChargeInterval is already called inside _clearPowerChargeIfNeeded,
      // but we call it here unconditionally as a safety net in case the charge cleanup
      // path was skipped (e.g., _holdingQ was null but interval was somehow lingering)
      this.clearChargeInterval();

      if (CustomSoccerPlayer._ballStuckCheckInterval) {
        clearInterval(CustomSoccerPlayer._ballStuckCheckInterval);
        CustomSoccerPlayer._ballStuckCheckInterval = null;
      }

      if (this._stunTimeout) {
        clearTimeout(this._stunTimeout);
        this._stunTimeout = undefined;
      }

      // 4. Clear audio
      if (this._stepAudio) {
        try {
          this._stepAudio.pause();
          this._stepAudio = undefined;
        } catch (error) {
          // console.log("Step audio cleanup error:", error);
        }
      }

      // 5. Reset all state variables
      this._holdingQ = null;
      this._chargeStartTime = null;
      this._lastMoveDirection = { x: 0, z: 0 };
      this._lastRotationUpdateTime = null;
      this._lastCameraRotationTime = null;
      this._lastBounceTime = null;
      this._lastHeaderTime = 0;
      this._lastPowerUpTime = 0;

      // 6. Reset ground contact and platform tracking
      this._groundContactCount = 0;
      this._platform = undefined;

      // 7. Clear power bar UI if it exists
      if (this._powerBarUI) {
        try {
          this._powerBarUI.unload();
          this._powerBarUI = undefined;
        } catch (error) {
          // console.log("Power bar UI cleanup error:", error);
        }
      }

      // console.log(`✅ DETACH CLEANUP: Completed cleanup for ${entity instanceof PlayerEntity ? entity.player?.username : entity.id}`);

      super.detach(entity);
    } catch (error) {
      console.error("❌ DETACH ERROR: Critical error during detach:", error);
    }
  }

  private checkForStuckBall(world: World, sourceEntity?: Entity) {
    try {
      // Use per-entity shared state (room or global) instead of global singleton
      // This ensures multi-room support works correctly
      const entityState = sourceEntity ?
        ((sourceEntity as any).getSharedState ? (sourceEntity as any).getSharedState() : sharedState) :
        sharedState;

      const soccerBall = entityState.getSoccerBall();
      if (!soccerBall?.isSpawned) {
        CustomSoccerPlayer._ballStuckStartTime = 0;
        return;
      }

      const currentTime = Date.now();

      if (currentTime - CustomSoccerPlayer._lastBallCheckTime < BALL_STUCK_CHECK_INTERVAL) {
          return;
      }
      CustomSoccerPlayer._lastBallCheckTime = currentTime;

      const currentPosition = soccerBall.position;
      const currentVelocity = soccerBall.linearVelocity;

      if (!currentVelocity) {
        CustomSoccerPlayer._ballStuckStartTime = 0;
        return;
      }
      // This threshold should be validated against actual goal trigger zone X boundaries.
      const isInGoalArea = Math.abs(currentPosition.x) > 35;
      const isAboveGoalHeight = currentPosition.y > 3;

      const isEffectivelyStationary =
        Math.abs(currentVelocity.x) < BALL_VELOCITY_THRESHOLD &&
        Math.abs(currentVelocity.y) < BALL_VELOCITY_THRESHOLD &&
        Math.abs(currentVelocity.z) < BALL_VELOCITY_THRESHOLD;

      const isPotentiallyStuck = (isAboveGoalHeight || isInGoalArea) && isEffectivelyStationary;

      if (isPotentiallyStuck) {
        if (CustomSoccerPlayer._ballStuckStartTime === 0) {
          CustomSoccerPlayer._ballStuckStartTime = currentTime;
        } else if (currentTime - CustomSoccerPlayer._ballStuckStartTime > BALL_STUCK_TIME_THRESHOLD) {
          // console.log("Ball stuck detected - resetting position to global spawn.");
          if (soccerBall.isSpawned) soccerBall.despawn();
          entityState.setAttachedPlayer(null);
          soccerBall.spawn(world, GLOBAL_BALL_SPAWN_POSITION);
          soccerBall.setLinearVelocity({ x: 0, y: 0, z: 0 });
          soccerBall.setAngularVelocity({ x: 0, y: 0, z: 0 });
          CustomSoccerPlayer._ballStuckStartTime = 0;

          new Audio({
            uri: "audio/sfx/soccer/whistle.mp3",
            loop: false,
            volume: 0.1,
          }).play(world);
        }
      } else {
        CustomSoccerPlayer._ballStuckStartTime = 0;
      }

      CustomSoccerPlayer._lastBallPosition = { ...currentPosition };

    } catch (error) {
      console.warn("Error in checkForStuckBall:", error);
      CustomSoccerPlayer._ballStuckStartTime = 0;
    }
  }


  /**
   * Find the best teammate to pass to based on camera direction and field positioning
   * @param entity - The player entity making the pass
   * @param cameraOrientation - The player's camera orientation
   * @returns The best teammate to pass to, or null if none found
   */
  private _findBestPassTarget(entity: PlayerEntity, cameraOrientation: PlayerCameraOrientation): PlayerEntity | null {
    // Get all player entities from the world
    if (!entity.world) return null;
    
    const allPlayerEntities = entity.world.entityManager.getAllPlayerEntities();
    const teammates = allPlayerEntities.filter((teammate: PlayerEntity) => 
      teammate !== entity && 
      teammate.isSpawned && 
      (teammate as any).team === (entity as any).team
    );

    if (teammates.length === 0) return null;

    // Calculate camera direction vector
    const cameraDirection = directionFromOrientation(entity, cameraOrientation);
    
    let bestTarget: PlayerEntity | null = null;
    let bestScore = -Infinity;

    for (const teammate of teammates) {
      // Calculate direction to teammate
      const toTeammate = {
        x: teammate.position.x - entity.position.x,
        y: 0,
        z: teammate.position.z - entity.position.z
      };
      
      const distanceToTeammate = Math.sqrt(toTeammate.x * toTeammate.x + toTeammate.z * toTeammate.z);
      
      // Skip teammates that are too far away or too close
      if (distanceToTeammate > 30 || distanceToTeammate < 2) continue;
      
      // Normalize direction to teammate
      const normalizedToTeammate = {
        x: toTeammate.x / distanceToTeammate,
        y: 0,
        z: toTeammate.z / distanceToTeammate
      };
      
      // Calculate angle between camera direction and direction to teammate
      const dotProduct = cameraDirection.x * normalizedToTeammate.x + cameraDirection.z * normalizedToTeammate.z;
      const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct))); // Clamp to prevent NaN
      
      // Consider teammates within a wide angle (120 degrees) for better target finding
      if (angle > (Math.PI * 2 / 3)) continue;
      
      // Calculate score based on multiple factors
      let score = 0;
      
      // Angle bonus - prefer teammates in camera direction (max 30 points)
      score += (1 - (angle / (Math.PI * 2 / 3))) * 30;
      
      // Distance bonus - prefer closer teammates but not too close (max 25 points)
      const optimalDistance = 12; // Optimal pass distance
      const distanceScore = Math.max(0, 25 - Math.abs(distanceToTeammate - optimalDistance) * 2);
      score += distanceScore;
      
      // Forward progress bonus - prefer teammates closer to opponent goal (max 20 points)
      const opponentGoalX = (entity as any).team === 'red' ? 
        AI_GOAL_LINE_X_BLUE : 
        AI_GOAL_LINE_X_RED;
      
      const forwardProgress = (entity as any).team === 'red' ?
        entity.position.x - teammate.position.x :
        teammate.position.x - entity.position.x;
      
      if (forwardProgress > 0) {
        score += Math.min(20, forwardProgress * 2);
      }
      
      // Space bonus - check if teammate has space around them (max 15 points)
      const spaceScore = this._calculateTeammateSpace(teammate, allPlayerEntities);
      score += spaceScore;
      
      // Human player priority - give massive bonus to human players (max 50 points)
      if (!(teammate as any).aiRole) {
        score += 50;
        // console.log(`Human pass targeting: Prioritizing human player ${teammate.player.username}`);
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestTarget = teammate;
      }
    }

    return bestTarget;
  }

  /**
   * Calculate how much space a teammate has around them
   * @param teammate - The teammate to check space for
   * @param allPlayers - All players in the game
   * @returns Space score (0-15)
   */
  private _calculateTeammateSpace(teammate: PlayerEntity, allPlayers: PlayerEntity[]): number {
    let spaceScore = 15; // Start with max space
    
    for (const otherPlayer of allPlayers) {
      if (otherPlayer === teammate || !otherPlayer.isSpawned) continue;
      
      const distance = Math.sqrt(
        Math.pow(teammate.position.x - otherPlayer.position.x, 2) + 
        Math.pow(teammate.position.z - otherPlayer.position.z, 2)
      );
      
      // Reduce space score based on nearby players
      if (distance < 3) {
        spaceScore -= 8; // Very close player
      } else if (distance < 6) {
        spaceScore -= 4; // Moderately close player
      } else if (distance < 10) {
        spaceScore -= 2; // Somewhat close player
      }
    }
    
    return Math.max(0, spaceScore);
  }

  /**
   * Execute a targeted pass to a specific teammate with proper leading and power
   * @param entity - The player making the pass
   * @param target - The teammate to pass to
   * @param ball - The soccer ball entity
   * @returns Object with success status and distance
   */
  private _executeTargetedPass(entity: PlayerEntity, target: PlayerEntity, ball: Entity | null): { success: boolean; distance: number } {
    if (!ball) return { success: false, distance: 0 };

    // Calculate distance to target
    const distanceToTarget = Math.sqrt(
      Math.pow(target.position.x - entity.position.x, 2) + 
      Math.pow(target.position.z - entity.position.z, 2)
    );

    // IMPROVED LEADING: Calculate conservative lead based on target's movement
    // Get target's current velocity for leading calculation
    const targetVelocity = target.linearVelocity || { x: 0, y: 0, z: 0 };
    const velocityMagnitude = Math.sqrt(targetVelocity.x * targetVelocity.x + targetVelocity.z * targetVelocity.z);

    // Calculate lead position - lead if target is moving
    let leadPosition = { ...target.position };
    if (velocityMagnitude > 0.8) { // Lower threshold to lead more often
      // Calculate estimated travel time based on pass speed (lower power = slower ball)
      const estimatedBallSpeed = 5.5; // units per second (reduced to match lower pass power)
      const passTravelTime = Math.min(distanceToTarget / estimatedBallSpeed, 1.5); // Cap at 1.5 seconds

      // Apply aggressive leading - 85% of predicted movement for accurate delivery
      const leadMultiplier = 0.85;
      leadPosition = {
        x: target.position.x + targetVelocity.x * passTravelTime * leadMultiplier,
        y: target.position.y,
        z: target.position.z + targetVelocity.z * passTravelTime * leadMultiplier
      };

      // console.log(`Human pass leading: vel=${velocityMagnitude.toFixed(1)}, travel=${passTravelTime.toFixed(2)}s`);
    }

    // Calculate pass direction
    const passDirection = {
      x: leadPosition.x - entity.position.x,
      y: 0,
      z: leadPosition.z - entity.position.z
    };
    
    const passDistance = Math.sqrt(passDirection.x * passDirection.x + passDirection.z * passDirection.z);
    if (passDistance === 0) return { success: false, distance: 0 };
    
    // Normalize direction
    const normalizedDirection = {
      x: passDirection.x / passDistance,
      y: 0,
      z: passDirection.z / passDistance
    };

    // Calculate optimal pass power based on distance
    // BALANCED POWER: Aligned with AI pass power range (1.8-3.0)
    // Short passes (< 10): power ~1.8-2.2
    // Medium passes (10-20): power ~2.2-2.8
    // Long passes (> 20): power ~2.8-3.2 (max)
    let finalPassPower: number;
    if (passDistance < 10) {
      finalPassPower = 1.8 + (passDistance * 0.04); // 1.8 to 2.2
    } else if (passDistance < 20) {
      finalPassPower = 2.2 + ((passDistance - 10) * 0.06); // 2.2 to 2.8
    } else {
      finalPassPower = 2.8 + Math.min(0.4, (passDistance - 20) * 0.04); // 2.8 to 3.2 max
    }

    // console.log(`Human pass: dist=${passDistance.toFixed(1)}, power=${finalPassPower.toFixed(2)}`);

    // Fully clear ball's current velocity for a clean, accurate pass
    ball.setLinearVelocity({ x: 0, y: 0, z: 0 });

    try {
      // Apply pass impulse with controlled vertical component
      const verticalComponent = Math.min(0.2, 0.1 + (passDistance / 100)); // Slight arc for longer passes
      
      ball.applyImpulse({
        x: normalizedDirection.x * finalPassPower,
        y: verticalComponent,
        z: normalizedDirection.z * finalPassPower
      });

      // Reset angular velocity to prevent spinning
      ball.setAngularVelocity({ x: 0, y: 0, z: 0 });

      // Continue resetting angular velocity for a short period
      let resetCount = 0;
      const maxResets = 8; // More resets for better control
      const resetInterval = setInterval(() => {
        if (resetCount >= maxResets || !ball.isSpawned) {
          clearInterval(resetInterval);
          return;
        }
        ball.setAngularVelocity({ x: 0, y: 0, z: 0 });
        resetCount++;
      }, 40); // Reset every 40ms

      // NOTIFY AI TARGET about the incoming pass so they can move to receive it
      // Use duck typing to avoid circular dependency with AIPlayerEntity
      const targetAny = target as any;
      if (targetAny.notifyIncomingPass && typeof targetAny.notifyIncomingPass === 'function') {
        targetAny.notifyIncomingPass(leadPosition);
        // console.log(`📨 Human pass: Notified AI ${target.player.username} to receive pass at (${leadPosition.x.toFixed(1)}, ${leadPosition.z.toFixed(1)})`);
      }

      return { success: true, distance: distanceToTarget };
    } catch (error) {
      console.error(`Error in targeted pass: ${error}`);
      return { success: false, distance: distanceToTarget };
    }
  }

  /**
   * Execute a directional pass when no good target is found
   * @param entity - The player making the pass
   * @param cameraOrientation - The player's camera orientation
   * @param ball - The soccer ball entity
   */
  private _executeDirectionalPass(entity: PlayerEntity, cameraOrientation: PlayerCameraOrientation, ball: Entity | null): void {
    if (!ball) return;

    const direction = directionFromOrientation(entity, cameraOrientation);
    
    // Fully clear ball velocity for clean directional pass
    ball.setLinearVelocity({ x: 0, y: 0, z: 0 });

    // Use moderate power for directional pass (aligned with targeted pass range)
    const directionalPassPower = 2.8; // Moderate power matching mid-range targeted passes
    
    try {
      ball.applyImpulse({
        x: direction.x * directionalPassPower,
        y: 0.15, // Slight arc
        z: direction.z * directionalPassPower
      });

      // Reset angular velocity
      ball.setAngularVelocity({ x: 0, y: 0, z: 0 });
      
      // Continue resetting angular velocity
      let resetCount = 0;
      const maxResets = 6;
      const resetInterval = setInterval(() => {
        if (resetCount >= maxResets || !ball.isSpawned) {
          clearInterval(resetInterval);
          return;
        }
        ball.setAngularVelocity({ x: 0, y: 0, z: 0 });
        resetCount++;
      }, 50);
    } catch (error) {
      console.error(`Error in directional pass: ${error}`);
    }
  }

  /**
   * Request an AI teammate to pass the ball to this player.
   * Called when the player presses F and doesn't have the ball.
   * Executes directly on the server (no UI event roundtrip needed).
   */
  private _requestPassFromTeammate(entity: PlayerEntity, entityState: any): void {
    if (!(entity instanceof SoccerPlayerEntity)) return;

    const playerWithBall = entityState.getAttachedPlayer();

    // Check if an AI teammate has the ball
    if (
      playerWithBall &&
      playerWithBall instanceof SoccerPlayerEntity &&
      playerWithBall !== entity &&
      (playerWithBall as any).team === (entity as any).team &&
      typeof (playerWithBall as any).forcePass === 'function'
    ) {
      // Calculate distance for power scaling
      const distanceToPlayer = Math.sqrt(
        Math.pow(playerWithBall.position.x - entity.position.x, 2) +
        Math.pow(playerWithBall.position.z - entity.position.z, 2)
      );

      // Calculate target point slightly in front of the requesting player
      const targetDirection = getDirectionFromRotation(entity.rotation);
      const leadDistance = 2.5;
      const passTargetPoint = {
        x: entity.position.x + targetDirection.x * leadDistance,
        y: entity.position.y,
        z: entity.position.z + targetDirection.z * leadDistance,
      };

      // Scale power based on distance
      let passPower = 0.7;
      if (distanceToPlayer > 20) {
        passPower = 0.95;
      } else if (distanceToPlayer > 10) {
        passPower = 0.8;
      }

      const passSuccess = (playerWithBall as any).forcePass(entity, passTargetPoint, passPower);

      if (passSuccess) {
        entity.player.ui.sendData({
          type: "action-feedback",
          feedbackType: "success",
          title: "Pass Incoming!",
          message: `${playerWithBall.player.username} is passing`,
        });
      } else {
        entity.player.ui.sendData({
          type: "action-feedback",
          feedbackType: "error",
          title: "Pass Failed",
          message: "Teammate couldn't pass",
        });
      }
    } else {
      entity.player.ui.sendData({
        type: "action-feedback",
        feedbackType: "warning",
        title: "No Pass Available",
        message: "No AI teammate has the ball",
      });
    }
  }

  /**
   * Performs a goalkeeper header to deflect or catch high shots
   * @param entity - The goalkeeper entity
   * @param ball - The soccer ball entity
   * @param direction - The direction toward the ball
   */
  private performGoalkeeperHeader(entity: PlayerEntity, ball: any, direction: { x: number; z: number }) {
    const currentTime = Date.now();
    
    // Prevent header spam - minimum 1500ms between headers
    if (currentTime - this._lastHeaderTime < 1500) {
      return;
    }
    
    this._lastHeaderTime = currentTime;
    
    // Calculate header force based on ball velocity and position
    const ballVelocity = ball.linearVelocity;
    const ballSpeed = Math.sqrt(ballVelocity.x * ballVelocity.x + ballVelocity.z * ballVelocity.z);
    
    // Determine header action based on ball speed and goalkeeper position
    if (ballSpeed > 6.0) {
      // Fast shot - deflect away from goal
      const deflectionDirection = this.calculateDeflectionDirection(entity, ball);
      const deflectionForce = GOALKEEPER_HEADER_FORCE * 1.2; // Extra force for fast shots
      
      ball.setLinearVelocity({
        x: deflectionDirection.x * deflectionForce,
        y: Math.max(3.0, ballVelocity.y * 0.3), // Maintain some upward velocity
        z: deflectionDirection.z * deflectionForce
      });
      
      // Play deflection sound effect if available
      // console.log(`Goalkeeper ${entity.player?.username || 'AI'} deflected a fast shot!`);
      
    } else {
      // Slower shot - attempt to catch or control
      const catchDirection = {
        x: -ballVelocity.x * 0.8, // Absorb most of the ball's velocity
        y: Math.max(1.0, -Math.abs(ballVelocity.y) * 0.5), // Slight upward movement
        z: -ballVelocity.z * 0.8
      };
      
      ball.setLinearVelocity(catchDirection);
      
      // console.log(`Goalkeeper ${entity.player?.username || 'AI'} caught the ball with a header!`);
    }
  }
  
  /**
   * Calculates the optimal deflection direction for goalkeeper headers
   * @param entity - The goalkeeper entity
   * @param ball - The soccer ball entity
   * @returns Direction vector for ball deflection
   */
  private calculateDeflectionDirection(entity: PlayerEntity, ball: any): { x: number; z: number } {
    const soccerEntity = entity as any; // Cast to access team property
    const goalCenterX = soccerEntity.team === 'red' ? -37 : 52; // Goal line X coordinates
    const goalCenterZ = 0; // Center of goal
    
    // Calculate direction away from goal
    const ballToGoal = {
      x: goalCenterX - ball.position.x,
      z: goalCenterZ - ball.position.z
    };
    
    const distance = Math.sqrt(ballToGoal.x * ballToGoal.x + ballToGoal.z * ballToGoal.z);
    
    if (distance === 0) {
      // Ball is at goal center, deflect to the side
      return { x: 0, z: Math.random() > 0.5 ? 1 : -1 };
    }
    
    // Deflect perpendicular to the ball-to-goal direction
    const perpendicular = {
      x: -ballToGoal.z / distance,
      z: ballToGoal.x / distance
    };
    
    // Add some randomness for realistic deflections
    const randomFactor = 0.3;
    const randomAngle = (Math.random() - 0.5) * randomFactor;
    
    return {
      x: perpendicular.x * Math.cos(randomAngle) - perpendicular.z * Math.sin(randomAngle),
      z: perpendicular.x * Math.sin(randomAngle) + perpendicular.z * Math.cos(randomAngle)
    };
  }
}
