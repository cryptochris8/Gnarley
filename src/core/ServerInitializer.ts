/**
 * ServerInitializer - Centralized server initialization
 *
 * Handles all server setup including:
 * - Map loading and lighting configuration
 * - Feature manager initialization
 * - Performance systems setup
 * - Audio system initialization
 * - Physical lobby initialization
 * - Event handler registration
 *
 * Note: The lobby world does NOT create a SoccerGame or soccer ball.
 * Each game room creates its own via RoomManager.createRoom().
 *
 * Extracted from index.ts (lines 1-362) to reduce file size and improve modularity.
 */

import { World, Audio } from "hytopia";
import worldMap from "../../assets/maps/soccer-field-urban.json";
import { SoccerGame } from "../../state/gameState";
import { AudioManager } from "./AudioManager";
import createSoccerBall from "../../utils/ball";
import { logger } from "../../utils/GameLogger";
import sharedState from "../../state/sharedState";
import spectatorMode from "../../utils/observerMode";
import { FIFACrowdManager } from "../../utils/fifaCrowdManager";
import { PickupGameManager } from "../../state/pickupGameManager";
import { TournamentManager } from "../../state/tournamentManager";
import { ArcadeEnhancementManager } from "../../state/arcadeEnhancements";
import { PerformanceProfiler } from "../../utils/performanceProfiler";
import { PerformanceOptimizer } from "../../utils/performanceOptimizations";
import { PlayerEventHandlers } from "../handlers/PlayerEventHandlers";
import { UIEventHandlers } from "../handlers/UIEventHandlers";
import { ChatCommandHandlers } from "../handlers/ChatCommandHandlers";
import { GameEventHandlers } from "../handlers/GameEventHandlers";
import AIPlayerEntity from "../../entities/AIPlayerEntity";
import { spawnAIPlayers as spawnAIPlayersUtil } from "../../utils/aiSpawner";
import { PhysicalLobby } from "../../lobby/PhysicalLobby";

/**
 * Return type for initialized server systems
 */
export interface ServerSystems {
  // Core game systems (for lobby - rooms create their own)
  game: SoccerGame | null; // null in lobby mode
  audioManager: AudioManager;
  sharedState: typeof sharedState;

  // Feature managers (shared across rooms via dependency injection)
  arcadeManager: ArcadeEnhancementManager;
  pickupManager: PickupGameManager;
  tournamentManager: TournamentManager;
  fifaCrowdManager: FIFACrowdManager;
  spectatorMode: typeof spectatorMode;

  // Performance systems
  performanceProfiler: PerformanceProfiler;
  performanceOptimizer: PerformanceOptimizer;

  // Event handlers
  playerEventHandlers: PlayerEventHandlers;
  uiEventHandlers: UIEventHandlers;
  chatCommandHandlers: ChatCommandHandlers;
  gameEventHandlers: GameEventHandlers;

  // Mutable game state
  aiPlayers: AIPlayerEntity[];
  musicStarted: { value: boolean };

  // Physical lobby system
  physicalLobby: PhysicalLobby;

  // Room system dependencies (exported for RoomManager)
  SoccerGameClass: typeof SoccerGame;
  createSoccerBallFn: typeof createSoccerBall;
  spawnAIPlayersFn: typeof spawnAIPlayersUtil;
  mapData: any;
}

export class ServerInitializer {
  private world: World;

  constructor(world: World) {
    this.world = world;
  }

  /**
   * Initialize all server systems and return them
   */
  initialize(): ServerSystems {
    logger.info("Starting soccer server initialization...");

    // ========================================
    // STEP 1: Load Map and Configure Lighting
    // ========================================
    this.setupMapAndLighting();

    // ========================================
    // STEP 2: Initialize Core Systems (lobby has no game/ball)
    // ========================================
    // Lobby world does not need a SoccerGame or soccer ball.
    // Each game room creates its own via RoomManager.createRoom().
    const game: SoccerGame | null = null;
    const aiPlayers: AIPlayerEntity[] = [];
    logger.info("Lobby mode: no game ball or SoccerGame created");

    // Initialize audio manager
    const audioManager = new AudioManager(this.world);

    // ========================================
    // STEP 3: Initialize Feature Managers
    // ========================================
    const arcadeManager = new ArcadeEnhancementManager(this.world);
    (this.world as any)._arcadeManager = arcadeManager;

    const pickupManager = new PickupGameManager(this.world);
    (this.world as any)._pickupManager = pickupManager;

    const tournamentManager = new TournamentManager(this.world);
    (this.world as any)._tournamentManager = tournamentManager;

    const fifaCrowdManager = new FIFACrowdManager(this.world);

    // spectatorMode is already imported as a singleton from utils/observerMode

    // ========================================
    // STEP 4: Initialize Performance Systems
    // ========================================
    const performanceProfiler = new PerformanceProfiler(this.world, {
      enabled: true, // Enable for GPU memory monitoring
      sampleInterval: 2000, // Less frequent sampling to reduce overhead
      maxSamples: 30, // Smaller buffer for memory efficiency
      logInterval: 60000, // Log every minute
      trackMemory: true,
    });
    (this.world as any)._performanceProfiler = performanceProfiler;
    performanceProfiler.start(); // Start profiling immediately

    const performanceOptimizer = new PerformanceOptimizer("HIGH_PERFORMANCE");
    logger.info(
      "Performance optimizer initialized in HIGH_PERFORMANCE mode"
    );

    // ========================================
    // STEP 5: Server Memory Management
    // ========================================
    this.setupServerMemoryManagement();

    logger.info("Lobby initialized successfully with GPU memory optimizations!");

    // ========================================
    // STEP 6: Music System
    // ========================================
    logger.info("Audio system initialized and ready");
    const musicStarted = { value: false }; // Wrapped in object for mutability

    // ========================================
    // STEP 7: Initialize Physical Lobby
    // ========================================
    const physicalLobby = new PhysicalLobby(this.world);
    physicalLobby.initialize();
    logger.info("Physical lobby initialized with portals");

    // ========================================
    // STEP 8: Initialize Event Handlers
    // ========================================

    // Helper function for AI spawning (needed by UIEventHandlers)
    const spawnAIPlayers = async (team?: string): Promise<void> => {
      const playerTeam = (team as "red" | "blue") || "red";
      await spawnAIPlayersUtil(this.world, playerTeam, aiPlayers, sharedState);
    };

    // Create UI event handlers
    const uiEventHandlers = new UIEventHandlers({
      world: this.world,
      game,
      aiPlayers,
      audioManager,
      sharedState,
      spectatorMode,
      fifaCrowdManager,
      pickupManager,
      tournamentManager,
      spawnAIPlayers,
    });

    // Create player event handlers
    const playerEventHandlers = new PlayerEventHandlers({
      world: this.world,
      game,
      aiPlayers,
      audioManager,
      sharedState,
      spectatorMode,
      fifaCrowdManager,
      pickupManager,
      uiEventHandlers,
      musicStarted,
      physicalLobby,
    });

    // Create chat command handlers
    const chatCommandHandlers = new ChatCommandHandlers({
      world: this.world,
      game,
      aiPlayers,
      audioManager,
      sharedState,
      spectatorMode,
      fifaCrowdManager,
      pickupManager,
      tournamentManager,
      arcadeManager,
    });

    // Create game event handlers
    const gameEventHandlers = new GameEventHandlers({
      world: this.world,
      game,
      aiPlayers,
      sharedState,
    });

    // Register all event handlers
    playerEventHandlers.registerAll();
    chatCommandHandlers.registerAll();
    gameEventHandlers.registerAll();

    logger.info("Server initialization complete!");

    // ========================================
    // Return all initialized systems
    // ========================================
    return {
      game, // null in lobby mode
      audioManager,
      sharedState,
      arcadeManager,
      pickupManager,
      tournamentManager,
      fifaCrowdManager,
      spectatorMode,
      performanceProfiler,
      performanceOptimizer,
      playerEventHandlers,
      uiEventHandlers,
      chatCommandHandlers,
      gameEventHandlers,
      aiPlayers,
      musicStarted,
      physicalLobby,

      // Export dependencies for RoomManager to create room instances
      SoccerGameClass: SoccerGame,
      createSoccerBallFn: createSoccerBall,
      spawnAIPlayersFn: spawnAIPlayersUtil,
      mapData: worldMap,
    };
  }

  /**
   * Load map and configure stadium lighting
   */
  private setupMapAndLighting(): void {
    logger.info("Loading soccer stadium...");
    this.world.loadMap(worldMap);
    logger.info("Soccer map loaded");

    // Set up enhanced lighting for the stadium
    this.world.setDirectionalLightIntensity(0.6);
    this.world.setDirectionalLightPosition({ x: 0, y: 300, z: 0 });
    this.world.setDirectionalLightColor({ r: 255, g: 248, b: 235 });
    this.world.setAmbientLightIntensity(1.2);
    this.world.setAmbientLightColor({ r: 250, g: 250, b: 255 });
    logger.info("Enhanced stadium lighting configured");
  }

  /**
   * Setup server-side memory management with periodic garbage collection
   */
  private setupServerMemoryManagement(): void {
    // Force garbage collection every 30 seconds to free up server memory
    setInterval(() => {
      if (typeof global.gc === "function") {
        global.gc();
        logger.debug("Forced server garbage collection to free memory");
      }
    }, 30000);

    logger.info("Server memory management enabled");
  }
}
