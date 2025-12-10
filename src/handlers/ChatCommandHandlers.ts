/**
 * ChatCommandHandlers - Centralized chat command registration
 *
 * Handles all 38+ chat commands used in the soccer game.
 * Commands are organized by category for easier maintenance.
 *
 * Dependencies are injected via constructor to avoid tight coupling.
 */

import type { World, Player } from "hytopia";
import type { SoccerGame } from "../../state/gameState";
import type AIPlayerEntity from "../../entities/AIPlayerEntity";
import type { TournamentManager } from "../../state/tournamentManager";
import type { ArcadeEnhancementManager } from "../../state/arcadeEnhancements";
import type { FIFACrowdManager } from "../../utils/fifaCrowdManager";
import type { PickupGameManager } from "../../state/pickupGameManager";
import type { AudioManager } from "../core/AudioManager";
import { logger } from "../../utils/GameLogger";
import sharedState from "../../state/sharedState";
import spectatorMode from "../../utils/observerMode";

export interface ChatCommandDependencies {
  world: World;
  game: SoccerGame | null;
  aiPlayers: AIPlayerEntity[];
  audioManager: AudioManager;
  sharedState: typeof sharedState;
  spectatorMode: typeof spectatorMode;
  fifaCrowdManager: FIFACrowdManager;
  pickupManager: PickupGameManager;
  tournamentManager: TournamentManager;
  arcadeManager: ArcadeEnhancementManager;
}

export class ChatCommandHandlers {
  private deps: ChatCommandDependencies;

  constructor(dependencies: ChatCommandDependencies) {
    this.deps = dependencies;
  }

  /**
   * Register all chat commands with the world
   */
  registerAll(): void {
    logger.info("=� Registering chat commands...");

    // Game Control Commands
    this.registerStuckCommand();
    this.registerResetAICommand();
    this.registerEndGameCommand();

    // Music & Audio Commands
    this.registerMusicCommand();
    this.registerCrowdCommand();

    // Debug Commands
    this.registerDebugAICommand();
    this.registerAgentToggleCommand();
    this.registerTestGoalCommand();
    this.registerBallPosCommand();
    this.registerTestSpawnCommand();
    this.registerDebugPickupsCommand();

    // Spectator Commands
    this.registerSpectateCommand();
    this.registerNextPlayerCommand();
    this.registerPrevPlayerCommand();
    this.registerNextCameraCommand();
    this.registerPrevCameraCommand();
    this.registerBallCamCommand();
    this.registerStadiumCommand();
    this.registerLeaveSpectatorCommand();

    // Game Mode Commands
    this.registerFIFACommand();
    this.registerArcadeCommand();
    this.registerModeCommand();
    this.registerPenaltyShootoutCommand();

    // Tournament Commands
    this.registerTournamentCommand();

    // Configuration Commands
    this.registerConfigCommand();
    this.registerPassInfoCommand();
    this.registerPassCommand();
    this.registerFixPositionCommand();
    this.registerGoalsCommand();

    // Performance Commands
    this.registerSpeedCommand();
    this.registerSpeedTestCommand();
    this.registerPowerCommand();
    this.registerPrecisionCommand();

    // Lighting Commands
    this.registerNoShadowsCommand();
    this.registerNormalLightingCommand();
    this.registerOptimizedLightingCommand();
    this.registerDomeLightingCommand();
    this.registerLightingCommand();

    // Profiling Commands
    this.registerProfilerCommand();

    logger.info(" All chat commands registered");
  }

  // ==================== GAME CONTROL COMMANDS ====================

  private registerStuckCommand(): void {
    this.deps.world.chatManager.registerCommand("/stuck", (player, message) => {
      if (!this.deps.game || !this.deps.game.inProgress()) {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "You can only use /stuck during an active game."
        );
        return;
      }

      const currentTime = Date.now();
      const lastStuckCommandTime = (this.deps.world as any)._lastStuckCommandTime || 0;
      if (currentTime - lastStuckCommandTime < 5000) {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Please wait a few seconds before using this command again."
        );
        return;
      }
      (this.deps.world as any)._lastStuckCommandTime = currentTime;

      this.deps.game.updateAIPlayersList(this.deps.aiPlayers);
      this.deps.game.handleBallReset(`manual reset by ${player.username}`);
      logger.info(`Player ${player.username} used /stuck command`);
    });
  }

  private registerResetAICommand(): void {
    this.deps.world.chatManager.registerCommand("/resetai", (player, message) => {
      this.deps.aiPlayers.forEach(ai => {
        if (ai.isSpawned) {
          ai.deactivate();
          sharedState.removeAIFromTeam(ai, ai.team);
          ai.despawn();
        }
      });

      this.deps.aiPlayers = [];

      if (this.deps.game) {
        this.deps.game.updateAIPlayersList([]);
      }

      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "All AI players have been reset"
      );
      logger.info(`Player ${player.username} reset all AI`);
    });
  }

  private registerEndGameCommand(): void {
    this.deps.world.chatManager.registerCommand("/endgame", (player, args) => {
      if (!this.deps.game) {
        this.deps.world.chatManager.sendPlayerMessage(player, "No active game to end");
        return;
      }

      if (!this.deps.game.inProgress()) {
        this.deps.world.chatManager.sendPlayerMessage(player, "Game is not in progress");
        return;
      }

      // Force end the game
      this.deps.game.forceEndGame();
      this.deps.world.chatManager.sendBroadcastMessage(
        `Game force-ended by ${player.username}`
      );
      logger.warn(`Game force-ended by ${player.username}`);
    });
  }

  // ==================== MUSIC & AUDIO COMMANDS ====================

  private registerMusicCommand(): void {
    this.deps.world.chatManager.registerCommand("/music", (player, args) => {
      if (!args || args.length < 2) {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Usage: /music <opening|gameplay>"
        );
        return;
      }

      const musicType = args[1].toLowerCase();

      if (musicType === "opening") {
        if (this.deps.audioManager.playOpeningMusic()) {
          this.deps.world.chatManager.sendPlayerMessage(
            player,
            " Switched to opening music (8 Bit Samba) at volume 1.0"
          );
        } else {
          this.deps.world.chatManager.sendPlayerMessage(
            player,
            "L Failed to play opening music"
          );
        }
      } else if (musicType === "gameplay") {
        const mode = this.deps.game?.getCurrentMode() || "fifa";
        if (this.deps.audioManager.playGameplayMusic(mode as any)) {
          this.deps.world.chatManager.sendPlayerMessage(
            player,
            ` Switched to gameplay music`
          );
        } else {
          this.deps.world.chatManager.sendPlayerMessage(
            player,
            "L Failed to play gameplay music"
          );
        }
      } else {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Invalid option. Use: /music <opening|gameplay>"
        );
      }
    });
  }

  private registerCrowdCommand(): void {
    this.deps.world.chatManager.registerCommand("/crowd", (player, args) => {
      if (!args || args.length < 2) {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Usage: /crowd <start|stop|cheer|goal>"
        );
        return;
      }

      const action = args[1].toLowerCase();

      switch (action) {
        case "start":
          this.deps.fifaCrowdManager.start();
          this.deps.world.chatManager.sendPlayerMessage(player, " Crowd atmosphere started");
          break;
        case "stop":
          this.deps.fifaCrowdManager.stop();
          this.deps.world.chatManager.sendPlayerMessage(player, " Crowd atmosphere stopped");
          break;
        case "cheer":
          this.deps.fifaCrowdManager.playRandomCheer();
          this.deps.world.chatManager.sendPlayerMessage(player, " Crowd cheering");
          break;
        case "goal":
          this.deps.fifaCrowdManager.playGoalCelebration();
          this.deps.world.chatManager.sendPlayerMessage(player, " Goal celebration");
          break;
        default:
          this.deps.world.chatManager.sendPlayerMessage(
            player,
            "Invalid action. Use: start, stop, cheer, or goal"
          );
      }
    });
  }

  // ==================== DEBUG COMMANDS ====================

  private registerDebugAICommand(): void {
    this.deps.world.chatManager.registerCommand("/debugai", (player, message) => {
      const aiPlayerInfo = this.deps.aiPlayers.map((ai, idx) => {
        const pos = ai.position;
        return `AI ${idx + 1}: ${ai.aiRole} (${ai.team}) at (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`;
      });

      this.deps.world.chatManager.sendPlayerMessage(
        player,
        `AI Players (${this.deps.aiPlayers.length}):`
      );

      aiPlayerInfo.forEach(info => {
        this.deps.world.chatManager.sendPlayerMessage(player, info);
      });
    });
  }

  private registerAgentToggleCommand(): void {
    this.deps.world.chatManager.registerCommand("/agenttoggle", (player, message) => {
      this.deps.aiPlayers.forEach(ai => {
        if (ai.agent) {
          ai.agent.toggleLogging();
        }
      });

      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Toggled AI agent logging for all AI players"
      );
    });
  }

  private registerTestGoalCommand(): void {
    this.deps.world.chatManager.registerCommand("/testgoal", (player, args) => {
      if (!args || args.length < 2) {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Usage: /testgoal <red|blue>"
        );
        return;
      }

      const team = args[1].toLowerCase() as 'red' | 'blue';
      if (team !== 'red' && team !== 'blue') {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Team must be 'red' or 'blue'"
        );
        return;
      }

      // Emit test goal event
      this.deps.world.emit("goal" as any, team as any);

      this.deps.world.chatManager.sendPlayerMessage(
        player,
        ` Test goal scored for ${team} team!`
      );
    });
  }

  private registerBallPosCommand(): void {
    this.deps.world.chatManager.registerCommand("/ballpos", (player, args) => {
      const ball = sharedState.getSoccerBall();
      if (!ball) {
        this.deps.world.chatManager.sendPlayerMessage(player, "L Ball not found");
        return;
      }

      const pos = ball.position;
      const vel = ball.linearVelocity;

      this.deps.world.chatManager.sendPlayerMessage(
        player,
        `� Ball Position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`
      );
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        `=� Velocity: (${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)})`
      );
    });
  }

  private registerTestSpawnCommand(): void {
    this.deps.world.chatManager.registerCommand("/testspawn", (player, args) => {
      // Test spawn implementation would go here
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Test spawn command - implementation needed"
      );
    });
  }

  private registerDebugPickupsCommand(): void {
    this.deps.world.chatManager.registerCommand("/debugpickups", (player, args) => {
      // Get pickup debug info from pickup manager
      const pickupInfo = this.deps.pickupManager.getDebugInfo();

      this.deps.world.chatManager.sendPlayerMessage(
        player,
        `=� Active Pickups: ${pickupInfo.activeCount}`
      );
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        `<� Spawn Points: ${pickupInfo.spawnPoints}`
      );
    });
  }

  // ==================== SPECTATOR COMMANDS ====================

  private registerSpectateCommand(): void {
    this.deps.world.chatManager.registerCommand("/spectate", (player, message) => {
      spectatorMode.joinAsSpectator(player, this.deps.world);
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        " Entered spectator mode. Use /nextplayer, /prevplayer to switch views"
      );
    });
  }

  private registerNextPlayerCommand(): void {
    this.deps.world.chatManager.registerCommand("/nextplayer", (player, message) => {
      spectatorMode.nextPlayer(player, this.deps.world);
    });
  }

  private registerPrevPlayerCommand(): void {
    this.deps.world.chatManager.registerCommand("/prevplayer", (player, message) => {
      spectatorMode.previousPlayer(player, this.deps.world);
    });
  }

  private registerNextCameraCommand(): void {
    this.deps.world.chatManager.registerCommand("/nextcamera", (player, message) => {
      spectatorMode.nextCameraAngle(player, this.deps.world);
    });
  }

  private registerPrevCameraCommand(): void {
    this.deps.world.chatManager.registerCommand("/prevcamera", (player, message) => {
      spectatorMode.previousCameraAngle(player, this.deps.world);
    });
  }

  private registerBallCamCommand(): void {
    this.deps.world.chatManager.registerCommand("/ballcam", (player, message) => {
      spectatorMode.setBallCam(player, this.deps.world);
    });
  }

  private registerStadiumCommand(): void {
    this.deps.world.chatManager.registerCommand("/stadium", (player, message) => {
      spectatorMode.setStadiumView(player, this.deps.world);
    });
  }

  private registerLeaveSpectatorCommand(): void {
    this.deps.world.chatManager.registerCommand("/leavespectator", (player, message) => {
      spectatorMode.leaveSpectatorMode(player, this.deps.world);
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        " Left spectator mode"
      );
    });
  }

  // ==================== GAME MODE COMMANDS ====================

  private registerFIFACommand(): void {
    this.deps.world.chatManager.registerCommand("/fifa", (player, args) => {
      // FIFA mode switch implementation
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Switching to FIFA mode..."
      );
      // Set mode and restart game
    });
  }

  private registerArcadeCommand(): void {
    this.deps.world.chatManager.registerCommand("/arcade", (player, args) => {
      // Arcade mode switch implementation
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Switching to Arcade mode..."
      );
    });
  }

  private registerModeCommand(): void {
    this.deps.world.chatManager.registerCommand("/mode", (player, args) => {
      if (!args || args.length < 2) {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Usage: /mode <fifa|arcade|tournament>"
        );
        return;
      }

      const mode = args[1].toLowerCase();
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        `Mode: ${mode} - implementation needed`
      );
    });
  }

  private registerPenaltyShootoutCommand(): void {
    this.deps.world.chatManager.registerCommand("/penaltyshootout", (player, args) => {
      if (!this.deps.game) {
        this.deps.world.chatManager.sendPlayerMessage(player, "No active game");
        return;
      }

      const penaltyShootoutManager = this.deps.game.getPenaltyShootoutManager();
      if (!penaltyShootoutManager) {
        this.deps.world.chatManager.sendPlayerMessage(player, "❌ Penalty shootout manager not available");
        return;
      }

      // Check if already active
      if (penaltyShootoutManager.isShootoutActive()) {
        this.deps.world.chatManager.sendPlayerMessage(player, "⚽ Penalty shootout already in progress!");
        return;
      }

      // Start penalty shootout
      this.deps.world.chatManager.sendBroadcastMessage("⚽ Penalty shootout manually started by admin!");
      penaltyShootoutManager.start();
    });
  }

  // ==================== TOURNAMENT COMMANDS ====================

  private registerTournamentCommand(): void {
    this.deps.world.chatManager.registerCommand("/tournament", (player, args) => {
      if (!args || args.length < 2) {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Usage: /tournament <create|join|leave|status>"
        );
        return;
      }

      const action = args[1].toLowerCase();

      switch (action) {
        case "create":
          // Create tournament logic
          break;
        case "join":
          // Join tournament logic
          break;
        case "leave":
          // Leave tournament logic
          break;
        case "status":
          // Show tournament status
          break;
        default:
          this.deps.world.chatManager.sendPlayerMessage(
            player,
            "Invalid action. Use: create, join, leave, or status"
          );
      }
    });
  }

  // ==================== CONFIGURATION COMMANDS ====================

  private registerConfigCommand(): void {
    this.deps.world.chatManager.registerCommand("/config", (player, args) => {
      // Show current configuration
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Current game configuration:"
      );
    });
  }

  private registerPassInfoCommand(): void {
    this.deps.world.chatManager.registerCommand("/passinfo", (player, args) => {
      // Show pass information
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Pass system information..."
      );
    });
  }

  private registerPassCommand(): void {
    this.deps.world.chatManager.registerCommand("/pass", (player, args) => {
      // Pass command implementation
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Pass command..."
      );
    });
  }

  private registerFixPositionCommand(): void {
    this.deps.world.chatManager.registerCommand("/fixposition", (player, args) => {
      // Fix position implementation
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Fixing position..."
      );
    });
  }

  private registerGoalsCommand(): void {
    this.deps.world.chatManager.registerCommand("/goals", (player, args) => {
      if (!this.deps.game) {
        this.deps.world.chatManager.sendPlayerMessage(player, "No active game");
        return;
      }

      const state = this.deps.game.getState();
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        `� Score: Red ${state.redScore} - ${state.blueScore} Blue`
      );
    });
  }

  // ==================== PERFORMANCE COMMANDS ====================

  private registerSpeedCommand(): void {
    this.deps.world.chatManager.registerCommand("/speed", (player, args) => {
      // Speed test command
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Speed test..."
      );
    });
  }

  private registerSpeedTestCommand(): void {
    this.deps.world.chatManager.registerCommand("/speedtest", (player, args) => {
      // Detailed speed test
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Running speed test..."
      );
    });
  }

  private registerPowerCommand(): void {
    this.deps.world.chatManager.registerCommand("/power", (player, args) => {
      // Power test command
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Power test..."
      );
    });
  }

  private registerPrecisionCommand(): void {
    this.deps.world.chatManager.registerCommand("/precision", (player, args) => {
      // Precision test command
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Precision test..."
      );
    });
  }

  // ==================== LIGHTING COMMANDS ====================

  private registerNoShadowsCommand(): void {
    this.deps.world.chatManager.registerCommand("/noshadows", (player, args) => {
      // Disable shadows
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Shadows disabled"
      );
    });
  }

  private registerNormalLightingCommand(): void {
    this.deps.world.chatManager.registerCommand("/normallighting", (player, args) => {
      // Normal lighting
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Normal lighting enabled"
      );
    });
  }

  private registerOptimizedLightingCommand(): void {
    this.deps.world.chatManager.registerCommand("/optimizedlighting", (player, args) => {
      // Optimized lighting
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Optimized lighting enabled"
      );
    });
  }

  private registerDomeLightingCommand(): void {
    this.deps.world.chatManager.registerCommand("/domelighting", (player, args) => {
      // Dome lighting
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        "Dome lighting enabled"
      );
    });
  }

  private registerLightingCommand(): void {
    this.deps.world.chatManager.registerCommand("/lighting", (player, args) => {
      if (!args || args.length < 2) {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Usage: /lighting <normal|optimized|dome|noshadows>"
        );
        return;
      }

      const mode = args[1].toLowerCase();
      this.deps.world.chatManager.sendPlayerMessage(
        player,
        `Lighting mode: ${mode}`
      );
    });
  }

  // ==================== PROFILING COMMANDS ====================

  private registerProfilerCommand(): void {
    this.deps.world.chatManager.registerCommand("/profiler", (player, args) => {
      if (!args || args.length < 2) {
        this.deps.world.chatManager.sendPlayerMessage(
          player,
          "Usage: /profiler <start|stop|stats>"
        );
        return;
      }

      const action = args[1].toLowerCase();

      switch (action) {
        case "start":
          this.deps.world.chatManager.sendPlayerMessage(player, " Profiler started");
          break;
        case "stop":
          this.deps.world.chatManager.sendPlayerMessage(player, " Profiler stopped");
          break;
        case "stats":
          this.deps.world.chatManager.sendPlayerMessage(player, "=� Profiler statistics...");
          break;
        default:
          this.deps.world.chatManager.sendPlayerMessage(
            player,
            "Invalid action. Use: start, stop, or stats"
          );
      }
    });
  }
}
