/**
 * KickoffService
 *
 * Manages ball positioning, kickoffs, and all restart scenarios.
 * Handles throw-ins, corner kicks, goal kicks, and player positioning.
 */

import type { World, Entity, PlayerEntity, Vector3Like } from "hytopia";
import type { EventBus } from "../core/EventBus";
import SoccerPlayerEntity from "../entities/SoccerPlayerEntity";
import {
  AI_FIELD_CENTER_X,
  AI_FIELD_CENTER_Z,
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  FIELD_MIN_X,
  FIELD_MAX_X,
  FIELD_MIN_Z,
  FIELD_MAX_Z,
  SAFE_SPAWN_Y
} from "../state/gameConfig";
import sharedState from "../state/sharedState";

export interface OutOfBoundsData {
  side: string;
  position: { x: number; y: number; z: number };
  lastPlayer: PlayerEntity | null;
}

export class KickoffService {
  constructor(
    private world: World,
    private eventBus: EventBus,
    private soccerBall: Entity
  ) {}

  /**
   * Perform kickoff positioning for all players
   * @param kickoffTeam - Team that gets to kick off
   * @param reason - Reason for kickoff (for logging)
   */
  public performKickoff(kickoffTeam: "red" | "blue", reason: string = "restart"): void {
    console.log(`⚽ Setting up kickoff for ${kickoffTeam} team (${reason})`);

    // Reset ball to center
    this.resetBallToCenter();

    // Position all players
    this.positionPlayersForKickoff(kickoffTeam);

    // Emit kickoff-ready event
    this.eventBus.emit('kickoff-ready', { team: kickoffTeam, reason });

    console.log(`✅ Kickoff positioning complete for ${kickoffTeam} team`);
  }

  /**
   * Reset ball to center of field
   */
  public resetBallToCenter(): void {
    // Despawn ball if needed
    if (this.soccerBall.isSpawned) {
      this.soccerBall.despawn();
    }
    sharedState.setAttachedPlayer(null);

    // Spawn at center
    const centerPosition = {
      x: AI_FIELD_CENTER_X,
      y: SAFE_SPAWN_Y,
      z: AI_FIELD_CENTER_Z
    };

    this.soccerBall.spawn(this.world, centerPosition);
    this.soccerBall.setLinearVelocity({ x: 0, y: 0, z: 0 });
    this.soccerBall.setAngularVelocity({ x: 0, y: 0, z: 0 });

    // Set lockout to prevent false goals
    const { setBallResetLockout } = require('../utils/ball');
    setBallResetLockout();
    this.soccerBall.wakeUp();

    // Reset ball movement tracking
    sharedState.resetBallMovementFlag();
  }

  /**
   * Reset ball to a specific position
   * @param position - Position to reset ball to
   */
  public resetBallToPosition(position: Vector3Like): void {
    // Despawn ball if needed
    if (this.soccerBall.isSpawned) {
      this.soccerBall.despawn();
    }
    sharedState.setAttachedPlayer(null);

    // Spawn at position
    this.soccerBall.spawn(this.world, position);
    this.soccerBall.setLinearVelocity({ x: 0, y: 0, z: 0 });
    this.soccerBall.setAngularVelocity({ x: 0, y: 0, z: 0 });

    // Set lockout to prevent false goals
    const { setBallResetLockout } = require('../utils/ball');
    setBallResetLockout();

    // Reset ball movement tracking
    sharedState.resetBallMovementFlag();
  }

  /**
   * Handle throw-in after ball goes out on sideline
   * @param data - Out of bounds data
   */
  public handleThrowIn(data: OutOfBoundsData): void {
    console.log("📥 Handling throw-in:", data);

    // Determine which team gets the throw-in (opposite of last touch)
    let throwInTeam: "red" | "blue";

    if (data.lastPlayer && data.lastPlayer instanceof SoccerPlayerEntity) {
      // Give throw-in to opposing team
      throwInTeam = data.lastPlayer.team === "red" ? "blue" : "red";
      console.log(`${data.lastPlayer.team} team last touched, throw-in to ${throwInTeam}`);
    } else {
      // Fallback: random assignment
      throwInTeam = Math.random() < 0.5 ? "red" : "blue";
      console.log(`Unknown last touch, randomly assigning throw-in to ${throwInTeam}`);
    }

    // Calculate throw-in position
    const throwInPosition = this.calculateThrowInPosition(data.side, data.position);

    // Notify players
    this.world.chatManager.sendBroadcastMessage(
      `Throw-in to ${throwInTeam.toUpperCase()} team.`
    );

    // Reset ball
    this.resetBallToPosition(throwInPosition);

    // Emit event
    this.eventBus.emit('throw-in', {
      team: throwInTeam,
      position: throwInPosition
    });
  }

  /**
   * Handle ball going out over goal line (corner kick or goal kick)
   * @param data - Out of bounds data
   */
  public handleGoalLineOut(data: OutOfBoundsData): void {
    console.log("📍 Handling goal line out:", data);

    const crossedRedGoalLine = data.side === "min-x"; // Red defends min-x side
    const crossedBlueGoalLine = data.side === "max-x"; // Blue defends max-x side

    if (data.lastPlayer && data.lastPlayer instanceof SoccerPlayerEntity) {
      const lastTouchTeam = data.lastPlayer.team;

      if (crossedRedGoalLine) {
        if (lastTouchTeam === "red") {
          // Red touched, crossed red goal line = Corner kick for blue
          this.handleCornerKick("blue", data);
        } else {
          // Blue touched, crossed red goal line = Goal kick for red
          this.handleGoalKick("red");
        }
      } else if (crossedBlueGoalLine) {
        if (lastTouchTeam === "blue") {
          // Blue touched, crossed blue goal line = Corner kick for red
          this.handleCornerKick("red", data);
        } else {
          // Red touched, crossed blue goal line = Goal kick for blue
          this.handleGoalKick("blue");
        }
      } else {
        // Unexpected case - reset to center
        console.warn("⚠️ Unexpected goal line crossing");
        this.resetBallToCenter();
      }
    } else {
      // No clear last touch - goal kick for defending team
      const defendingTeam = crossedRedGoalLine ? "red" : "blue";
      console.log(`No clear last touch, goal kick for defending team: ${defendingTeam}`);
      this.handleGoalKick(defendingTeam);
    }
  }

  /**
   * Handle corner kick
   * @param team - Team getting the corner kick
   * @param data - Out of bounds data
   */
  private handleCornerKick(team: "red" | "blue", data: OutOfBoundsData): void {
    console.log(`⚽ Corner kick for ${team} team`);

    const cornerPosition = this.calculateCornerPosition(data.side, data.position);

    this.world.chatManager.sendBroadcastMessage(
      `Corner kick to ${team.toUpperCase()} team!`
    );

    this.resetBallToPosition(cornerPosition);

    // Emit event
    this.eventBus.emit('corner-kick', {
      team,
      position: cornerPosition
    });
  }

  /**
   * Handle goal kick
   * @param team - Team getting the goal kick
   */
  private handleGoalKick(team: "red" | "blue"): void {
    console.log(`🥅 Goal kick for ${team} team`);

    const goalKickPosition = this.calculateGoalKickPosition(team);

    this.world.chatManager.sendBroadcastMessage(
      `Goal kick to ${team.toUpperCase()} team!`
    );

    this.resetBallToPosition(goalKickPosition);

    // Emit event
    this.eventBus.emit('goal-kick', {
      team,
      position: goalKickPosition
    });
  }

  /**
   * Calculate throw-in position along sideline
   */
  private calculateThrowInPosition(side: string, outPosition: { x: number; y: number; z: number }): Vector3Like {
    let throwInX: number;
    let throwInZ: number;

    if (side === "min-z") {
      // Ball went out on min-z sideline (bottom)
      throwInX = Math.max(FIELD_MIN_X + 5, Math.min(FIELD_MAX_X - 5, outPosition.x));
      throwInZ = FIELD_MIN_Z + 2; // Slightly inside field
    } else if (side === "max-z") {
      // Ball went out on max-z sideline (top)
      throwInX = Math.max(FIELD_MIN_X + 5, Math.min(FIELD_MAX_X - 5, outPosition.x));
      throwInZ = FIELD_MAX_Z - 2; // Slightly inside field
    } else {
      // Fallback to center
      throwInX = AI_FIELD_CENTER_X;
      throwInZ = AI_FIELD_CENTER_Z;
    }

    return {
      x: throwInX,
      y: 1.5, // Slightly elevated
      z: throwInZ
    };
  }

  /**
   * Calculate corner kick position
   */
  private calculateCornerPosition(goalLineSide: string, outPosition: { x: number; y: number; z: number }): Vector3Like {
    let cornerX: number;
    let cornerZ: number;

    if (goalLineSide === "min-x") {
      // Red goal line
      cornerX = FIELD_MIN_X + 1; // Slightly inside field
      cornerZ = outPosition.z > AI_FIELD_CENTER_Z ? FIELD_MAX_Z - 1 : FIELD_MIN_Z + 1;
    } else {
      // Blue goal line
      cornerX = FIELD_MAX_X - 1; // Slightly inside field
      cornerZ = outPosition.z > AI_FIELD_CENTER_Z ? FIELD_MAX_Z - 1 : FIELD_MIN_Z + 1;
    }

    return {
      x: cornerX,
      y: 1.5, // Slightly elevated
      z: cornerZ
    };
  }

  /**
   * Calculate goal kick position in penalty area
   */
  private calculateGoalKickPosition(kickingTeam: "red" | "blue"): Vector3Like {
    const GOAL_KICK_OFFSET = 8; // Distance from goal line

    let goalKickX: number;

    if (kickingTeam === "red") {
      goalKickX = AI_GOAL_LINE_X_RED + GOAL_KICK_OFFSET;
    } else {
      goalKickX = AI_GOAL_LINE_X_BLUE - GOAL_KICK_OFFSET;
    }

    return {
      x: goalKickX,
      y: 1.5, // Slightly elevated
      z: AI_FIELD_CENTER_Z // Center of goal area
    };
  }

  /**
   * Position all players for kickoff
   * @param kickoffTeam - Team that gets to kick off
   */
  private positionPlayersForKickoff(kickoffTeam: "red" | "blue"): void {
    // Freeze all players during positioning
    this.world.entityManager.getAllPlayerEntities().forEach((entity) => {
      if (entity instanceof SoccerPlayerEntity) {
        entity.freeze();
      }
    });

    // Position players (this would need access to player positioning logic)
    // For now, just emit an event that the game state can handle
    this.eventBus.emit('kickoff-ready', {
      team: kickoffTeam,
      reason: 'positioning'
    });
  }

  /**
   * Unfreeze all players (after kickoff countdown)
   */
  public unfreezeAllPlayers(): void {
    this.world.entityManager.getAllPlayerEntities().forEach((entity) => {
      if (entity instanceof SoccerPlayerEntity) {
        entity.unfreeze();
      }
    });
    console.log("✅ All players unfrozen");
  }

  /**
   * Freeze all players (during positioning)
   */
  public freezeAllPlayers(): void {
    this.world.entityManager.getAllPlayerEntities().forEach((entity) => {
      if (entity instanceof SoccerPlayerEntity) {
        entity.freeze();
      }
    });
    console.log("❄️ All players frozen");
  }

  /**
   * Get ball position
   */
  public getBallPosition(): Vector3Like | null {
    if (!this.soccerBall.isSpawned) {
      return null;
    }
    return { ...this.soccerBall.position };
  }

  /**
   * Check if ball is at center
   */
  public isBallAtCenter(): boolean {
    const pos = this.getBallPosition();
    if (!pos) return false;

    const dx = Math.abs(pos.x - AI_FIELD_CENTER_X);
    const dz = Math.abs(pos.z - AI_FIELD_CENTER_Z);

    return dx < 1 && dz < 1; // Within 1 unit of center
  }

  /**
   * Get field bounds
   */
  public getFieldBounds(): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  } {
    return {
      minX: FIELD_MIN_X,
      maxX: FIELD_MAX_X,
      minZ: FIELD_MIN_Z,
      maxZ: FIELD_MAX_Z
    };
  }
}
