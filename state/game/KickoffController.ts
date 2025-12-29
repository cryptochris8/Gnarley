// Kickoff positioning and coin toss logic

import { World, Entity, type Vector3Like } from "hytopia";
import SoccerPlayerEntity from "../../entities/SoccerPlayerEntity";
import AIPlayerEntity from "../../entities/AIPlayerEntity";
import {
  AI_FIELD_CENTER_X,
  AI_FIELD_CENTER_Z,
  SAFE_SPAWN_Y,
  AI_GOAL_LINE_X_RED,
  AI_GOAL_LINE_X_BLUE,
  BALL_SPAWN_POSITION
} from "../gameConfig";
import sharedState from "../sharedState";
import type { RoomSharedState } from "../RoomSharedState";

export class KickoffController {
  private world: World;
  private soccerBall: Entity;
  private kickoffTeam: "red" | "blue" | null = null;
  private roomState: RoomSharedState | null = null;

  constructor(world: World, soccerBall: Entity, roomState?: RoomSharedState) {
    this.world = world;
    this.soccerBall = soccerBall;
    this.roomState = roomState || null;
    console.log("KickoffController initialized", roomState ? `for room ${roomState.getRoomId()}` : "");
  }

  /** Get the correct shared state (room or global) */
  private getState() {
    return this.roomState || sharedState;
  }

  /**
   * Perform coin toss to determine kickoff team
   * @param playerChoice - Optional player choice
   * @returns Kickoff team
   */
  performCoinToss(playerChoice?: { playerId: string, choice: "heads" | "tails", playerTeam: "red" | "blue" | null }): "red" | "blue" {
    const coinResult = Math.random() < 0.5 ? "heads" : "tails";
    let kickoffTeam: "red" | "blue";

    if (playerChoice) {
      const playerWon = playerChoice.choice === coinResult;
      const playerTeam = playerChoice.playerTeam;

      if (playerWon && playerTeam) {
        kickoffTeam = playerTeam;
      } else {
        kickoffTeam = playerTeam === "red" ? "blue" : "red";
      }
    } else {
      kickoffTeam = Math.random() < 0.5 ? "red" : "blue";
    }

    this.kickoffTeam = kickoffTeam;
    return kickoffTeam;
  }

  /**
   * Get current kickoff team
   * @returns Kickoff team or null
   */
  getKickoffTeam(): "red" | "blue" | null {
    return this.kickoffTeam;
  }

  /**
   * Set kickoff team
   * @param team - Team to set as kickoff team
   */
  setKickoffTeam(team: "red" | "blue"): void {
    this.kickoffTeam = team;
  }

  /**
   * Perform kickoff positioning for all players
   * @param kickoffTeam - Team taking kickoff
   * @param reason - Reason for kickoff
   */
  performKickoffPositioning(kickoffTeam: "red" | "blue", reason: string = "restart"): void {
    console.log(`Setting up kickoff positioning for ${kickoffTeam} team (${reason})`);

    this.kickoffTeam = kickoffTeam;

    // Reset ball position
    if (this.soccerBall.isSpawned) {
      this.soccerBall.despawn();
    }
    this.getState().setAttachedPlayer(null);

    const adjustedSpawnPosition = {
      x: AI_FIELD_CENTER_X,
      y: SAFE_SPAWN_Y,
      z: AI_FIELD_CENTER_Z
    };
    this.soccerBall.spawn(this.world, adjustedSpawnPosition);
    this.soccerBall.setLinearVelocity({ x: 0, y: 0, z: 0 });
    this.soccerBall.setAngularVelocity({ x: 0, y: 0, z: 0 });

    // Set goal detection lockout
    const { setBallResetLockout } = require('../../utils/ball');
    setBallResetLockout();
    this.soccerBall.wakeUp();

    this.getState().resetBallMovementFlag();

    // Position all players
    this.world.entityManager.getAllPlayerEntities().forEach((entity) => {
      if (entity instanceof SoccerPlayerEntity) {
        this.positionPlayerForKickoff(entity, kickoffTeam);
      }
    });

    // Setup AI players for kickoff
    this.setupAIPlayersForKickoff(kickoffTeam);

    console.log(`Kickoff positioning complete for ${kickoffTeam} team`);
  }

  /**
   * Position a single player for kickoff
   * @param player - Player to position
   * @param kickoffTeam - Team taking kickoff
   */
  private positionPlayerForKickoff(player: SoccerPlayerEntity, kickoffTeam: "red" | "blue"): void {
    const isKickoffTeam = player.team === kickoffTeam;
    const isHumanPlayer = !(player instanceof AIPlayerEntity);

    let targetPosition: Vector3Like;

    if (isKickoffTeam) {
      // Kickoff team positioning
      if (player instanceof AIPlayerEntity && player.aiRole === 'central-midfielder-1') {
        targetPosition = {
          x: AI_FIELD_CENTER_X + (kickoffTeam === 'red' ? 2 : -2),
          y: SAFE_SPAWN_Y,
          z: AI_FIELD_CENTER_Z
        };
      } else if (isHumanPlayer && player.role === 'central-midfielder-1') {
        targetPosition = {
          x: AI_FIELD_CENTER_X + (kickoffTeam === 'red' ? 2 : -2),
          y: SAFE_SPAWN_Y,
          z: AI_FIELD_CENTER_Z
        };
      } else {
        targetPosition = this.getKickoffHalfPosition(player, kickoffTeam, true);
      }
    } else {
      // Defending team positioning
      if (player instanceof AIPlayerEntity && player.aiRole === 'central-midfielder-1') {
        targetPosition = {
          x: AI_FIELD_CENTER_X + (kickoffTeam === 'red' ? -12 : 12),
          y: SAFE_SPAWN_Y,
          z: AI_FIELD_CENTER_Z
        };
      } else if (isHumanPlayer && player.role === 'central-midfielder-1') {
        targetPosition = {
          x: AI_FIELD_CENTER_X + (kickoffTeam === 'red' ? -12 : 12),
          y: SAFE_SPAWN_Y,
          z: AI_FIELD_CENTER_Z
        };
      } else {
        targetPosition = this.getKickoffHalfPosition(player, kickoffTeam, false);
      }
    }

    // Apply position
    player.setLinearVelocity({ x: 0, y: 0, z: 0 });
    player.setAngularVelocity({ x: 0, y: 0, z: 0 });
    player.setPosition(targetPosition);
    player.wakeUp();
    player.freeze();
  }

  /**
   * Get kickoff half position for player
   * @param player - Player entity
   * @param kickoffTeam - Team taking kickoff
   * @param isKickoffTeam - Whether player is on kickoff team
   * @returns Position
   */
  private getKickoffHalfPosition(player: SoccerPlayerEntity, kickoffTeam: "red" | "blue", isKickoffTeam: boolean): Vector3Like {
    const playerTeam = player.team;
    const inOwnHalf = playerTeam === 'red' ?
      (AI_FIELD_CENTER_X + 5) :
      (AI_FIELD_CENTER_X - 5);

    let basePosition: Vector3Like;

    if (player instanceof AIPlayerEntity) {
      const rolePosition = this.getRoleBasedPositionForTeam(player.aiRole, playerTeam);

      let adjustedX = rolePosition.x;
      if (playerTeam === 'red' && adjustedX < AI_FIELD_CENTER_X + 5) {
        adjustedX = AI_FIELD_CENTER_X + 8;
      } else if (playerTeam === 'blue' && adjustedX > AI_FIELD_CENTER_X - 5) {
        adjustedX = AI_FIELD_CENTER_X - 8;
      }

      basePosition = {
        x: adjustedX,
        y: SAFE_SPAWN_Y,
        z: rolePosition.z
      };
    } else {
      basePosition = {
        x: inOwnHalf,
        y: SAFE_SPAWN_Y,
        z: AI_FIELD_CENTER_Z
      };
    }

    return basePosition;
  }

  /**
   * Get role-based position for team
   * @param role - Player role
   * @param team - Team
   * @returns Position
   */
  private getRoleBasedPositionForTeam(role: string, team: "red" | "blue"): Vector3Like {
    const isRed = team === 'red';
    const ownGoalLineX = isRed ? AI_GOAL_LINE_X_RED : AI_GOAL_LINE_X_BLUE;
    const forwardXMultiplier = isRed ? -1 : 1;

    let x = 0, z = AI_FIELD_CENTER_Z;

    switch (role) {
      case 'goalkeeper':
        x = ownGoalLineX + (1 * forwardXMultiplier);
        break;
      case 'left-back':
        x = ownGoalLineX + (12 * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z - 15;
        break;
      case 'right-back':
        x = ownGoalLineX + (12 * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z + 15;
        break;
      case 'central-midfielder-1':
        x = ownGoalLineX + (34 * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z - 8;
        break;
      case 'central-midfielder-2':
        x = ownGoalLineX + (34 * forwardXMultiplier);
        z = AI_FIELD_CENTER_Z + 8;
        break;
      case 'striker':
        x = ownGoalLineX + (43 * forwardXMultiplier);
        break;
      default:
        x = ownGoalLineX + (34 * forwardXMultiplier);
        break;
    }

    return { x, y: SAFE_SPAWN_Y, z };
  }

  /**
   * Setup AI players for kickoff behavior
   * @param kickoffTeam - Team taking kickoff
   */
  private setupAIPlayersForKickoff(kickoffTeam: "red" | "blue"): void {
    const currentAIPlayers = this.world.entityManager.getAllPlayerEntities()
      .filter(entity => entity instanceof AIPlayerEntity) as AIPlayerEntity[];

    currentAIPlayers.forEach(ai => {
      if (ai.isSpawned) {
        if (ai.team === kickoffTeam && ai.aiRole === 'central-midfielder-1') {
          ai.setRestartBehavior('pass-to-teammates');
        } else {
          ai.setRestartBehavior('normal');
        }
        ai.activate();
      }
    });
  }

  /**
   * Reset kickoff team
   */
  reset(): void {
    this.kickoffTeam = null;
  }
}
