/**
 * RoomSharedState - Per-Room State Management
 *
 * This is a non-singleton version of SharedState that is instantiated
 * once per room/game instance. Each room has its own isolated state
 * for ball tracking, AI teams, and game state.
 *
 * This enables multiple concurrent soccer matches on the same server.
 */

import { PlayerEntity, Entity } from "hytopia";
import AIPlayerEntity from "../entities/AIPlayerEntity";

type AISystem = 'agent' | 'behaviortree';

// Forward declaration to avoid circular imports
interface GameState {
    isHalftime: boolean;
    status: string;
}

// Ball stationary detection system to prevent balls sitting idle
interface BallStationaryTracker {
    lastPosition: { x: number; y: number; z: number } | null;
    lastMoveTime: number;
    isStationary: boolean;
    stationaryDuration: number;
}

/**
 * RoomSharedState - Instance-based state for each game room
 * Unlike SharedState singleton, this is created per-room for isolation
 */
export class RoomSharedState {
    private attachedPlayer: PlayerEntity | null = null;
    private soccerBall: Entity | null = null;
    private lastPlayerWithBall: PlayerEntity | null = null;
    private activePlayer: PlayerEntity | null = null;
    private redAITeam: AIPlayerEntity[] = [];
    private blueAITeam: AIPlayerEntity[] = [];
    private ballHasMovedFromSpawn: boolean = false;
    private _aiSystem: AISystem = 'agent';
    private gameState: GameState | null = null;

    // Ball stationary detection system
    private ballStationaryTracker: BallStationaryTracker = {
        lastPosition: null,
        lastMoveTime: Date.now(),
        isStationary: false,
        stationaryDuration: 0
    };

    // Configuration for stationary ball detection
    private readonly STATIONARY_THRESHOLD = 1.0;
    private readonly STATIONARY_TIME_LIMIT = 3000;
    private readonly STATIONARY_CHECK_INTERVAL = 1000;

    // Room identification
    private roomId: string;

    constructor(roomId: string = 'default') {
        this.roomId = roomId;
        console.log(`🏠 RoomSharedState created for room: ${roomId}`);
    }

    public getRoomId(): string {
        return this.roomId;
    }

    public setAttachedPlayer(player: PlayerEntity | null) {
        if (player == null) {
            // Clear ball possession for previous player
            if (this.attachedPlayer && 'setBallPossession' in this.attachedPlayer) {
                (this.attachedPlayer as any).setBallPossession(false);
            }

            this.lastPlayerWithBall = this.attachedPlayer;
            this.attachedPlayer = null;

            // Reset ball stationary tracking when ball becomes loose
            this.resetBallStationaryStatus();
        } else {
            // Set ball possession for new player
            if ('setBallPossession' in player) {
                (player as any).setBallPossession(true);
            }

            // Clear possession for previous player if different
            if (this.attachedPlayer && this.attachedPlayer !== player && 'setBallPossession' in this.attachedPlayer) {
                (this.attachedPlayer as any).setBallPossession(false);
            }

            this.attachedPlayer = player;
            if (this.lastPlayerWithBall == null) {
                this.lastPlayerWithBall = player;
            }

            // Reset ball stationary tracking when ball is picked up
            this.resetBallStationaryStatus();
        }
    }

    public getAttachedPlayer(): PlayerEntity | null {
        return this.attachedPlayer;
    }

    public setSoccerBall(ball: Entity) {
        this.soccerBall = ball;
    }

    public getSoccerBall(): Entity | null {
        return this.soccerBall;
    }

    public getLastPlayerWithBall(): PlayerEntity | null {
        return this.lastPlayerWithBall;
    }

    public setActivePlayer(player: PlayerEntity | null) {
        this.activePlayer = player;
    }

    public getActivePlayer(): PlayerEntity | null {
        return this.activePlayer;
    }

    public addAIToTeam(aiPlayer: AIPlayerEntity, team: 'red' | 'blue') {
        if (team === 'red') {
            if (!this.redAITeam.includes(aiPlayer)) {
                this.redAITeam.push(aiPlayer);
            }
        } else {
            if (!this.blueAITeam.includes(aiPlayer)) {
                this.blueAITeam.push(aiPlayer);
            }
        }
    }

    public removeAIFromTeam(aiPlayer: AIPlayerEntity, team: 'red' | 'blue') {
        if (team === 'red') {
            this.redAITeam = this.redAITeam.filter(p => p !== aiPlayer);
        } else {
            this.blueAITeam = this.blueAITeam.filter(p => p !== aiPlayer);
        }
    }

    public getRedAITeam(): AIPlayerEntity[] {
        return this.redAITeam;
    }

    public getBlueAITeam(): AIPlayerEntity[] {
        return this.blueAITeam;
    }

    public getAITeammates(player: AIPlayerEntity): AIPlayerEntity[] {
        const teamList = player.team === 'red' ? this.redAITeam : this.blueAITeam;
        return teamList.filter(p => p !== player);
    }

    public getAllAIPlayers(): AIPlayerEntity[] {
        return [...this.redAITeam, ...this.blueAITeam];
    }

    // --- Ball Movement Tracking ---
    public setBallHasMoved() {
        if (!this.ballHasMovedFromSpawn) {
            // console.log(`[Room ${this.roomId}] Ball has moved from spawn for the first time.`);
            this.ballHasMovedFromSpawn = true;
        }
    }

    public getBallHasMoved(): boolean {
        return this.ballHasMovedFromSpawn;
    }

    public resetBallMovementFlag() {
        // console.log(`[Room ${this.roomId}] Resetting ball movement flag.`);
        this.ballHasMovedFromSpawn = false;
    }

    // --- AI System Management ---
    public setAISystem(system: AISystem) {
        this._aiSystem = system;
        console.log(`[Room ${this.roomId}] AI system set to: ${system}`);
    }

    public getAISystem(): AISystem {
        return this._aiSystem;
    }

    // --- Game State Management ---
    public setGameState(gameState: GameState | null) {
        this.gameState = gameState;
    }

    public getGameState(): GameState | null {
        return this.gameState;
    }

    // --- Ball Stationary Detection System ---
    public updateBallStationaryStatus(ballPosition: { x: number; y: number; z: number }): void {
        const currentTime = Date.now();

        // Skip tracking if ball is possessed by a player
        if (this.attachedPlayer !== null) {
            this.resetBallStationaryStatus();
            return;
        }

        // Skip tracking during halftime or non-playing states
        const gameState = this.getGameState();
        if (gameState && (gameState.isHalftime || gameState.status !== 'playing')) {
            this.resetBallStationaryStatus();
            return;
        }

        if (this.ballStationaryTracker.lastPosition === null) {
            this.ballStationaryTracker.lastPosition = { ...ballPosition };
            this.ballStationaryTracker.lastMoveTime = currentTime;
            this.ballStationaryTracker.isStationary = false;
            this.ballStationaryTracker.stationaryDuration = 0;
            return;
        }

        // Calculate distance moved since last check
        const lastPos = this.ballStationaryTracker.lastPosition;
        const distanceMoved = Math.sqrt(
            Math.pow(ballPosition.x - lastPos.x, 2) +
            Math.pow(ballPosition.y - lastPos.y, 2) +
            Math.pow(ballPosition.z - lastPos.z, 2)
        );

        if (distanceMoved > this.STATIONARY_THRESHOLD) {
            this.ballStationaryTracker.lastPosition = { ...ballPosition };
            this.ballStationaryTracker.lastMoveTime = currentTime;
            this.ballStationaryTracker.isStationary = false;
            this.ballStationaryTracker.stationaryDuration = 0;
        } else {
            this.ballStationaryTracker.stationaryDuration = currentTime - this.ballStationaryTracker.lastMoveTime;

            if (this.ballStationaryTracker.stationaryDuration >= this.STATIONARY_TIME_LIMIT) {
                if (!this.ballStationaryTracker.isStationary) {
                    this.ballStationaryTracker.isStationary = true;
                    console.log(`[Room ${this.roomId}] Ball stationary for ${this.ballStationaryTracker.stationaryDuration}ms at (${ballPosition.x.toFixed(1)}, ${ballPosition.z.toFixed(1)})`);
                }
            }
        }
    }

    public isBallStationary(): boolean {
        return this.ballStationaryTracker.isStationary;
    }

    public getBallStationaryDuration(): number {
        return this.ballStationaryTracker.stationaryDuration;
    }

    public resetBallStationaryStatus(): void {
        this.ballStationaryTracker.lastPosition = null;
        this.ballStationaryTracker.lastMoveTime = Date.now();
        this.ballStationaryTracker.isStationary = false;
        this.ballStationaryTracker.stationaryDuration = 0;
    }

    public getTrackedBallPosition(): { x: number; y: number; z: number } | null {
        return this.ballStationaryTracker.lastPosition;
    }

    // --- Room Cleanup ---
    /**
     * Clean up all state when room is destroyed
     */
    public cleanup(): void {
        console.log(`🧹 Cleaning up RoomSharedState for room: ${this.roomId}`);

        this.attachedPlayer = null;
        this.soccerBall = null;
        this.lastPlayerWithBall = null;
        this.activePlayer = null;
        this.redAITeam = [];
        this.blueAITeam = [];
        this.ballHasMovedFromSpawn = false;
        this.gameState = null;
        this.resetBallStationaryStatus();
    }
}

export default RoomSharedState;
