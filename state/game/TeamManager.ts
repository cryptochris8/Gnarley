// Team assignment and player tracking

export interface Player {
  id: string;
  name: string;
  team: "red" | "blue" | null;
}

export class TeamManager {
  private players: Map<string, Player>;
  private maxPlayersPerTeam: number;
  private minPlayersPerTeam: number;

  constructor(maxPlayersPerTeam: number = 6, minPlayersPerTeam: number = 1) {
    this.players = new Map();
    this.maxPlayersPerTeam = maxPlayersPerTeam;
    this.minPlayersPerTeam = minPlayersPerTeam;
    console.log("TeamManager initialized");
  }

  /**
   * Add a player to the game
   * @param playerId - Player ID
   * @param playerName - Player name
   */
  addPlayer(playerId: string, playerName: string): void {
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      team: null
    });
  }

  /**
   * Remove a player from the game
   * @param playerId - Player ID
   */
  removePlayer(playerId: string): void {
    this.players.delete(playerId);
  }

  /**
   * Assign player to a team
   * @param playerId - Player ID
   * @param team - Team to assign to
   * @returns True if successful
   */
  assignTeam(playerId: string, team: "red" | "blue"): boolean {
    let player = this.players.get(playerId);
    if (!player) {
      player = {
        id: playerId,
        name: "",
        team: null
      };
      this.players.set(playerId, player);
    }

    const teamCount = this.getTeamPlayerCount(team);
    if (teamCount >= this.maxPlayersPerTeam) {
      return false;
    }

    player.team = team;
    return true;
  }

  /**
   * Get player's team
   * @param playerId - Player ID
   * @returns Player's team or null
   */
  getPlayerTeam(playerId: string): "red" | "blue" | null {
    return this.players.get(playerId)?.team ?? null;
  }

  /**
   * Get number of players on a team
   * @param team - Team to count
   * @returns Number of players
   */
  getTeamPlayerCount(team: "red" | "blue"): number {
    return Array.from(this.players.values()).filter(
      (p) => p.team === team
    ).length;
  }

  /**
   * Check if team is full
   * @param team - Team to check
   * @returns True if team is full
   */
  isTeamFull(team: "red" | "blue"): boolean {
    return this.getTeamPlayerCount(team) >= this.maxPlayersPerTeam;
  }

  /**
   * Check if enough players to start game
   * @returns True if enough players
   */
  hasEnoughPlayers(): boolean {
    const redCount = this.getTeamPlayerCount("red");
    const blueCount = this.getTeamPlayerCount("blue");
    const totalPlayers = redCount + blueCount;

    // Single-player mode: need at least 1 human player total
    if (totalPlayers === 1) {
      return true;
    }

    // Multiplayer mode: need at least minPlayersPerTeam on each team
    return redCount >= this.minPlayersPerTeam && blueCount >= this.minPlayersPerTeam;
  }

  /**
   * Get all players
   * @returns Map of players
   */
  getAllPlayers(): Map<string, Player> {
    return this.players;
  }

  /**
   * Get team counts
   * @returns Object with red and blue team counts
   */
  getTeamCounts(): { red: number; blue: number } {
    return {
      red: this.getTeamPlayerCount("red"),
      blue: this.getTeamPlayerCount("blue")
    };
  }

  /**
   * Get max players per team
   * @returns Max players per team
   */
  getMaxPlayersPerTeam(): number {
    return this.maxPlayersPerTeam;
  }

  /**
   * Set max players per team
   * @param maxPlayers - New max players per team
   */
  setMaxPlayersPerTeam(maxPlayers: number): void {
    this.maxPlayersPerTeam = maxPlayers;
    console.log(`Updated max players per team to: ${maxPlayers}`);
  }

  /**
   * Reset all player teams
   */
  reset(): void {
    this.players.clear();
    console.log("Team manager reset");
  }
}
