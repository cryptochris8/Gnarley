import {
  BlockType,
  ColliderShape,
  Entity,
  RigidBodyType,
  World,
  Audio,
  EntityEvent,
  Collider,
  CollisionGroup,
} from "hytopia";
import sharedState from "../state/sharedState";
import { RoomSharedState } from "../state/RoomSharedState";
import { getDirectionFromRotation } from "./direction";
import { BALL_CONFIG, BALL_SPAWN_POSITION, FIELD_MIN_Y, GAME_CONFIG } from "../state/gameConfig";
import { soccerMap } from "../state/map";
import type { BoundaryInfo } from "../state/map";
import SoccerPlayerEntity from "../entities/SoccerPlayerEntity";
import { EventThrottler } from "./EventThrottler";
import { isPenaltyShootoutMode } from "../state/gameModes";

// Goal sensor tracking
let redGoalSensor: Collider | null = null;
let blueGoalSensor: Collider | null = null;
let ballHasEnteredGoal = false;
let goalSensorDebounce = 0;
let ballResetLockout = 0; // Timestamp of last ball reset - prevents false goals during respawns
let worldRef: World | null = null; // Store world reference for goal sensor callbacks
let penaltyShootoutManagerRef: any | null = null; // Store penalty shootout manager reference for goal detection during shootouts

// Performance optimization: Cache last angular velocity to avoid redundant updates
let lastAngularVelocity: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
let lastAngularVelocityUpdateTime = 0;
const ANGULAR_VELOCITY_UPDATE_THRESHOLD = 0.1; // Only update if change is significant
const ANGULAR_VELOCITY_UPDATE_INTERVAL = 50; // Throttle to 50ms (20 updates/sec instead of 60)

/**
 * Optimized angular velocity update - only updates if change is significant or enough time has passed
 * Reduces redundant setAngularVelocity calls by ~70%
 */
function updateAngularVelocityOptimized(
  entity: Entity,
  newVelocity: { x: number; y: number; z: number }
): void {
  const now = Date.now();

  // Calculate difference from last set velocity
  const dx = Math.abs(newVelocity.x - lastAngularVelocity.x);
  const dy = Math.abs(newVelocity.y - lastAngularVelocity.y);
  const dz = Math.abs(newVelocity.z - lastAngularVelocity.z);
  const totalChange = dx + dy + dz;

  // Only update if:
  // 1. Change is significant (above threshold), OR
  // 2. Enough time has passed since last update (throttle)
  const shouldUpdate =
    totalChange > ANGULAR_VELOCITY_UPDATE_THRESHOLD ||
    now - lastAngularVelocityUpdateTime > ANGULAR_VELOCITY_UPDATE_INTERVAL;

  if (shouldUpdate) {
    entity.setAngularVelocity(newVelocity);
    lastAngularVelocity = { ...newVelocity };
    lastAngularVelocityUpdateTime = now;
  }
}

/**
 * Create goal line sensors for reliable goal detection
 * These sensors detect when the ball crosses the goal line, regardless of bouncing
 */
function createGoalSensors(world: World) {
  // Store world reference for goal sensor callbacks
  worldRef = world;
  
  // Red goal sensor (Blue team scores when ball enters)
  // FIX: Position sensor BEHIND the goal line (inside the goal) so it only triggers
  // when the ball actually enters the goal, not when goalkeeper holds ball in front
  // Red goal is at X=52 (field edge), sensor should be at X=54 (inside goal)
  redGoalSensor = new Collider({
    shape: ColliderShape.BLOCK,
    halfExtents: { x: 1.5, y: 2.0, z: 5 }, // 3x4x10 - narrower sensor inside goal only
    isSensor: true,
    tag: 'red-goal-sensor',
    relativePosition: {
      x: GAME_CONFIG.AI_GOAL_LINE_X_RED + 2.5, // Position BEHIND goal line (X=54.5, inside goal)
      y: 2.0, // Positioned at Y=2.0 so sensor spans Y=0 to Y=4 (full goal height)
      z: GAME_CONFIG.AI_FIELD_CENTER_Z
    },
    onCollision: (other: BlockType | Entity, started: boolean) => {
      if (other instanceof Entity && other.name === 'SoccerBall' && started) {
        console.log('🥅 Ball entered RED goal sensor - BLUE TEAM SCORES!');
        handleGoalSensorTrigger('blue', other);
      }
    },
  });

  // Blue goal sensor (Red team scores when ball enters)
  // FIX: Position sensor BEHIND the goal line (inside the goal) so it only triggers
  // when the ball actually enters the goal, not when goalkeeper holds ball in front
  // Blue goal is at X=-37 (field edge), sensor should be at X=-39.5 (inside goal)
  blueGoalSensor = new Collider({
    shape: ColliderShape.BLOCK,
    halfExtents: { x: 1.5, y: 2.0, z: 5 }, // 3x4x10 - narrower sensor inside goal only
    isSensor: true,
    tag: 'blue-goal-sensor',
    relativePosition: {
      x: GAME_CONFIG.AI_GOAL_LINE_X_BLUE - 2.5, // Position BEHIND goal line (X=-39.5, inside goal)
      y: 2.0, // Positioned at Y=2.0 so sensor spans Y=0 to Y=4 (full goal height)
      z: GAME_CONFIG.AI_FIELD_CENTER_Z
    },
    onCollision: (other: BlockType | Entity, started: boolean) => {
      if (other instanceof Entity && other.name === 'SoccerBall' && started) {
        console.log('🥅 Ball entered BLUE goal sensor - RED TEAM SCORES!');
        handleGoalSensorTrigger('red', other);
      }
    },
  });

  // Add sensors to world simulation
  redGoalSensor.addToSimulation(world.simulation);
  blueGoalSensor.addToSimulation(world.simulation);

  console.log('⚽ Goal sensors created and added to simulation');
  console.log(`   Red goal (X=${GAME_CONFIG.AI_GOAL_LINE_X_RED}): Blue scores here | Sensor: X=${GAME_CONFIG.AI_GOAL_LINE_X_RED + 1} to ${GAME_CONFIG.AI_GOAL_LINE_X_RED + 4}`);
  console.log(`   Blue goal (X=${GAME_CONFIG.AI_GOAL_LINE_X_BLUE}): Red scores here | Sensor: X=${GAME_CONFIG.AI_GOAL_LINE_X_BLUE - 4} to ${GAME_CONFIG.AI_GOAL_LINE_X_BLUE - 1}`);
  console.log(`   Sensor size: 3x4x10 blocks (Y=0 to Y=4) | Only triggers when ball enters goal`);
}

/**
 * Handle goal sensor trigger with debouncing to prevent multiple rapid goals
 */
function handleGoalSensorTrigger(scoringTeam: 'red' | 'blue', ballEntity: Entity) {
  const currentTime = Date.now();

  // CRITICAL: Check if we're in ball reset lockout period (prevents false goals after respawns)
  if (currentTime - ballResetLockout < 1500) {
    console.log(`🚫 Goal sensor triggered but in reset lockout period (${((currentTime - ballResetLockout) / 1000).toFixed(1)}s since reset)`);
    return;
  }

  // Debounce goals to prevent multiple rapid triggers (2 second cooldown)
  if (currentTime - goalSensorDebounce < 2000) {
    console.log('🚫 Goal sensor triggered but debounced (too recent)');
    return;
  }

  // Skip if ball is attached to a player (shouldn't happen in goal area, but safety check)
  if (sharedState.getAttachedPlayer() !== null) {
    console.log('🚫 Goal sensor triggered but ball is attached to player');
    return;
  }

  // Skip if goal is already being handled
  if (ballHasEnteredGoal) {
    console.log('🚫 Goal sensor triggered but goal already being handled');
    return;
  }
  
  // SIMPLIFIED VALIDATION: Trust the sensor, just do basic sanity checks
  const ballPos = ballEntity.position;

  // Goal dimensions - use generous margins to avoid rejecting valid goals
  const GOAL_WIDTH = 10; // Total width of goal
  const GOAL_HEIGHT = 4.5; // Allow up to 4.5 for margin (goal height is 4 blocks)

  // Generous boundaries - if sensor triggered, ball is likely in valid position
  const GOAL_MIN_Z = GAME_CONFIG.AI_FIELD_CENTER_Z - (GOAL_WIDTH / 2) - 1; // -9 (extra margin)
  const GOAL_MAX_Z = GAME_CONFIG.AI_FIELD_CENTER_Z + (GOAL_WIDTH / 2) + 1; // 3 (extra margin)

  console.log(`🎯 GOAL SENSOR TRIGGERED: ${scoringTeam.toUpperCase()} team scoring`);
  console.log(`   Ball position: X=${ballPos.x.toFixed(2)}, Y=${ballPos.y.toFixed(2)}, Z=${ballPos.z.toFixed(2)}`);

  // Only reject if ball is clearly outside the goal frame (very generous checks)
  if (ballPos.z < GOAL_MIN_Z || ballPos.z > GOAL_MAX_Z) {
    console.log(`🚫 GOAL REJECTED: Ball way outside goal width at Z=${ballPos.z.toFixed(2)} (valid range: ${GOAL_MIN_Z} to ${GOAL_MAX_Z})`);
    // Ball will be reset - set lockout to prevent false goal on respawn
    ballResetLockout = currentTime;
    return;
  }

  // Only reject if ball is way above crossbar or underground
  if (ballPos.y < -0.5 || ballPos.y > GOAL_HEIGHT) {
    console.log(`🚫 GOAL REJECTED: Ball height Y=${ballPos.y.toFixed(2)} is ${ballPos.y > GOAL_HEIGHT ? 'over crossbar' : 'underground'} (valid: -0.5 to ${GOAL_HEIGHT})`);
    // Ball will be reset - set lockout to prevent false goal on respawn
    ballResetLockout = currentTime;
    return;
  }

  // If sensor triggered and basic checks pass, TRUST IT - don't do complex X validation
  console.log(`   ✅ Ball within goal frame bounds`);
  console.log(`   ✅ Sensor detected ball in goal area - counting as goal!`);
  
  goalSensorDebounce = currentTime;
  ballHasEnteredGoal = true;

  console.log(`\n🎉🎉🎉 GOAL! ${scoringTeam.toUpperCase()} TEAM SCORES! 🎉🎉🎉`);
  console.log(`   Final position: X=${ballPos.x.toFixed(2)}, Y=${ballPos.y.toFixed(2)}, Z=${ballPos.z.toFixed(2)}\n`);

  // Check if we're in penalty shootout mode
  if (isPenaltyShootoutMode() && penaltyShootoutManagerRef) {
    console.log('⚽ PENALTY SHOOTOUT GOAL!');
    penaltyShootoutManagerRef.handleShotResult('goal');
    ballHasEnteredGoal = false; // Reset immediately for next penalty
    return;
  }

  // Emit goal event immediately - no confirmation delay needed
  if (worldRef) {
    worldRef.emit("goal" as any, scoringTeam as any);
  }

  // Reset ball after short celebration delay
  setTimeout(() => {
    if (worldRef) {
      ballEntity.despawn();
      ballEntity.spawn(worldRef, BALL_SPAWN_POSITION);
      ballEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
      ballEntity.setAngularVelocity({ x: 0, y: 0, z: 0 });
      ballHasEnteredGoal = false;
      // Set lockout to prevent false goals immediately after respawn
      ballResetLockout = Date.now();
      console.log('⚽ Ball respawned at center - 1.5s goal detection lockout active');
    } else {
      console.error('❌ Cannot respawn ball: worldRef is null');
    }
  }, 3000);
}

/**
 * Call this function when manually resetting the ball to prevent false goal detection
 * Should be called from gameState.ts after any ball respawn
 */
export function setBallResetLockout() {
  ballResetLockout = Date.now();
  // console.log('⚽ Ball reset lockout activated (1.5s)');
}

/**
 * Set penalty shootout manager reference for goal detection during penalties
 * Call this from gameState.ts when initializing the penalty shootout manager
 */
export function setPenaltyShootoutManager(manager: any) {
  penaltyShootoutManagerRef = manager;
  console.log('⚽ Penalty shootout manager registered with ball system');
}

/**
 * Throttled stationary status updater
 * Only updates ball stationary status once every 100ms instead of every tick
 * Reduces CPU usage for non-critical tracking
 */
const throttledStationaryUpdate = EventThrottler.throttle(
  (currentPos: { x: number; y: number; z: number }) => {
    sharedState.updateBallStationaryStatus(currentPos);
  },
  100 // Update at most 10 times per second
);

/**
 * Throttled debug logger for reception assistance
 * Prevents log spam during gameplay
 */
const throttledReceptionLog = EventThrottler.throttle(
  (username: string, dot: number, assistanceFactor: number) => {
    console.log(`📥 Reception assist for ${username}: dot=${dot.toFixed(2)}, assist=${((1-assistanceFactor)*100).toFixed(0)}%`);
  },
  500 // Log at most once every 500ms
);

// Type for shared state that works with both global and room-specific state
type SharedStateType = typeof sharedState | RoomSharedState;

/**
 * Creates a soccer ball entity for a game world
 * @param world - The Hytopia game world
 * @param roomState - Optional room-specific shared state for multi-room support
 */
export default function createSoccerBall(world: World, roomState?: RoomSharedState) {
  // Helper function to get the correct shared state
  // Uses room-specific state if provided, otherwise falls back to global singleton
  const getSharedState = (): SharedStateType => roomState || sharedState;
  const roomId = roomState?.getRoomId() || 'global';

  console.log(`⚽ Creating soccer ball for room: ${roomId}`);
  console.log("Creating soccer ball with config:", JSON.stringify(BALL_CONFIG));
  console.log("Ball spawn position:", JSON.stringify(BALL_SPAWN_POSITION));

  // Create goal sensors for reliable goal detection
  createGoalSensors(world);
  
  const soccerBall = new Entity({
    name: "SoccerBall",
    modelUri: "models/soccer/scene.gltf",
    modelScale: BALL_CONFIG.SCALE,
    rigidBodyOptions: {
      type: RigidBodyType.DYNAMIC,
      ccdEnabled: true, // Continuous collision detection to prevent tunneling
      linearDamping: BALL_CONFIG.LINEAR_DAMPING,
      angularDamping: BALL_CONFIG.ANGULAR_DAMPING,
      colliders: [
        {
          shape: ColliderShape.BALL,
          radius: BALL_CONFIG.RADIUS,
          friction: BALL_CONFIG.FRICTION,
          // ENHANCED: Improved collision groups for better crossbar/goal post interaction
          collisionGroups: {
            belongsTo: [1], // Default collision group for ball
            collidesWith: [1, 2, 4, 8] // Collide with terrain(1), blocks(2), entities(4), and goal structures(8)
          }
          // Note: Ball bounce physics handled by BALL_CONFIG settings in gameConfig.ts
        },
      ],
    },
  });

  getSharedState().setSoccerBall(soccerBall);

  let inGoal = false;
  let isRespawning = false;
  let lastPosition = { ...BALL_SPAWN_POSITION };
  let ticksSinceLastPositionCheck = 0;
  let isInitializing = true; // Flag to prevent whistle during startup
  let whistleDebounceTimer = 0; // Add a timer to prevent multiple whistles

  console.log("Ball entity created, spawning at proper ground position");
  
  // Only spawn the ball if it's not already spawned
  if (!soccerBall.isSpawned) {
    // Simple spawn at the correct position (now with guaranteed ground block)
    soccerBall.spawn(world, BALL_SPAWN_POSITION);
    // Reset physics state
    soccerBall.setLinearVelocity({ x: 0, y: 0, z: 0 });
    soccerBall.setAngularVelocity({ x: 0, y: 0, z: 0 });
    // Force physics update
    soccerBall.wakeUp();
    
    console.log("Ball spawned successfully at:", JSON.stringify(BALL_SPAWN_POSITION));
    console.log("Ball spawn status:", soccerBall.isSpawned ? "SUCCESS" : "FAILED");
  } else {
    console.log("Ball is already spawned, skipping spawn");
  }
  
  // Short delay to complete initialization and enable boundary checks
  setTimeout(() => {
    isInitializing = false;
    console.log("Ball initialization complete, enabling boundary checks");
    console.log("Current ball position:", 
      soccerBall.isSpawned ? 
      `x=${soccerBall.position.x}, y=${soccerBall.position.y}, z=${soccerBall.position.z}` : 
      "Ball not spawned");
  }, 1000); // 1 second delay is sufficient

  soccerBall.on(EntityEvent.TICK, ({ entity, tickDeltaMs }) => {
    // Performance profiling: Start timing ball physics
    const ballPhysicsStartTime = performance.now();
    
    // Check if ball has moved from spawn
    if (!getSharedState().getBallHasMoved()) {
      const currentPos = { ...entity.position }; // Clone position
      const spawnPos = BALL_SPAWN_POSITION;
      const dx = currentPos.x - spawnPos.x;
      const dy = currentPos.y - spawnPos.y;
      const dz = currentPos.z - spawnPos.z;
      // Use a small threshold to account for minor physics jitter
      const distanceMoved = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (distanceMoved > 0.1) {
        getSharedState().setBallHasMoved();
      }
    }

    // Check for sudden large position changes that could cause camera shaking
    ticksSinceLastPositionCheck++;
    if (ticksSinceLastPositionCheck >= 5) { // Check every 5 ticks
      ticksSinceLastPositionCheck = 0;
      const currentPos = { ...entity.position };
      const dx = currentPos.x - lastPosition.x;
      const dy = currentPos.y - lastPosition.y;
      const dz = currentPos.z - lastPosition.z;
      const positionChange = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      // Use more subtle position correction only for extreme cases
      if (positionChange > 5.0) {
        entity.setPosition({
          x: lastPosition.x + dx * 0.7,
          y: lastPosition.y + dy * 0.7,
          z: lastPosition.z + dz * 0.7
        });
      }
      
      lastPosition = { ...entity.position };
    }
    
    // **BALL STATIONARY DETECTION SYSTEM**
    // Update stationary tracking for AI pursuit logic
    // This ensures balls that sit idle get retrieved by AI players
    // PERFORMANCE: Throttled to 100ms intervals instead of every tick
    const currentPos = { ...entity.position };
    throttledStationaryUpdate(currentPos);
    
    const attachedPlayer = getSharedState().getAttachedPlayer();

    // If the ball falls significantly below the field, reset it immediately
    // Allow ball to rest on ground (Y=1) but reset if it goes below Y=0.5
    if (entity.position.y < FIELD_MIN_Y + 0.5 && !isRespawning && !inGoal && !isInitializing) {
      console.log(`Ball unexpectedly below field at Y=${entity.position.y}, resetting to spawn position`);
      isRespawning = true;

      // Reset the ball position without playing the whistle (this is a physics issue, not gameplay)
      entity.despawn();
      getSharedState().setAttachedPlayer(null);
      
      // Spawn at the proper ground position (higher Y to ensure it's above ground)
      entity.spawn(world, BALL_SPAWN_POSITION);
      entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
      entity.setAngularVelocity({ x: 0, y: 0, z: 0 });
      
      // Reset respawning flag after a delay
      setTimeout(() => {
        isRespawning = false;
      }, 1000);
      
      return; // Skip the rest of the checks
    }

    // Skip all goal and boundary checks during initialization or if already handling an event
    if (attachedPlayer == null && !inGoal && !isRespawning && !isInitializing) {
      const currentPos = { ...entity.position }; // Clone position
      
      // Skip boundary check if the ball is clearly below the field
      if (currentPos.y < FIELD_MIN_Y - 1) {
        return;
      }
      
      // NOTE: Goal detection now handled by collision sensors instead of position checking
      // This eliminates the bounce-out issue where balls quickly exit the goal area
      // during the confirmation delay, causing goals to be incorrectly rejected
      
      // Enhanced out-of-bounds detection with detailed boundary information
      {
        const boundaryInfo: BoundaryInfo = soccerMap.checkBoundaryDetails(currentPos);
        
        if (boundaryInfo.isOutOfBounds && !isRespawning) {
          console.log(`Ball out of bounds:`, boundaryInfo);
          
          // Check if a whistle was recently played
          const currentTime = Date.now();
          if (currentTime - whistleDebounceTimer < 3000) {
            // Skip playing the whistle if one was played less than 3 seconds ago
            console.log("Skipping whistle sound (debounced)");
          } else {
            console.log(`Ball out of bounds at position ${currentPos.x}, ${currentPos.y}, ${currentPos.z} - playing whistle`);
            whistleDebounceTimer = currentTime;
            
            // Play a single whistle for out of bounds
            new Audio({
              uri: "audio/sfx/soccer/whistle.mp3",
              volume: 0.1,
              loop: false
            }).play(world);
          }
          
          isRespawning = true;
          
          setTimeout(() => {
            if (isRespawning) { // Make sure we're still handling this out-of-bounds event
              // Reset the ball position
              entity.despawn();
              getSharedState().setAttachedPlayer(null);

              // Emit different events based on boundary type
              if (boundaryInfo.boundaryType === 'sideline') {
                // Ball went out on sideline - throw-in
                console.log("Emitting throw-in event");
                world.emit("ball-out-sideline" as any, {
                  side: boundaryInfo.side,
                  position: boundaryInfo.position,
                  lastPlayer: getSharedState().getLastPlayerWithBall()
                } as any);
              } else if (boundaryInfo.boundaryType === 'goal-line') {
                // Ball went out over goal line - corner kick or goal kick
                console.log("Emitting goal-line out event");
                world.emit("ball-out-goal-line" as any, {
                  side: boundaryInfo.side,
                  position: boundaryInfo.position,
                  lastPlayer: getSharedState().getLastPlayerWithBall()
                } as any);
              } else {
                // Fallback to old system for other cases
                console.log("Emitting general out-of-bounds event");
                world.emit("ball-reset-out-of-bounds" as any, {} as any);
              }
              
              // Set a short delay before allowing the ball to trigger another out-of-bounds event
              // This prevents rapid whistle sounds if the ball spawns in a weird location
              setTimeout(() => {
                isRespawning = false;
              }, 1000);
            }
          }, 1500);
        }
      }
    }

    // Proximity-based ball possession for better passing mechanics
    if (attachedPlayer == null && !inGoal && !isRespawning && !isInitializing) {
      // Check for nearby teammates when ball is loose
      const ballPosition = entity.position;
      const ballVelocity = entity.linearVelocity;
      
      // Enhanced reception assistance - different logic for moving vs stationary balls
      const ballSpeed = Math.sqrt(ballVelocity.x * ballVelocity.x + ballVelocity.z * ballVelocity.z);

      // IMPROVED PASS RECEPTION FORGIVENESS (much more forgiving for better gameplay)
      let PROXIMITY_POSSESSION_DISTANCE = 2.5; // INCREASED from 2.0 to 2.5 for easier ball pickup
      let MAX_BALL_SPEED_FOR_PROXIMITY = 5.0; // INCREASED from 4.0 to 5.0 for better stationary ball pickup

      // MAGNETIC PASS RECEPTION: Much larger radius for players expecting a pass
      const PASS_TARGET_MAGNETIC_DISTANCE = 4.5; // Magnetic "catch zone" for pass targets

      // RECEPTION ASSISTANCE: If ball is moving (likely a pass), increase reception assistance significantly
      if (ballSpeed > 1.0) {
        // Ball is moving - likely a pass, so provide enhanced reception assistance
        PROXIMITY_POSSESSION_DISTANCE = 3.5; // INCREASED from 3.0 to 3.5 for very forgiving pass reception
        MAX_BALL_SPEED_FOR_PROXIMITY = 10.0; // INCREASED from 8.0 to 10.0 to help with all pass speeds
      }
      
      if (ballSpeed < MAX_BALL_SPEED_FOR_PROXIMITY) {
        // Get all player entities in the world
        const allPlayerEntities = world.entityManager.getAllPlayerEntities();
        let closestPlayer: SoccerPlayerEntity | null = null;
        let closestDistance = Infinity;
        let isPassTargetReception = false; // Track if this is a magnetic pass reception

        for (const playerEntity of allPlayerEntities) {
          if (playerEntity instanceof SoccerPlayerEntity && playerEntity.isSpawned && !playerEntity.isStunned) {
            const distance = Math.sqrt(
              Math.pow(playerEntity.position.x - ballPosition.x, 2) +
              Math.pow(playerEntity.position.z - ballPosition.z, 2)
            );

            // MAGNETIC PASS RECEPTION: Check if this player is expecting a pass (AI only)
            // Use duck typing to check for getIncomingPassTarget method
            const playerAny = playerEntity as any;
            const isExpectingPass = playerAny.getIncomingPassTarget &&
                                    typeof playerAny.getIncomingPassTarget === 'function' &&
                                    playerAny.getIncomingPassTarget() !== null;

            // If player is expecting a pass, use larger magnetic reception radius
            if (isExpectingPass && distance < PASS_TARGET_MAGNETIC_DISTANCE) {
              // This player is the intended pass target - give them priority!
              if (distance < closestDistance) {
                closestDistance = distance;
                closestPlayer = playerEntity;
                isPassTargetReception = true;
                console.log(`🧲 MAGNETIC RECEPTION: ${playerEntity.player.username} catching pass (dist: ${distance.toFixed(1)})`);
              }
              continue; // Skip normal distance checks for pass targets
            }

            // ENHANCED RECEPTION: Additional assistance for balls moving toward the player
            let effectiveDistance = distance;
            if (ballSpeed > 1.0) {
              // Calculate if ball is moving toward this player
              const ballDirection = { x: ballVelocity.x, z: ballVelocity.z };
              const ballToPlayer = {
                x: playerEntity.position.x - ballPosition.x,
                z: playerEntity.position.z - ballPosition.z
              };

              // Normalize vectors for dot product calculation
              const ballDirLength = Math.sqrt(ballDirection.x * ballDirection.x + ballDirection.z * ballDirection.z);
              const ballToPlayerLength = Math.sqrt(ballToPlayer.x * ballToPlayer.x + ballToPlayer.z * ballToPlayer.z);

              if (ballDirLength > 0 && ballToPlayerLength > 0) {
                const dotProduct = (ballDirection.x * ballToPlayer.x + ballDirection.z * ballToPlayer.z) /
                                  (ballDirLength * ballToPlayerLength);

                // IMPROVED: More forgiving angle threshold (was 0.5, now 0.3) and stronger assistance
                if (dotProduct > 0.3) { // Accept wider angles (was 0.5)
                  // Scale assistance based on how directly ball is coming toward player
                  const assistanceFactor = 0.5 + (dotProduct * 0.3); // Range: 0.5 to 0.8
                  effectiveDistance = distance * assistanceFactor; // Up to 50% easier reception!

                  // PERFORMANCE: Use throttled logging to prevent spam
                  throttledReceptionLog(playerEntity.player.username, dotProduct, assistanceFactor);
                }
              }
            }

            // Only update closest if not already found a pass target (pass targets have priority)
            if (!isPassTargetReception && effectiveDistance < PROXIMITY_POSSESSION_DISTANCE && effectiveDistance < closestDistance) {
              closestDistance = effectiveDistance;
              closestPlayer = playerEntity;
            }
          }
        }

        // Automatically attach ball to closest player if within range
        if (closestPlayer) {
          getSharedState().setAttachedPlayer(closestPlayer);

          // Clear the incoming pass notification if this was a pass target
          const closestAny = closestPlayer as any;
          if (closestAny.clearIncomingPass && typeof closestAny.clearIncomingPass === 'function') {
            closestAny.clearIncomingPass();
          }

          // Play a subtle sound to indicate automatic ball attachment
          new Audio({
            uri: "audio/sfx/soccer/kick.mp3",
            volume: isPassTargetReception ? 0.12 : 0.08, // Slightly louder for magnetic catches
            loop: false,
          }).play(entity.world as World);

          if (isPassTargetReception) {
            console.log(`🧲 Ball MAGNETICALLY attached to pass target ${closestPlayer.player.username} (dist: ${closestDistance.toFixed(2)} units)`);
          } else {
            console.log(`Ball automatically attached to ${closestPlayer.player.username} (proximity: ${closestDistance.toFixed(2)} units, speed: ${ballSpeed.toFixed(1)})`);
          }
        }
      }
    }

    if (attachedPlayer != null) {
      const playerRotation = { ...attachedPlayer.rotation }; // Clone rotation
      const playerPos = { ...attachedPlayer.position }; // Clone position
      const direction = getDirectionFromRotation(playerRotation);
      
      // Calculate ball position with a small offset from player
      const ballPosition = {
        x: playerPos.x - direction.x * 0.7,
        y: playerPos.y - 0.5,
        z: playerPos.z - direction.z * 0.7,
      };

      const currentPos = { ...entity.position }; // Clone ball position
      
      // Simple follow logic
      entity.setPosition(ballPosition);
      entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
      
      // Add ball rotation based on player movement for realistic dribbling effect
      const playerVelocity = attachedPlayer.linearVelocity;
      const playerSpeed = Math.sqrt(playerVelocity.x * playerVelocity.x + playerVelocity.z * playerVelocity.z);
      
      // Only rotate the ball if the player is moving at a reasonable speed
      if (playerSpeed > 0.5) {
        // Calculate rotation speed based on player movement speed
        // Higher speed = faster rotation, simulating ball rolling
        const rotationMultiplier = 2.0; // Adjust this to make rotation faster/slower
        const rotationSpeed = playerSpeed * rotationMultiplier;

        // Calculate rotation direction based on movement direction
        // The ball should rotate perpendicular to the movement direction
        const movementDirection = {
          x: playerVelocity.x / playerSpeed,
          z: playerVelocity.z / playerSpeed
        };

        // PERFORMANCE OPTIMIZATION: Use optimized angular velocity update
        // This reduces redundant setAngularVelocity calls by ~70%
        updateAngularVelocityOptimized(entity, {
          x: -movementDirection.z * rotationSpeed, // Negative for correct rotation direction
          y: 0, // No spinning around vertical axis
          z: movementDirection.x * rotationSpeed
        });
      } else {
        // Player is stationary or moving slowly, stop ball rotation
        // PERFORMANCE OPTIMIZATION: Use optimized angular velocity update
        updateAngularVelocityOptimized(entity, { x: 0, y: 0, z: 0 });
      }
    }
    
    // Performance profiling: Record ball physics timing
    const ballPhysicsEndTime = performance.now();
    const ballPhysicsDuration = ballPhysicsEndTime - ballPhysicsStartTime;
    
    // Get performance profiler from world if available
    const profiler = (world as any)._performanceProfiler;
    if (profiler) {
      profiler.recordBallPhysics(ballPhysicsDuration);
    }
  });

  soccerBall.on(EntityEvent.ENTITY_COLLISION, ({ entity, otherEntity, started }) => {
    if (started && otherEntity instanceof SoccerPlayerEntity) {
      const currentAttachedPlayer = getSharedState().getAttachedPlayer();

      if (currentAttachedPlayer == null && !inGoal) {
        // Ball is loose - attach to any player who touches it
        if (!otherEntity.isStunned) {
          getSharedState().setAttachedPlayer(otherEntity);

          // Play a subtle sound to indicate ball attachment
          new Audio({
            uri: "audio/sfx/soccer/kick.mp3",
            volume: 0.15,
            loop: false,
          }).play(entity.world as World);
        }
      } else if (currentAttachedPlayer != null) {
        // Ball is currently possessed
        if (otherEntity.isTackling) {
          // Tackling player steals the ball
          getSharedState().setAttachedPlayer(null);
          // Apply a basic impulse to the ball
          const direction = getDirectionFromRotation(otherEntity.rotation);
          entity.applyImpulse({
            x: direction.x * 1.0,
            y: 0.3,
            z: direction.z * 1.0,
          });
          // Reset angular velocity to prevent unwanted spinning/backwards movement
          entity.setAngularVelocity({ x: 0, y: 0, z: 0 });
        } else if (currentAttachedPlayer instanceof SoccerPlayerEntity &&
                   currentAttachedPlayer.team === otherEntity.team &&
                   currentAttachedPlayer !== otherEntity) {
          // Teammate collision - transfer possession to teammate
          getSharedState().setAttachedPlayer(otherEntity);

          // Play a subtle sound to indicate ball transfer
          new Audio({
            uri: "audio/sfx/soccer/kick.mp3",
            volume: 0.1,
            loop: false,
          }).play(entity.world as World);

          console.log(`Ball transferred from ${currentAttachedPlayer.player.username} to teammate ${otherEntity.player.username}`);
        }
      }
    }
  });

  soccerBall.on(EntityEvent.BLOCK_COLLISION, ({ entity, blockType, started }) => {
    if (started) {
      // Allow ball to bounce off ALL blocks to prevent falling through ground
      // Realistic soccer ball bounce - maintain forward momentum with slight damping
      const velocity = entity.linearVelocity;
      const dampingFactor = 0.85; // Reduce speed slightly on bounce
      entity.setLinearVelocity({
        x: velocity.x * dampingFactor, // Keep forward momentum, just reduce speed
        y: Math.abs(velocity.y) * 0.6, // Bounce up with reduced height
        z: velocity.z * dampingFactor, // Keep lateral momentum, just reduce speed
      });
      // Reset angular velocity to prevent unwanted spinning from collision
      entity.setAngularVelocity({ x: 0, y: 0, z: 0 });
    }
  });

  return soccerBall;
}
