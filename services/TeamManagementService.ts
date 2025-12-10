/**
 * TeamManagementService
 *
 * Manages team assignments, player joining/leaving, and team balancing.
 * Decoupled from game state for better separation of concerns.
 */

import type { World } from "hytopia";
import type { EventBus } from "../core/EventBus";

export interface PlayerInfo {
  id: string;
  name: string;
  team: "red" | "blue" | null;
}

export class TeamManagementService {
  private players: Map<string, PlayerInfo> = new Map();
  private maxPlayersPerTeam: number = 6;
  private minPlayersPerTeam: number = 1;

  constructor(
    private world: World,
    private eventBus: EventBus
  ) {}

  /**
   * Add a player to the game (without assigning a team)
   * @param playerId - Player ID
   * @param playerName - Player name
   * @returns Whether the player was successfully added
   */
  public addPlayer(playerId: string, playerName: string): boolean {
    if (this.players.has(playerId)) {
      console.log(`Player ${playerName} (${playerId}) already in game`);
      return false;
    }

    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      team: null
    });

    console.log(`✅ Player ${playerName} joined the game`);
    this.sendTeamCounts();
    return true;
  }

  /**
   * Assign a player to a team
   * @param playerId - Player ID
   * @param team - Team to join
   * @returns Whether the player was successfully assigned
   */
  public assignToTeam(playerId: string, team: "red" | "blue"): boolean {
    let player = this.players.get(playerId);

    // If player doesn't exist, create them
    if (!player) {
      player = {
        id: playerId,
        name: "",
        team: null
      };
      this.players.set(playerId, player);
    }

    // Check if team is full
    if (this.isTeamFull(team)) {
      console.log(`❌ Cannot assign player to ${team} team - team is full`);
      return false;
    }

    const oldTeam = player.team;
    player.team = team;

    console.log(`✅ Player ${player.name || playerId} assigned to ${team} team`);

    // Emit team-changed event
    this.eventBus.emit('team-changed', {
      playerId,
      oldTeam,
      newTeam: team
    });

    // Emit player-joined event if this is first team assignment
    if (!oldTeam) {
      this.eventBus.emit('player-joined', {
        playerId,
        playerName: player.name,
        team
      });
    }

    this.sendTeamCounts();
    return true;
  }

  /**
   * Remove a player from the game
   * @param playerId - Player ID
   */
  public removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    console.log(`👋 Player ${player.name || playerId} left the game`);

    // Emit player-left event
    if (player.team) {
      this.eventBus.emit('player-left', {
        playerId,
        playerName: player.name,
        team: player.team
      });
    }

    this.players.delete(playerId);
    this.sendTeamCounts();
  }

  /**
   * Get a player's team
   * @param playerId - Player ID
   * @returns Team or null if not assigned
   */
  public getPlayerTeam(playerId: string): "red" | "blue" | null {
    return this.players.get(playerId)?.team ?? null;
  }

  /**
   * Get player info
   * @param playerId - Player ID
   * @returns Player info or undefined
   */
  public getPlayer(playerId: string): PlayerInfo | undefined {
    const player = this.players.get(playerId);
    return player ? { ...player } : undefined;
  }

  /**
   * Get all players
   * @returns Map of all players
   */
  public getAllPlayers(): Map<string, PlayerInfo> {
    return new Map(this.players);
  }

  /**
   * Get players on a specific team
   * @param team - Team to get players for
   * @returns Array of players on the team
   */
  public getPlayersOnTeam(team: "red" | "blue"): PlayerInfo[] {
    return Array.from(this.players.values())
      .filter(p => p.team === team)
      .map(p => ({ ...p }));
  }

  /**
   * Get the number of players on a team
   * @param team - Team to count
   * @returns Number of players on the team
   */
  public getTeamPlayerCount(team: "red" | "blue"): number {
    return Array.from(this.players.values()).filter(p => p.team === team).length;
  }

  /**
   * Check if a team is full
   * @param team - Team to check
   * @returns Whether the team is full
   */
  public isTeamFull(team: "red" | "blue"): boolean {
    return this.getTeamPlayerCount(team) >= this.maxPlayersPerTeam;
  }

  /**
   * Check if both teams have minimum required players
   * @returns Whether minimum team requirements are met
   */
  public hasMinimumPlayers(): boolean {
    const redCount = this.getTeamPlayerCount("red");
    const blueCount = this.getTeamPlayerCount("blue");
    return redCount >= this.minPlayersPerTeam && blueCount >= this.minPlayersPerTeam;
  }

  /**
   * Get total number of players with team assignments
   * @returns Number of players on teams
   */
  public getAssignedPlayerCount(): number {
    return Array.from(this.players.values()).filter(p => p.team !== null).length;
  }

  /**
   * Get total number of players (including unassigned)
   * @returns Total player count
   */
  public getTotalPlayerCount(): number {
    return this.players.size;
  }

  /**
   * Set maximum players per team
   * @param max - Maximum players
   */
  public setMaxPlayersPerTeam(max: number): void {
    this.maxPlayersPerTeam = max;
    console.log(`⚙️ Max players per team set to: ${max}`);
    this.sendTeamCounts();
  }

  /**
   * Get maximum players per team
   * @returns Maximum players
   */
  public getMaxPlayersPerTeam(): number {
    return this.maxPlayersPerTeam;
  }

  /**
   * Set minimum players per team
   * @param min - Minimum players
   */
  public setMinPlayersPerTeam(min: number): void {
    this.minPlayersPerTeam = min;
    console.log(`⚙️ Min players per team set to: ${min}`);
  }

  /**
   * Get minimum players per team
   * @returns Minimum players
   */
  public getMinPlayersPerTeam(): number {
    return this.minPlayersPerTeam;
  }

  /**
   * Balance teams by moving players
   * Attempts to even out team sizes
   */
  public balanceTeams(): void {
    const redCount = this.getTeamPlayerCount("red");
    const blueCount = this.getTeamPlayerCount("blue");
    const difference = Math.abs(redCount - blueCount);

    if (difference <= 1) {
      console.log("✅ Teams are already balanced");
      return;
    }

    const largerTeam = redCount > blueCount ? "red" : "blue";
    const smallerTeam = largerTeam === "red" ? "blue" : "red";
    const playersToMove = Math.floor(difference / 2);

    const playersOnLargerTeam = this.getPlayersOnTeam(largerTeam);

    // Move players from larger to smaller team
    for (let i = 0; i < playersToMove && i < playersOnLargerTeam.length; i++) {
      const player = playersOnLargerTeam[i];
      this.assignToTeam(player.id, smallerTeam);
    }

    console.log(`⚖️ Teams balanced: ${playersToMove} players moved from ${largerTeam} to ${smallerTeam}`);
  }

  /**
   * Clear all players
   */
  public clearAllPlayers(): void {
    this.players.clear();
    console.log("🔄 All players cleared");
    this.sendTeamCounts();
  }

  /**
   * Send team counts to all players via data channel
   */
  private sendTeamCounts(): void {
    const redCount = this.getTeamPlayerCount("red");
    const blueCount = this.getTeamPlayerCount("blue");

    this.world.entityManager.getAllPlayerEntities().forEach((player) => {
      player.sendData({
        type: "team-counts",
        redCount,
        blueCount,
        maxPlayers: this.maxPlayersPerTeam,
      });
    });
  }

  /**
   * Get team statistics
   * @returns Team statistics object
   */
  public getTeamStats(): {
    red: { count: number; isFull: boolean };
    blue: { count: number; isFull: boolean };
    total: number;
    assigned: number;
    hasMinimum: boolean;
  } {
    return {
      red: {
        count: this.getTeamPlayerCount("red"),
        isFull: this.isTeamFull("red")
      },
      blue: {
        count: this.getTeamPlayerCount("blue"),
        isFull: this.isTeamFull("blue")
      },
      total: this.getTotalPlayerCount(),
      assigned: this.getAssignedPlayerCount(),
      hasMinimum: this.hasMinimumPlayers()
    };
  }
}
