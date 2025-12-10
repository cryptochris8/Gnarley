/**
 * PenaltyShootoutManager - Manages penalty shootout game mode
 *
 * This class is completely isolated from regular gameplay and only activates
 * when explicitly triggered (after overtime or via command).
 *
 * HYTOPIA SDK Compliance:
 * - Uses existing Entity and PlayerEntity systems
 * - Event-driven UI communication via player.ui.sendData()
 * - No InputManager violations
 * - Proper state isolation (doesn't interfere with SoccerGame)
 */

import { World, PlayerEntity, Entity, Audio } from "hytopia";
import type { Vector3Like } from "hytopia";
import SoccerPlayerEntity from "../entities/SoccerPlayerEntity";
import AIPlayerEntity from "../entities/AIPlayerEntity";
import sharedState from "./sharedState";
import {
  PENALTY_SHOOTOUT_CONFIG,
  GameMode,
  setGameMode
} from "./gameModes";
import {
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  AI_FIELD_CENTER_Z,
  SAFE_SPAWN_Y
} from "./gameConfig";

// Penalty shootout state types
type ShootoutPhase =
  | 'setup'           // Setting up positions
  | 'shooter-ready'   // Shooter preparing
  | 'shooting'        // Shot in progress
  | 'result'          // Showing result (goal/save/miss)
  | 'transition'      // Moving to next round
  | 'finished';       // Shootout complete

type ShotResult = 'goal' | 'saved' | 'missed';

interface PenaltyRound {
  roundNumber: number;
  isSuddenDeath: boolean;
  redShooter: PlayerEntity | null;
  blueShooter: PlayerEntity | null;
  redResult: ShotResult | null;
  blueResult: ShotResult | null;
}

interface ShootoutScore {
  red: number;
  blue: number;
}

export class PenaltyShootoutManager {
  private world: World;
  private soccerBall: Entity;
  private isActive: boolean = false;

  // Shootout state
  private phase: ShootoutPhase = 'setup';
  private currentRound: number = 1;
  private score: ShootoutScore = { red: 0, blue: 0 };
  private rounds: PenaltyRound[] = [];
  private currentShootingTeam: 'red' | 'blue' | null = null;
  private currentShooter: PlayerEntity | null = null;
  private currentGoalkeeper: PlayerEntity | null = null;

  // Players
  private redPlayers: SoccerPlayerEntity[] = [];
  private bluePlayers: SoccerPlayerEntity[] = [];
  private redShooterIndex: number = 0;
  private blueShooterIndex: number = 0;

  // Timers
  private shotTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private ballMonitorInterval: ReturnType<typeof setInterval> | null = null;

  // Shot tracking
  private shotHasBeenTaken: boolean = false;
  private ballInitialPosition: Vector3Like | null = null;

  // Audio
  private tensionAudio: Audio;
  private whistleAudio: Audio;

  constructor(world: World, soccerBall: Entity) {
    this.world = world;
    this.soccerBall = soccerBall;

    // Initialize audio
    this.tensionAudio = new Audio({
      uri: "audio/music/tension.mp3", // You may need to add this audio file
      loop: true,
      volume: 0.3
    });

    this.whistleAudio = new Audio({
      uri: "audio/sfx/soccer/whistle.mp3",
      loop: false,
      volume: 0.3
    });
  }

  /**
   * Start the penalty shootout
   * Called after overtime ends in a tie, or manually via command
   */
  public start(): void {
    if (this.isActive) {
      console.log("⚽ Penalty shootout already active");
      return;
    }

    console.log("⚽ STARTING PENALTY SHOOTOUT");
    this.isActive = true;
    this.phase = 'setup';

    // Switch to penalty shootout mode
    setGameMode(GameMode.PENALTY_SHOOTOUT);

    // Initialize state
    this.currentRound = 1;
    this.score = { red: 0, blue: 0 };
    this.rounds = [];
    this.redShooterIndex = 0;
    this.blueShooterIndex = 0;

    // Collect players from both teams
    this.collectPlayers();

    // Validate we have players
    if (this.redPlayers.length === 0 || this.bluePlayers.length === 0) {
      console.error("❌ Cannot start penalty shootout - not enough players");
      this.world.chatManager.sendBroadcastMessage("Cannot start penalty shootout - need players on both teams!");
      this.end();
      return;
    }

    // Start tension music if enabled
    if (PENALTY_SHOOTOUT_CONFIG.tensionMusic) {
      this.tensionAudio.play(this.world);
    }

    // Announce shootout start
    this.world.chatManager.sendBroadcastMessage("⚽ PENALTY SHOOTOUT! Best of 5 rounds.");
    this.world.chatManager.sendBroadcastMessage(`Red Team: ${this.redPlayers.length} players | Blue Team: ${this.bluePlayers.length} players`);

    // Send UI notification
    this.sendUIUpdate({
      type: "penalty-shootout-start",
      message: "Penalty Shootout - Best of 5!",
      score: this.score,
      round: this.currentRound
    });

    // Start first round after brief delay
    setTimeout(() => {
      this.startRound();
    }, 3000);
  }

  /**
   * Collect all players from both teams
   */
  private collectPlayers(): void {
    this.redPlayers = [];
    this.bluePlayers = [];

    this.world.entityManager.getAllPlayerEntities().forEach((entity) => {
      if (entity instanceof SoccerPlayerEntity && entity.isSpawned) {
        if (entity.team === 'red') {
          this.redPlayers.push(entity);
        } else if (entity.team === 'blue') {
          this.bluePlayers.push(entity);
        }
      }
    });

    console.log(`⚽ Collected ${this.redPlayers.length} red players, ${this.bluePlayers.length} blue players`);
  }

  /**
   * Start a new penalty round
   */
  private startRound(): void {
    if (!this.isActive) return;

    // Check if we've completed standard rounds and need sudden death
    const isSuddenDeath = this.currentRound > PENALTY_SHOOTOUT_CONFIG.standardRounds;

    // Create round data
    const round: PenaltyRound = {
      roundNumber: this.currentRound,
      isSuddenDeath,
      redShooter: null,
      blueShooter: null,
      redResult: null,
      blueResult: null
    };
    this.rounds.push(round);

    console.log(`⚽ Starting Round ${this.currentRound}${isSuddenDeath ? ' (SUDDEN DEATH)' : ''}`);

    // Announce round start
    const roundMessage = isSuddenDeath
      ? `⚽ SUDDEN DEATH - Round ${this.currentRound}`
      : `⚽ Round ${this.currentRound} of ${PENALTY_SHOOTOUT_CONFIG.standardRounds}`;
    this.world.chatManager.sendBroadcastMessage(roundMessage);

    // Send UI update
    this.sendUIUpdate({
      type: "penalty-round-start",
      round: this.currentRound,
      isSuddenDeath,
      score: this.score
    });

    // Red team shoots first
    this.setupShot('red');
  }

  /**
   * Setup a penalty shot for the specified team
   */
  private setupShot(team: 'red' | 'blue'): void {
    if (!this.isActive) return;

    this.phase = 'shooter-ready';
    this.currentShootingTeam = team;

    // Select shooter (rotate through team players)
    const players = team === 'red' ? this.redPlayers : this.bluePlayers;
    const shooterIndex = team === 'red' ? this.redShooterIndex : this.blueShooterIndex;

    // Wrap around if we've used all players
    const actualIndex = shooterIndex % players.length;
    this.currentShooter = players[actualIndex];

    // Select goalkeeper from opposing team
    const opposingPlayers = team === 'red' ? this.bluePlayers : this.redPlayers;
    // Try to use goalkeeper role if available, otherwise first player
    this.currentGoalkeeper = opposingPlayers.find(p => p.role === 'goalkeeper') || opposingPlayers[0];

    // Update shooter index for next time
    if (team === 'red') {
      this.redShooterIndex++;
    } else {
      this.blueShooterIndex++;
    }

    console.log(`⚽ ${team.toUpperCase()} team penalty: ${this.currentShooter.player.username} vs ${this.currentGoalkeeper.player.username}`);

    // Position players
    this.positionForPenalty(team);

    // Announce
    const shooterName = this.currentShooter.player.username;
    const keeperName = this.currentGoalkeeper.player.username;
    this.world.chatManager.sendBroadcastMessage(`${team.toUpperCase()} TEAM: ${shooterName} steps up to take the penalty!`);
    this.world.chatManager.sendBroadcastMessage(`Goalkeeper: ${keeperName}`);

    // Send UI update
    this.sendUIUpdate({
      type: "penalty-shot-setup",
      shootingTeam: team,
      shooter: shooterName,
      goalkeeper: keeperName,
      timeLimit: PENALTY_SHOOTOUT_CONFIG.shotTimeLimit
    });

    // Play whistle
    this.whistleAudio.play(this.world);

    // Start shot timer
    this.startShotTimer();
  }

  /**
   * Position shooter, goalkeeper, and spectators for penalty
   */
  private positionForPenalty(shootingTeam: 'red' | 'blue'): void {
    if (!this.currentShooter || !this.currentGoalkeeper) return;

    // Determine which goal to shoot at
    // Red shoots at blue's goal (+X), Blue shoots at red's goal (-X)
    const targetGoalX = shootingTeam === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;

    // Calculate penalty spot (11 units from goal)
    const penaltySpotX = shootingTeam === 'red'
      ? targetGoalX - PENALTY_SHOOTOUT_CONFIG.penaltySpotDistance
      : targetGoalX + PENALTY_SHOOTOUT_CONFIG.penaltySpotDistance;

    // Position shooter at penalty spot
    const shooterPos: Vector3Like = {
      x: penaltySpotX,
      y: SAFE_SPAWN_Y,
      z: AI_FIELD_CENTER_Z
    };

    // Position goalkeeper on goal line
    const goalkeeperPos: Vector3Like = {
      x: targetGoalX + (shootingTeam === 'red' ? 1 : -1), // Slightly in front of goal line
      y: SAFE_SPAWN_Y,
      z: AI_FIELD_CENTER_Z
    };

    // Position shooter
    this.currentShooter.setPosition(shooterPos);
    this.currentShooter.setLinearVelocity({ x: 0, y: 0, z: 0 });
    this.currentShooter.setAngularVelocity({ x: 0, y: 0, z: 0 });
    this.currentShooter.unfreeze(); // Shooter can move and shoot

    // Set shooter rotation to face goal
    if (shootingTeam === 'red') {
      this.currentShooter.setRotation({ x: 0, y: 0, z: 0, w: 1 }); // Face +X
    } else {
      this.currentShooter.setRotation({ x: 0, y: 1, z: 0, w: 0 }); // Face -X
    }

    // Position goalkeeper
    this.currentGoalkeeper.setPosition(goalkeeperPos);
    this.currentGoalkeeper.setLinearVelocity({ x: 0, y: 0, z: 0 });
    this.currentGoalkeeper.setAngularVelocity({ x: 0, y: 0, z: 0 });
    this.currentGoalkeeper.unfreeze(); // Goalkeeper can dive

    // Set goalkeeper rotation to face shooter
    if (shootingTeam === 'red') {
      this.currentGoalkeeper.setRotation({ x: 0, y: 1, z: 0, w: 0 }); // Face -X
    } else {
      this.currentGoalkeeper.setRotation({ x: 0, y: 0, z: 0, w: 1 }); // Face +X
    }

    // Freeze all other players as spectators
    this.world.entityManager.getAllPlayerEntities().forEach((entity) => {
      if (entity instanceof SoccerPlayerEntity &&
          entity !== this.currentShooter &&
          entity !== this.currentGoalkeeper &&
          entity.isSpawned) {
        entity.freeze();
      }
    });

    // Position ball at penalty spot
    if (this.soccerBall.isSpawned) {
      this.soccerBall.despawn();
    }
    sharedState.setAttachedPlayer(null);

    const ballPos: Vector3Like = {
      x: penaltySpotX,
      y: SAFE_SPAWN_Y + 0.3, // Slightly elevated
      z: AI_FIELD_CENTER_Z
    };
    this.soccerBall.spawn(this.world, ballPos);
    this.soccerBall.setLinearVelocity({ x: 0, y: 0, z: 0 });
    this.soccerBall.setAngularVelocity({ x: 0, y: 0, z: 0 });

    console.log(`⚽ Positioned shooter at (${penaltySpotX.toFixed(1)}, ${AI_FIELD_CENTER_Z}), keeper at goal ${targetGoalX}`);
  }

  /**
   * Start the shot timer (30 seconds to take the shot)
   */
  private startShotTimer(): void {
    this.phase = 'shooting';
    this.shotHasBeenTaken = false;
    this.ballInitialPosition = this.soccerBall.position;

    // Clear any existing timers
    if (this.shotTimer) {
      clearTimeout(this.shotTimer);
    }
    if (this.ballMonitorInterval) {
      clearInterval(this.ballMonitorInterval);
    }

    // Start monitoring the ball every 100ms for out-of-bounds and saves
    this.ballMonitorInterval = setInterval(() => {
      this.monitorBallDuringShot();
    }, 100);

    // Start countdown
    this.shotTimer = setTimeout(() => {
      console.log("⏰ Shot timer expired - automatic miss");
      this.handleShotResult('missed');
    }, PENALTY_SHOOTOUT_CONFIG.shotTimeLimit * 1000);
  }

  /**
   * Monitor the ball during a shot for misses and saves
   * Called every 100ms during shooting phase
   */
  private monitorBallDuringShot(): void {
    if (!this.soccerBall.isSpawned || this.phase !== 'shooting') {
      return;
    }

    const ballPos = this.soccerBall.position;
    const ballVel = this.soccerBall.linearVelocity;

    // Check if ball has moved significantly (shot has been taken)
    if (!this.shotHasBeenTaken && this.ballInitialPosition) {
      const distanceMoved = Math.sqrt(
        Math.pow(ballPos.x - this.ballInitialPosition.x, 2) +
        Math.pow(ballPos.z - this.ballInitialPosition.z, 2)
      );

      // If ball moved more than 2 units, shot has been taken
      if (distanceMoved > 2) {
        this.shotHasBeenTaken = true;
        console.log('⚽ Shot detected - ball is moving!');
      }
    }

    // Only check for misses/saves if shot has been taken
    if (!this.shotHasBeenTaken) {
      return;
    }

    // Get field boundaries from game config
    const FIELD_MIN_X = -37;
    const FIELD_MAX_X = 52;
    const FIELD_MIN_Z = -33;
    const FIELD_MAX_Z = 26;
    const FIELD_MAX_Y = 15;
    const CROSSBAR_HEIGHT = 4.5;

    // Check for MISS - Ball out of bounds
    const isOutOfBounds =
      ballPos.x < FIELD_MIN_X ||
      ballPos.x > FIELD_MAX_X ||
      ballPos.z < FIELD_MIN_Z ||
      ballPos.z > FIELD_MAX_Z ||
      ballPos.y > CROSSBAR_HEIGHT || // Over crossbar
      ballPos.y < -1; // Underground

    if (isOutOfBounds) {
      console.log(`❌ MISS! Ball out of bounds at (${ballPos.x.toFixed(1)}, ${ballPos.y.toFixed(1)}, ${ballPos.z.toFixed(1)})`);
      this.handleShotResult('missed');
      return;
    }

    // Check for SAVE - Goalkeeper collision with ball
    if (this.currentGoalkeeper && this.currentGoalkeeper.isSpawned) {
      const keeperPos = this.currentGoalkeeper.position;

      // Calculate distance between ball and goalkeeper
      const distanceToKeeper = Math.sqrt(
        Math.pow(ballPos.x - keeperPos.x, 2) +
        Math.pow(ballPos.y - keeperPos.y, 2) +
        Math.pow(ballPos.z - keeperPos.z, 2)
      );

      // If ball is very close to keeper (within 1.5 units), it's a save
      // AND ball velocity has changed direction (keeper touched it)
      if (distanceToKeeper < 1.5) {
        // Check if ball is moving away from goal (keeper deflected it)
        const shootingTeam = this.currentShootingTeam!;
        const targetGoalX = shootingTeam === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;

        // If ball is moving away from goal or velocity is low, keeper saved it
        const movingTowardGoal = shootingTeam === 'red' ? ballVel.x > 0 : ballVel.x < 0;
        const ballSpeed = Math.sqrt(ballVel.x * ballVel.x + ballVel.y * ballVel.y + ballVel.z * ballVel.z);

        if (!movingTowardGoal || ballSpeed < 2) {
          console.log(`🧤 SAVE! Goalkeeper ${this.currentGoalkeeper.player.username} stops the ball!`);
          this.handleShotResult('saved');
          return;
        }
      }
    }

    // Check if ball has stopped moving (no goal, no save = miss)
    const ballSpeed = Math.sqrt(ballVel.x * ballVel.x + ballVel.y * ballVel.y + ballVel.z * ballVel.z);
    if (ballSpeed < 0.5 && this.shotHasBeenTaken) {
      // Ball has stopped before reaching goal - miss
      const shootingTeam = this.currentShootingTeam!;
      const targetGoalX = shootingTeam === 'red' ? AI_GOAL_LINE_X_BLUE : AI_GOAL_LINE_X_RED;

      // Check if ball is far from goal (stopped before reaching)
      const distanceToGoal = Math.abs(ballPos.x - targetGoalX);

      if (distanceToGoal > 5) {
        console.log(`❌ MISS! Ball stopped ${distanceToGoal.toFixed(1)} units from goal`);
        this.handleShotResult('missed');
        return;
      }
    }
  }

  /**
   * Handle the result of a penalty shot
   * This will be called by goal detection system, miss detection, or timeout
   */
  public handleShotResult(result: ShotResult): void {
    if (!this.isActive || this.phase !== 'shooting') return;

    // Clear shot timer and ball monitor
    if (this.shotTimer) {
      clearTimeout(this.shotTimer);
      this.shotTimer = null;
    }
    if (this.ballMonitorInterval) {
      clearInterval(this.ballMonitorInterval);
      this.ballMonitorInterval = null;
    }

    this.phase = 'result';

    const team = this.currentShootingTeam!;
    const currentRound = this.rounds[this.rounds.length - 1];

    // Record result
    if (team === 'red') {
      currentRound.redResult = result;
    } else {
      currentRound.blueResult = result;
    }

    // Update score if goal
    if (result === 'goal') {
      this.score[team]++;
    }

    // Announce result
    const shooterName = this.currentShooter!.player.username;
    let resultMessage = '';

    switch (result) {
      case 'goal':
        resultMessage = `⚽ GOAL! ${shooterName} scores for ${team.toUpperCase()} team!`;
        break;
      case 'saved':
        resultMessage = `🧤 SAVED! ${this.currentGoalkeeper!.player.username} denies ${shooterName}!`;
        break;
      case 'missed':
        resultMessage = `❌ MISS! ${shooterName} sends it wide!`;
        break;
    }

    this.world.chatManager.sendBroadcastMessage(resultMessage);
    console.log(`⚽ ${team} penalty result: ${result}`);

    // Send UI update
    this.sendUIUpdate({
      type: "penalty-shot-result",
      result,
      shooter: shooterName,
      team,
      score: this.score
    });

    // Wait for celebration/result display, then continue
    setTimeout(() => {
      this.continueShootout();
    }, PENALTY_SHOOTOUT_CONFIG.celebrationDelay);
  }

  /**
   * Continue to next shot or finish round
   */
  private continueShootout(): void {
    if (!this.isActive) return;

    const currentRound = this.rounds[this.rounds.length - 1];

    // Check if both teams have shot in this round
    if (currentRound.redResult !== null && currentRound.blueResult !== null) {
      // Round complete - check if shootout is over
      this.checkShootoutEnd();
    } else if (currentRound.redResult !== null && currentRound.blueResult === null) {
      // Red has shot, now blue's turn
      setTimeout(() => {
        this.setupShot('blue');
      }, PENALTY_SHOOTOUT_CONFIG.roundTransitionDelay);
    } else {
      // This shouldn't happen, but handle it
      console.error("⚠️ Unexpected shootout state");
      this.end();
    }
  }

  /**
   * Check if penalty shootout should end
   */
  private checkShootoutEnd(): void {
    const roundsCompleted = this.currentRound;
    const standardRounds = PENALTY_SHOOTOUT_CONFIG.standardRounds;

    // After standard rounds (5), check if we have a winner
    if (roundsCompleted >= standardRounds) {
      const redScore = this.score.red;
      const blueScore = this.score.blue;

      // Check for clear winner
      if (redScore > blueScore) {
        this.declareWinner('red');
        return;
      } else if (blueScore > redScore) {
        this.declareWinner('blue');
        return;
      }

      // Tie after standard rounds - go to sudden death
      if (roundsCompleted === standardRounds) {
        this.world.chatManager.sendBroadcastMessage("⚽ Still tied after 5 rounds - SUDDEN DEATH!");
        this.sendUIUpdate({
          type: "penalty-sudden-death",
          message: "Sudden Death - Next score wins!",
          score: this.score
        });
      } else {
        // In sudden death, check if someone scored and other didn't
        const lastRound = this.rounds[this.rounds.length - 1];
        if (lastRound.redResult === 'goal' && lastRound.blueResult !== 'goal') {
          this.declareWinner('red');
          return;
        } else if (lastRound.blueResult === 'goal' && lastRound.redResult !== 'goal') {
          this.declareWinner('blue');
          return;
        }
      }
    }

    // Continue to next round
    this.currentRound++;
    setTimeout(() => {
      this.startRound();
    }, PENALTY_SHOOTOUT_CONFIG.roundTransitionDelay);
  }

  /**
   * Declare the winner of the penalty shootout
   */
  private declareWinner(winner: 'red' | 'blue'): void {
    console.log(`⚽ PENALTY SHOOTOUT WINNER: ${winner.toUpperCase()} TEAM!`);

    const finalScore = `${this.score.red} - ${this.score.blue}`;
    this.world.chatManager.sendBroadcastMessage(`⚽ ${winner.toUpperCase()} TEAM WINS THE PENALTY SHOOTOUT!`);
    this.world.chatManager.sendBroadcastMessage(`Final Score: Red ${this.score.red} - ${this.score.blue} Blue`);

    // Send UI update
    this.sendUIUpdate({
      type: "penalty-shootout-end",
      winner,
      finalScore: this.score,
      rounds: this.rounds.length,
      message: `${winner.toUpperCase()} TEAM WINS!`
    });

    // End shootout after celebration
    setTimeout(() => {
      this.end();
    }, 5000);
  }

  /**
   * End the penalty shootout and return to normal
   */
  public end(): void {
    console.log("⚽ Ending penalty shootout");

    this.isActive = false;
    this.phase = 'finished';

    // Clear timers
    if (this.shotTimer) {
      clearTimeout(this.shotTimer);
      this.shotTimer = null;
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.ballMonitorInterval) {
      clearInterval(this.ballMonitorInterval);
      this.ballMonitorInterval = null;
    }

    // Stop tension music
    if (PENALTY_SHOOTOUT_CONFIG.tensionMusic) {
      this.tensionAudio.pause();
    }

    // Unfreeze all players
    this.world.entityManager.getAllPlayerEntities().forEach((entity) => {
      if (entity instanceof SoccerPlayerEntity && entity.isSpawned) {
        entity.unfreeze();
      }
    });

    // Reset shooting references
    this.currentShooter = null;
    this.currentGoalkeeper = null;
    this.currentShootingTeam = null;

    // Switch back to FIFA mode (or keep in finished state)
    // Note: The game should be reset via "Back to Lobby" after this
  }

  /**
   * Send UI update to all players
   */
  private sendUIUpdate(data: any): void {
    this.world.entityManager.getAllPlayerEntities().forEach((entity) => {
      if (entity instanceof PlayerEntity) {
        try {
          entity.player.ui.sendData(data);
        } catch (e) {
          // Ignore if player disconnected
        }
      }
    });
  }

  /**
   * Get current shootout state (for UI display)
   */
  public getState() {
    return {
      isActive: this.isActive,
      phase: this.phase,
      currentRound: this.currentRound,
      score: this.score,
      rounds: this.rounds,
      currentShootingTeam: this.currentShootingTeam,
      shooterName: this.currentShooter?.player.username || null,
      goalkeeperName: this.currentGoalkeeper?.player.username || null
    };
  }

  /**
   * Check if penalty shootout is currently active
   */
  public isShootoutActive(): boolean {
    return this.isActive;
  }
}
