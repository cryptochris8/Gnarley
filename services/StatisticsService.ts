/**
 * StatisticsService
 *
 * Manages match and player statistics tracking and UI data formatting.
 * Decoupled from game state for better separation of concerns.
 */

import type { World } from "hytopia";
import type { EventBus } from "../core/EventBus";
import SoccerPlayerEntity from "../entities/SoccerPlayerEntity";

export interface TeamStats {
  goals: number;
  shots: number;
  passes: number;
  tackles: number;
  possession: number;
  saves: number;
}

export interface PlayerStats {
  name: string;
  team: "red" | "blue";
  role?: string;
  goals: number;
  tackles: number;
  passes: number;
  shots: number;
  saves: number;
  distanceTraveled: number;
}

export interface MatchStats {
  redTeam: TeamStats;
  blueTeam: TeamStats;
}

export class StatisticsService {
  private matchStats: MatchStats = {
    redTeam: { goals: 0, shots: 0, passes: 0, tackles: 0, possession: 0, saves: 0 },
    blueTeam: { goals: 0, shots: 0, passes: 0, tackles: 0, possession: 0, saves: 0 }
  };

  constructor(
    private world: World,
    private eventBus: EventBus
  ) {}

  /**
   * Collect current player statistics from all players
   * @returns Array of player statistics
   */
  public collectPlayerStats(): PlayerStats[] {
    const stats: PlayerStats[] = [];

    this.world.entityManager.getAllPlayerEntities().forEach((entity) => {
      if (entity instanceof SoccerPlayerEntity) {
        const playerStats = entity.getPlayerStats();
        stats.push({
          name: entity.player.username,
          team: entity.team,
          role: entity.role || (entity as any).aiRole,
          goals: entity.getGoalsScored(),
          tackles: playerStats.tackles,
          passes: playerStats.passes,
          shots: playerStats.shots,
          saves: playerStats.saves,
          distanceTraveled: Math.round(playerStats.distanceTraveled)
        });
      }
    });

    return stats;
  }

  /**
   * Collect team statistics for a specific team
   * @param team - Team to collect stats for
   * @returns Team statistics
   */
  public collectTeamStats(team: "red" | "blue"): TeamStats {
    const teamPlayers = this.world.entityManager
      .getAllPlayerEntities()
      .filter((entity) => entity instanceof SoccerPlayerEntity && entity.team === team)
      .map((player) => (player as SoccerPlayerEntity).getPlayerStats());

    return {
      goals: teamPlayers.reduce((sum, p) => sum + p.goals, 0),
      tackles: teamPlayers.reduce((sum, p) => sum + p.tackles, 0),
      passes: teamPlayers.reduce((sum, p) => sum + p.passes, 0),
      shots: teamPlayers.reduce((sum, p) => sum + p.shots, 0),
      saves: teamPlayers.reduce((sum, p) => sum + p.saves, 0),
      possession: teamPlayers.reduce((sum, p) => sum + p.saves, 0) // Placeholder
    };
  }

  /**
   * Update match statistics from current game state
   */
  public updateMatchStats(): void {
    this.matchStats.redTeam = this.collectTeamStats("red");
    this.matchStats.blueTeam = this.collectTeamStats("blue");

    // Emit stats-updated event
    this.eventBus.emit('stats-updated', { stats: this.matchStats });
  }

  /**
   * Get current match statistics
   * @returns Current match statistics
   */
  public getMatchStats(): MatchStats {
    return {
      redTeam: { ...this.matchStats.redTeam },
      blueTeam: { ...this.matchStats.blueTeam }
    };
  }

  /**
   * Show half-time statistics to all players
   * @param half - Half number that just ended
   * @param redScore - Red team score
   * @param blueScore - Blue team score
   */
  public showHalfStats(half: number, redScore: number, blueScore: number): void {
    const playerStats = this.collectPlayerStats();

    // Send half stats to all players
    this.sendDataToAllPlayers({
      type: "half-stats",
      half,
      redScore,
      blueScore,
      playerStats,
      matchStats: this.getMatchStats()
    });

    // Emit half-stats-shown event
    this.eventBus.emit('half-stats-shown', {
      half,
      stats: playerStats
    });

    console.log(`📊 Half ${half} stats shown to all players`);
  }

  /**
   * Show regulation time statistics (after 2 halves)
   * @param redScore - Red team score
   * @param blueScore - Blue team score
   */
  public showRegulationStats(redScore: number, blueScore: number): void {
    const playerStats = this.collectPlayerStats();

    // Send regulation stats to all players
    this.sendDataToAllPlayers({
      type: "regulation-stats",
      redScore,
      blueScore,
      playerStats,
      matchStats: this.getMatchStats()
    });

    console.log("📊 Regulation time stats shown to all players");
  }

  /**
   * Show final match statistics
   * @param winner - Winning team or 'tie'
   * @param redScore - Red team score
   * @param blueScore - Blue team score
   */
  public showFinalStats(winner: "red" | "blue" | "tie", redScore: number, blueScore: number): void {
    const playerStats = this.collectPlayerStats();
    const finalStats = this.getMatchStats();

    // Send final stats to all players
    this.sendDataToAllPlayers({
      type: "final-stats",
      winner,
      redScore,
      blueScore,
      playerStats,
      matchStats: finalStats
    });

    console.log(`📊 Final match stats shown - Winner: ${winner}`);
    console.log(`📊 Final Score: Red ${redScore} - Blue ${blueScore}`);
  }

  /**
   * Send player stats update to all players (for live UI updates)
   */
  public sendPlayerStatsUpdate(): void {
    const playerStats = this.collectPlayerStats();

    this.sendDataToAllPlayers({
      type: "player-stats-update",
      playerStats
    });
  }

  /**
   * Reset all match statistics
   */
  public resetMatchStats(): void {
    this.matchStats = {
      redTeam: { goals: 0, shots: 0, passes: 0, tackles: 0, possession: 0, saves: 0 },
      blueTeam: { goals: 0, shots: 0, passes: 0, tackles: 0, possession: 0, saves: 0 }
    };

    console.log("🔄 Match statistics reset");
  }

  /**
   * Get top scorer
   * @returns Top scorer info or null
   */
  public getTopScorer(): { name: string; team: "red" | "blue"; goals: number } | null {
    const playerStats = this.collectPlayerStats();

    if (playerStats.length === 0) {
      return null;
    }

    const topScorer = playerStats.reduce((prev, current) =>
      current.goals > prev.goals ? current : prev
    );

    if (topScorer.goals === 0) {
      return null;
    }

    return {
      name: topScorer.name,
      team: topScorer.team,
      goals: topScorer.goals
    };
  }

  /**
   * Get player with most tackles
   * @returns Top tackler info or null
   */
  public getTopTackler(): { name: string; team: "red" | "blue"; tackles: number } | null {
    const playerStats = this.collectPlayerStats();

    if (playerStats.length === 0) {
      return null;
    }

    const topTackler = playerStats.reduce((prev, current) =>
      current.tackles > prev.tackles ? current : prev
    );

    if (topTackler.tackles === 0) {
      return null;
    }

    return {
      name: topTackler.name,
      team: topTackler.team,
      tackles: topTackler.tackles
    };
  }

  /**
   * Get player with most passes
   * @returns Top passer info or null
   */
  public getTopPasser(): { name: string; team: "red" | "blue"; passes: number } | null {
    const playerStats = this.collectPlayerStats();

    if (playerStats.length === 0) {
      return null;
    }

    const topPasser = playerStats.reduce((prev, current) =>
      current.passes > prev.passes ? current : prev
    );

    if (topPasser.passes === 0) {
      return null;
    }

    return {
      name: topPasser.name,
      team: topPasser.team,
      passes: topPasser.passes
    };
  }

  /**
   * Get match summary for display
   * @param redScore - Red team score
   * @param blueScore - Blue team score
   * @returns Match summary object
   */
  public getMatchSummary(redScore: number, blueScore: number): {
    winner: "red" | "blue" | "tie";
    redScore: number;
    blueScore: number;
    topScorer: { name: string; team: "red" | "blue"; goals: number } | null;
    topTackler: { name: string; team: "red" | "blue"; tackles: number } | null;
    topPasser: { name: string; team: "red" | "blue"; passes: number } | null;
    matchStats: MatchStats;
  } {
    let winner: "red" | "blue" | "tie" = "tie";
    if (redScore > blueScore) winner = "red";
    else if (blueScore > redScore) winner = "blue";

    return {
      winner,
      redScore,
      blueScore,
      topScorer: this.getTopScorer(),
      topTackler: this.getTopTackler(),
      topPasser: this.getTopPasser(),
      matchStats: this.getMatchStats()
    };
  }

  /**
   * Send data to all players via data channel
   * @param data - Data to send
   */
  private sendDataToAllPlayers(data: any): void {
    this.world.entityManager.getAllPlayerEntities().forEach((player) => {
      player.sendData(data);
    });
  }

  /**
   * Log statistics summary to console
   */
  public logStatsSummary(): void {
    const stats = this.getMatchStats();

    console.log("═══════════════════════════════");
    console.log("📊 MATCH STATISTICS SUMMARY");
    console.log("═══════════════════════════════");
    console.log(`RED TEAM:`);
    console.log(`  Goals: ${stats.redTeam.goals}`);
    console.log(`  Shots: ${stats.redTeam.shots}`);
    console.log(`  Passes: ${stats.redTeam.passes}`);
    console.log(`  Tackles: ${stats.redTeam.tackles}`);
    console.log(`  Saves: ${stats.redTeam.saves}`);
    console.log("");
    console.log(`BLUE TEAM:`);
    console.log(`  Goals: ${stats.blueTeam.goals}`);
    console.log(`  Shots: ${stats.blueTeam.shots}`);
    console.log(`  Passes: ${stats.blueTeam.passes}`);
    console.log(`  Tackles: ${stats.blueTeam.tackles}`);
    console.log(`  Saves: ${stats.blueTeam.saves}`);
    console.log("═══════════════════════════════");

    const topScorer = this.getTopScorer();
    const topTackler = this.getTopTackler();
    const topPasser = this.getTopPasser();

    if (topScorer) {
      console.log(`⚽ Top Scorer: ${topScorer.name} (${topScorer.goals} goals)`);
    }
    if (topTackler) {
      console.log(`🛡️ Top Tackler: ${topTackler.name} (${topTackler.tackles} tackles)`);
    }
    if (topPasser) {
      console.log(`🎯 Top Passer: ${topPasser.name} (${topPasser.passes} passes)`);
    }
  }
}
